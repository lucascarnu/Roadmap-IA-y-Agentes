import https from "node:https";
import { randomUUID } from "node:crypto";

import { sanitize } from "./sanitize.mjs";
import { assembleReport } from "./report.mjs";

export const OUTPUT_TOKEN_PARAMETER = "max_completion_tokens";
export const DEFAULT_MAX_COMPLETION_TOKENS = 32768;

export const REVIEW_VERDICTS = Object.freeze(["APROBADO", "CAMBIOS_REQUERIDOS"]);
export const FINDING_IMPACTS = Object.freeze(["M1", "M2", "M3", "O"]);
export const FINDING_EVIDENCE_STATUSES = Object.freeze(["SETTLED", "NEEDS_EVIDENCE", "UNVERIFIABLE"]);
export const FINDING_ORIGINS = Object.freeze(["DIFF", "REPOSITORY_FILE", "GITHUB_STATE", "ACTIONS_RUN", "NONE"]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const REVIEW_JSON_SCHEMA = deepFreeze({
  type: "object",
  additionalProperties: false,
  required: ["head", "verdict", "findings"],
  properties: {
    head: { type: "string" },
    verdict: { type: "string", enum: REVIEW_VERDICTS },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["impact", "evidence_status", "origin", "file", "line", "issue"],
        properties: {
          impact: { type: "string", enum: FINDING_IMPACTS },
          evidence_status: { type: "string", enum: FINDING_EVIDENCE_STATUSES },
          origin: { type: "string", enum: FINDING_ORIGINS },
          file: { type: ["string", "null"] },
          line: { type: ["integer", "null"] },
          issue: { type: "string" },
        },
      },
    },
  },
});

export const REVIEW_RESPONSE_FORMAT = deepFreeze({
  type: "json_schema",
  json_schema: {
    name: "kimi_review",
    strict: true,
    schema: REVIEW_JSON_SCHEMA,
  },
});

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

export function buildIdempotencyMarker(head, attemptId) {
  if (typeof head !== "string" || head.length === 0) throw new TypeError("head is required");
  if (typeof attemptId !== "string" || attemptId.length === 0) throw new TypeError("attemptId is required");
  return `KIMI_STREAM_REVIEW HEAD=${head} ATTEMPT_ID=${attemptId}`;
}

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

const REVIEW_KEYS = Object.freeze(["head", "verdict", "findings"]);
const FINDING_KEYS = Object.freeze(["impact", "evidence_status", "origin", "file", "line", "issue"]);

