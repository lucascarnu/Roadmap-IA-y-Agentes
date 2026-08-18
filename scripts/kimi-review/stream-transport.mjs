import https from "node:https";
import { randomUUID } from "node:crypto";

import { sanitize } from "./sanitize.mjs";
import { assembleReport } from "./report.mjs";

export const OUTPUT_TOKEN_PARAMETER = "max_completion_tokens";
export const DEFAULT_MAX_COMPLETION_TOKENS = 32768;

export const STREAM_TIMEOUTS = Object.freeze({
  connectMs: 10_000,
  firstEventMs: 180_000,
  idleMs: 60_000,
  totalMs: 1_200_000,
});

export const STREAM_TIMEOUT_CODES = Object.freeze({
  connect: "CONNECT_TIMEOUT",
  firstEvent: "FIRST_EVENT_TIMEOUT",
  idle: "IDLE_TIMEOUT",
  total: "TOTAL_TIMEOUT",
});

export class StreamTimeoutError extends Error {
  constructor(code, timeoutMs) {
    super(`${code} after ${timeoutMs} ms`);
    this.name = "StreamTimeoutError";
    this.code = code;
    this.timeoutMs = timeoutMs;
  }
}

function eventFromBlock(block) {
  const lines = block.split(/\r?\n/);
  const data = [];
  let hasComment = false;
  for (const line of lines) {
    if (line.startsWith(":")) {
      hasComment = true;
      continue;
    }
    if (line === "data" || line.startsWith("data:")) {
      let value = line === "data" ? "" : line.slice(5);
      if (value.startsWith(" ")) value = value.slice(1);
      data.push(value);
    }
  }
  if (data.length === 0) return hasComment ? { type: "comment" } : null;
  const raw = data.join("\n");
  if (raw === "[DONE]") return { type: "done", raw };
  try {
    return { type: "json", raw, value: JSON.parse(raw) };
  } catch (error) {
    return { type: "malformed", raw, error: sanitize(error) };
  }
}

export function createSseParser() {
  const decoder = new TextDecoder();
  let buffer = "";

  function drain(final = false) {
    const events = [];
    let match;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const block = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      if (block) {
        const event = eventFromBlock(block);
        if (event) events.push(event);
      }
    }
    if (final && buffer) {
      const event = eventFromBlock(buffer);
      if (event) events.push(event);
      buffer = "";
    }
    return events;
  }

  return {
    push(chunk) {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      return drain(false);
    },
    end() {
      buffer += decoder.decode();
      return drain(true);
    },
  };
}

function headersToObject(headers) {
  if (!headers) return {};
  if (typeof headers.entries === "function") return Object.fromEntries(headers.entries());
  return { ...headers };
}

function headerValue(headers, name) {
  const wanted = name.toLowerCase();
  const entry = Object.entries(headersToObject(headers)).find(([key]) => key.toLowerCase() === wanted);
  return entry ? String(entry[1]) : "";
}

function defaultScheduler() {
  return {
    now: () => Date.now(),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (id) => clearTimeout(id),
  };
}

function raceTimeout(promise, phaseMs, phaseCode, totalDeadline, scheduler) {
  const remaining = totalDeadline - scheduler.now();
  if (remaining <= 0) return Promise.reject(new StreamTimeoutError(STREAM_TIMEOUT_CODES.total, 0));
  const useTotal = remaining <= phaseMs;
  const timeoutMs = useTotal ? remaining : phaseMs;
  const code = useTotal ? STREAM_TIMEOUT_CODES.total : phaseCode;
  return new Promise((resolve, reject) => {
    const timer = scheduler.setTimeout(() => reject(new StreamTimeoutError(code, timeoutMs)), timeoutMs);
    Promise.resolve(promise).then(
      (value) => { scheduler.clearTimeout(timer); resolve(value); },
      (error) => { scheduler.clearTimeout(timer); reject(error); },
    );
  });
}