function hasExactKeys(value, expected) {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function validateFinding(finding) {
  return finding && typeof finding === "object" && !Array.isArray(finding)
    && hasExactKeys(finding, FINDING_KEYS)
    && FINDING_IMPACTS.includes(finding.impact)
    && FINDING_EVIDENCE_STATUSES.includes(finding.evidence_status)
    && FINDING_ORIGINS.includes(finding.origin)
    && (finding.file === null || typeof finding.file === "string")
    && (finding.line === null || Number.isInteger(finding.line))
    && typeof finding.issue === "string";
}

export function validateReviewContract(review, expectedHead) {
  const errors = [];
  if (!review || typeof review !== "object" || Array.isArray(review)) errors.push("REVIEW_NOT_OBJECT");
  else {
    if (!hasExactKeys(review, REVIEW_KEYS)) errors.push("REVIEW_PROPERTIES_INVALID");
    if (review.head !== expectedHead) errors.push("HEAD_MISMATCH");
    if (!REVIEW_VERDICTS.includes(review.verdict)) errors.push("VERDICT_INVALID");
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
    request_started_at: state.requestStartedAt,
    time_to_first_event_ms: state.timeToFirstEventMs,
    max_event_interval_ms: state.maxEventIntervalMs,
    completion_id: state.completionId,
    model_effective: state.modelEffective,
    idempotency_marker: state.idempotencyMarker,
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
    response_format: REVIEW_RESPONSE_FORMAT,
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
    completionId: null,
    modelEffective: null,
    identityErrors: [],
    requestStartedAt: null,
    firstEventAt: null,
    lastEventAt: null,
    timeToFirstEventMs: null,
    maxEventIntervalMs: null,
    idempotencyMarker: buildIdempotencyMarker(expectedHead, attemptId),
  };
  let handle;
  let response;
  let transportError = null;

  try {
    state.requestStartedAt = scheduler.now();
    handle = requestFactory({
      endpoint,
      headers: { "content-type": "application/json", accept: "text/event-stream", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    await raceTimeout(handle.connected, timeouts.connectMs, STREAM_TIMEOUT_CODES.connect, totalDeadline, scheduler);
    const firstEventDeadline = scheduler.now() + timeouts.firstEventMs;
    response = await waitWithinDeadline(
      handle.response,
      firstEventDeadline,
      STREAM_TIMEOUT_CODES.firstEvent,
      totalDeadline,
      scheduler,
    );
    const parser = createSseParser();
    const iterator = response.body[Symbol.asyncIterator]();
    let endedByDone = false;
    let idleDeadline = null;

    streamLoop: while (true) {
      const waitingForFirstEvent = state.eventCount === 0;
      const phaseDeadline = waitingForFirstEvent ? firstEventDeadline : idleDeadline;
      const phaseCode = waitingForFirstEvent ? STREAM_TIMEOUT_CODES.firstEvent : STREAM_TIMEOUT_CODES.idle;
      assertDeadlineAvailable(phaseDeadline, phaseCode, totalDeadline, scheduler);
      const next = await waitWithinDeadline(
        iterator.next(),
        phaseDeadline,
        phaseCode,
        totalDeadline,
        scheduler,
      );
      if (next.done) {
        for (const event of parser.end()) {
          processEvent(event, state, scheduler.now());
          if (state.done) break;
        }
        break;
      }
      const chunkObservedAt = scheduler.now();
      const events = parser.push(next.value);
      for (const event of events) {
        const before = state.eventCount;
        processEvent(event, state, chunkObservedAt);
        if (state.done) {
          endedByDone = true;
          break streamLoop;
        }
        if (state.eventCount > before) idleDeadline = chunkObservedAt + timeouts.idleMs;
      }
    }
    if (endedByDone && typeof iterator.return === "function") {
      try { await iterator.return(); } catch { /* normal release must not become a transport error */ }
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
  protocolErrors.push(...state.identityErrors);

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
      completion_id: state.completionId,
      model_effective: state.modelEffective,
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

function processEvent(event, state, observedAt) {
  if (event.type === "comment") return;
  if (state.lastEventAt === null) {
    state.firstEventAt = observedAt;
    state.timeToFirstEventMs = observedAt - state.requestStartedAt;
    state.maxEventIntervalMs = 0;
  } else {
    state.maxEventIntervalMs = Math.max(state.maxEventIntervalMs, observedAt - state.lastEventAt);
  }
  state.lastEventAt = observedAt;
  state.eventCount += 1;
  if (event.type === "done") {
    state.done = true;
    return;
  }
  if (event.type === "malformed") {
    state.malformed.push(event);
    return;
  }
  if (event.type === "json") {
    captureStableIdentity(state, "completionId", event.value?.id, "COMPLETION_ID_DIVERGENT");
    captureStableIdentity(state, "modelEffective", event.value?.model, "MODEL_DIVERGENT");
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

function captureStableIdentity(state, key, value, errorCode) {
  if (value === null || value === undefined) return;
  if (state[key] === null) state[key] = value;
  else if (state[key] !== value && !state.identityErrors.includes(errorCode)) state.identityErrors.push(errorCode);
}

function assertDeadlineAvailable(phaseDeadline, phaseCode, totalDeadline, scheduler) {
  const now = scheduler.now();
  if (totalDeadline <= now) throw new StreamTimeoutError(STREAM_TIMEOUT_CODES.total, 0);
  if (phaseDeadline <= now) throw new StreamTimeoutError(phaseCode, 0);
}

function waitWithinDeadline(promise, phaseDeadline, phaseCode, totalDeadline, scheduler) {
  assertDeadlineAvailable(phaseDeadline, phaseCode, totalDeadline, scheduler);
  return raceTimeout(promise, phaseDeadline - scheduler.now(), phaseCode, totalDeadline, scheduler);
}