export function createHttpsRequestFactory() {
  return ({ endpoint, headers, body }) => {
    let resolveConnected;
    let rejectConnected;
    let resolveResponse;
    let rejectResponse;
    const connected = new Promise((resolve, reject) => { resolveConnected = resolve; rejectConnected = reject; });
    const response = new Promise((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
    response.catch(() => {});
    const url = new URL(endpoint);
    const request = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers,
    });
    request.once("socket", (socket) => {
      if (!socket.connecting) resolveConnected();
      else socket.once("secureConnect", resolveConnected);
      socket.once("error", rejectConnected);
    });
    request.once("response", (incoming) => {
      resolveResponse({ status: incoming.statusCode, headers: incoming.headers, body: incoming });
    });
    request.once("error", (error) => {
      rejectConnected(error);
      rejectResponse(error);
    });
    request.end(body);
    return { connected, response, abort: (error) => request.destroy(error) };
  };
}

function validateFinding(finding) {
  const impacts = new Set(["M1", "M2", "M3", "O"]);
  const evidence = new Set(["SETTLED", "NEEDS_EVIDENCE", "UNVERIFIABLE"]);
  return finding && typeof finding === "object" && !Array.isArray(finding)
    && impacts.has(finding.impact)
    && evidence.has(finding.evidence_status)
    && typeof finding.origin === "string"
    && (finding.file === null || typeof finding.file === "string")
    && (finding.line === null || Number.isInteger(finding.line))
    && typeof finding.issue === "string";
}

export function validateReviewContract(review, expectedHead) {
  const errors = [];
  if (!review || typeof review !== "object" || Array.isArray(review)) errors.push("REVIEW_NOT_OBJECT");
  else {
    if (review.head !== expectedHead) errors.push("HEAD_MISMATCH");
    if (!["APROBADO", "CAMBIOS_REQUERIDOS"].includes(review.verdict)) errors.push("VERDICT_INVALID");
    if (!Array.isArray(review.findings)) errors.push("FINDINGS_NOT_ARRAY");
    else if (!review.findings.every(validateFinding)) errors.push("FINDING_INVALID");
  }
  return { valid: errors.length === 0, errors };
}

function parseReview(content, expectedHead) {
  try {
    const review = JSON.parse(content.trim());
    const validation = validateReviewContract(review, expectedHead);
    return { review, validation, parseError: null };
  } catch (error) {
    return { review: null, validation: { valid: false, errors: ["JSON_INVALID"] }, parseError: sanitize(error) };
  }
}

function telemetryFromState(state, startedAt, endedAt, timeouts, maxCompletionTokens) {
  return {
    attempt_id: state.attemptId,
    latency_ms: endedAt - startedAt,
    sse_events: state.eventCount,
    finish_reason: state.finishReason,
    done_received: state.done,
    usage_received: state.usage !== null,
    usage: state.usage,
    reasoning_content_observable: state.reasoningSeen,
    max_completion_tokens: maxCompletionTokens,
    timeouts_effective_ms: timeouts,
    retry_count: 0,
  };
}

export async function runStreamingReview(options) {
  const {
    endpoint = "https://api.moonshot.ai/v1/chat/completions",
    model = "kimi-k2.7-code",
    messages,
    expectedHead,
    apiKey,
    thinking = { type: "enabled", keep: "all" },
    maxCompletionTokens = DEFAULT_MAX_COMPLETION_TOKENS,
    requestFactory = createHttpsRequestFactory(),
    persistAttempt,
    persistReportPath,
    reportIo,
    idFactory = randomUUID,
    scheduler = defaultScheduler(),
    timeouts: timeoutOverrides = {},
  } = options ?? {};

  if (typeof persistAttempt !== "function") throw new TypeError("persistAttempt is required for at-most-once execution");
  if (!Array.isArray(messages)) throw new TypeError("messages must be an array");
  if (typeof apiKey !== "string" || apiKey.length === 0) throw new TypeError("apiKey must be supplied without persisting it");
  if (!Number.isInteger(maxCompletionTokens) || maxCompletionTokens <= 0) {
    throw new TypeError("maxCompletionTokens must be a positive integer");
  }
  const timeouts = { ...STREAM_TIMEOUTS, ...timeoutOverrides };
  const startedAt = scheduler.now();
  const totalDeadline = startedAt + timeouts.totalMs;
  const attemptId = idFactory();
  await persistAttempt({
    attempt_id: attemptId,
    status: "PERSISTED_BEFORE_REQUEST",
    model,
    expected_head: expectedHead,
    max_completion_tokens: maxCompletionTokens,
    created_at_ms: startedAt,
    retries: 0,
  });

  const payload = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    thinking,
    max_completion_tokens: maxCompletionTokens,
  };
  const state = {
    attemptId,
    eventCount: 0,
    content: "",
    reasoningContent: "",
    reasoningSeen: false,
    finishReason: null,
    usage: null,
    done: false,
    malformed: [],
  };
  let handle;
  let response;
  let transportError = null;

  try {
    handle = requestFactory({
      endpoint,
      headers: { "content-type": "application/json", accept: "text/event-stream", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    await raceTimeout(handle.connected, timeouts.connectMs, STREAM_TIMEOUT_CODES.connect, totalDeadline, scheduler);
    const firstEventDeadline = scheduler.now() + timeouts.firstEventMs;
    response = await raceTimeout(handle.response, timeouts.firstEventMs, STREAM_TIMEOUT_CODES.firstEvent, totalDeadline, scheduler);
    const parser = createSseParser();
    const iterator = response.body[Symbol.asyncIterator]();
    let firstEvent = true;

    while (true) {
      const phaseMs = firstEvent ? Math.max(0, firstEventDeadline - scheduler.now()) : timeouts.idleMs;
      const phaseCode = firstEvent ? STREAM_TIMEOUT_CODES.firstEvent : STREAM_TIMEOUT_CODES.idle;
      const next = await raceTimeout(iterator.next(), phaseMs, phaseCode, totalDeadline, scheduler);
      if (next.done) {
        for (const event of parser.end()) processEvent(event, state);
        break;
      }
      const events = parser.push(next.value);
      for (const event of events) {
        processEvent(event, state);
        firstEvent = false;
      }
    }
  } catch (error) {
    transportError = sanitize(error);
    try { handle?.abort?.(error); } catch { /* best effort */ }
  }

  const status = response?.status ?? null;
  const contentType = headerValue(response?.headers, "content-type");
  const protocolErrors = [];
  if (status !== 200) protocolErrors.push("HTTP_NOT_200");
  if (!/^text\/event-stream(?:\s*;|$)/i.test(contentType)) protocolErrors.push("CONTENT_TYPE_NOT_SSE");
  if (state.eventCount === 0) protocolErrors.push("NO_SSE_EVENTS");
  if (!state.done) protocolErrors.push("DONE_MISSING");
  if (state.finishReason !== "stop") protocolErrors.push("FINISH_REASON_NOT_STOP");
  if (state.usage === null) protocolErrors.push("USAGE_MISSING");
  if (state.malformed.length > 0) protocolErrors.push("MALFORMED_SSE_EVENT");

  const parsed = transportError ? { review: null, validation: { valid: false, errors: ["TRANSPORT_ERROR"] }, parseError: null }
    : parseReview(state.content, expectedHead);
  const valid = !transportError && protocolErrors.length === 0 && parsed.validation.valid;
  const endedAt = scheduler.now();
  const telemetry = telemetryFromState(state, startedAt, endedAt, timeouts, maxCompletionTokens);
  const result = {
    classification: valid ? "REVIEW_VALIDA" : "REVIEW_INVALIDA",
    review: parsed.review,
    apiEnvelope: {
      http_status: status,
      content_type: contentType,
      finish_reason: state.finishReason,
      usage: state.usage,
      done_received: state.done,
      malformed_events: state.malformed,
      protocol_errors: protocolErrors,
      transport_error: transportError,
    },
    telemetry,
    validation: parsed.validation,
    parse_error: parsed.parseError,
    content: state.content,
    reasoning_content: state.reasoningSeen ? state.reasoningContent : null,
    request_payload: payload,
  };
  result.report = assembleReport(result, { persistPath: persistReportPath, io: reportIo, telemetry });
  return result;
}

function processEvent(event, state) {
  if (event.type === "comment") return;
  state.eventCount += 1;
  if (event.type === "done") {
    state.done = true;
    return;
  }
  if (event.type === "malformed") {
    state.malformed.push(event);
    return;
  }
  const choice = event.value?.choices?.[0];
  if (typeof choice?.delta?.content === "string") state.content += choice.delta.content;
  if (typeof choice?.delta?.reasoning_content === "string") {
    state.reasoningSeen = true;
    state.reasoningContent += choice.delta.reasoning_content;
  }
  if (choice?.finish_reason !== null && choice?.finish_reason !== undefined) state.finishReason = choice.finish_reason;
  if (event.value?.usage !== null && event.value?.usage !== undefined) state.usage = event.value.usage;
}
