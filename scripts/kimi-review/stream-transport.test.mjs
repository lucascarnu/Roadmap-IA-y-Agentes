import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";

import {
  createSseParser,
  DEFAULT_MAX_COMPLETION_TOKENS,
  OUTPUT_TOKEN_PARAMETER,
  runStreamingReview,
  STREAM_TIMEOUT_CODES,
} from "./stream-transport.mjs";

const HEAD = "b".repeat(40);
const REVIEW = { head: HEAD, verdict: "APROBADO", findings: [] };
let networkRequests = 0;
const originalNetwork = { fetch: globalThis.fetch, httpRequest: http.request, httpsRequest: https.request };

function rejectRealNetwork() {
  networkRequests += 1;
  throw new Error("REAL_NETWORK_FORBIDDEN_IN_TESTS");
}

globalThis.fetch = rejectRealNetwork;
http.request = rejectRealNetwork;
https.request = rejectRealNetwork;

test.after(() => {
  globalThis.fetch = originalNetwork.fetch;
  http.request = originalNetwork.httpRequest;
  https.request = originalNetwork.httpsRequest;
});

function sse(value, ending = "\n\n") {
  return `data: ${typeof value === "string" ? value : JSON.stringify(value)}${ending}`;
}

function response(chunks, { status = 200, contentType = "text/event-stream" } = {}) {
  return {
    status,
    headers: { "content-type": contentType },
    body: (async function* body() { for (const chunk of chunks) yield chunk; })(),
  };
}

function validChunks({ reasoning = false } = {}) {
  return [
    sse({ choices: [{ delta: { content: JSON.stringify(REVIEW).slice(0, 25), ...(reasoning ? { reasoning_content: "pensó" } : {}) }, finish_reason: null }], usage: null }),
    sse({ choices: [{ delta: { content: JSON.stringify(REVIEW).slice(25) }, finish_reason: "stop" }], usage: null }),
    sse({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 12, reasoning_tokens: 13, total_tokens: 23 } }),
    sse("[DONE]"),
  ];
}

function factoryFor(chunks, capture = {}) {
  return (request) => {
    capture.calls = (capture.calls ?? 0) + 1;
    capture.request = request;
    return { connected: Promise.resolve(), response: Promise.resolve(response(chunks)), abort() {} };
  };
}

async function run(chunks = validChunks(), overrides = {}) {
  const capture = overrides.capture ?? {};
  const order = overrides.order ?? [];
  const result = await runStreamingReview({
    messages: [{ role: "user", content: "synthetic" }],
    expectedHead: HEAD,
    apiKey: "FAKE-NOT-A-REAL-SECRET",
    maxCompletionTokens: overrides.maxCompletionTokens ?? 1024,
    requestFactory: overrides.requestFactory ?? factoryFor(chunks, capture),
    persistAttempt: overrides.persistAttempt ?? (async () => { order.push("persist"); }),
    idFactory: () => "attempt-synthetic",
    timeouts: overrides.timeouts,
  });
  return { result, capture, order };
}

test("parser acepta un evento partido entre fragmentos", () => {
  const parser = createSseParser();
  assert.deepEqual(parser.push("data: {\"a\":"), []);
  assert.equal(parser.push("1}\n\n")[0].value.a, 1);
});

test("parser acepta varios eventos en un fragmento", () => {
  const events = createSseParser().push("data: {\"a\":1}\n\ndata: {\"b\":2}\n\n");
  assert.deepEqual(events.map((item) => item.value), [{ a: 1 }, { b: 2 }]);
});

test("parser acepta data con y sin espacio", () => {
  const events = createSseParser().push("data:{\"a\":1}\n\ndata: {\"b\":2}\n\n");
  assert.equal(events.length, 2);
});

test("parser acepta CRLF", () => {
  assert.equal(createSseParser().push("data: {\"a\":1}\r\n\r\n")[0].value.a, 1);
});

test("parser tolera comentarios SSE", () => {
  assert.equal(createSseParser().push(": keepalive\n\n")[0].type, "comment");
});

test("parser no intenta parsear DONE como JSON", () => {
  assert.deepEqual(createSseParser().push("data: [DONE]\n\n")[0], { type: "done", raw: "[DONE]" });
});

test("parser reporta un evento malformado sin lanzar", () => {
  assert.equal(createSseParser().push("data: {mal}\n\n")[0].type, "malformed");
});

test("transporte reconstruye content desde varios deltas", async () => {
  const { result } = await run();
  assert.equal(result.content, JSON.stringify(REVIEW));
  assert.deepEqual(result.review, REVIEW);
});

test("reasoning_content presente se captura y sigue siendo válido", async () => {
  const { result } = await run(validChunks({ reasoning: true }));
  assert.equal(result.classification, "REVIEW_VALIDA");
  assert.equal(result.reasoning_content, "pensó");
});

test("reasoning_content ausente es válido y queda no observable", async () => {
  const { result } = await run();
  assert.equal(result.classification, "REVIEW_VALIDA");
  assert.equal(result.reasoning_content, null);
});

test("finish_reason se toma del último chunk no nulo", async () => {
  const { result } = await run();
  assert.equal(result.apiEnvelope.finish_reason, "stop");
});

test("usage se toma del chunk final no nulo", async () => {
  const { result } = await run();
  assert.equal(result.apiEnvelope.usage.total_tokens, 23);
});

test("stream sin DONE se clasifica incompleto", async () => {
  const { result } = await run(validChunks().slice(0, -1));
  assert.equal(result.classification, "REVIEW_INVALIDA");
  assert.ok(result.apiEnvelope.protocol_errors.includes("DONE_MISSING"));
});

test("stream sin finish_reason se clasifica incompleto", async () => {
  const chunks = validChunks();
  chunks[1] = sse({ choices: [{ delta: { content: JSON.stringify(REVIEW).slice(25) }, finish_reason: null }], usage: null });
  const { result } = await run(chunks);
  assert.ok(result.apiEnvelope.protocol_errors.includes("FINISH_REASON_NOT_STOP"));
});

test("stream sin usage se clasifica incompleto", async () => {
  const chunks = validChunks();
  chunks.splice(2, 1);
  const { result } = await run(chunks);
  assert.ok(result.apiEnvelope.protocol_errors.includes("USAGE_MISSING"));
});

test("DONE termina un stream válido aunque el iterador quede abierto", async () => {
  const chunks = validChunks();
  let nextCalls = 0;
  const iterator = {
    next() {
      nextCalls += 1;
      if (nextCalls <= chunks.length) return Promise.resolve({ value: chunks[nextCalls - 1], done: false });
      return new Promise(() => {});
    },
    return() { return Promise.resolve({ done: true }); },
  };
  const fake = { status: 200, headers: { "content-type": "text/event-stream" }, body: { [Symbol.asyncIterator]: () => iterator } };
  const { result } = await run([], {
    requestFactory: () => ({ connected: Promise.resolve(), response: Promise.resolve(fake), abort() {} }),
    timeouts: { connectMs: 50, firstEventMs: 50, idleMs: 5, totalMs: 100 },
  });
  assert.equal(result.classification, "REVIEW_VALIDA");
  assert.equal(result.apiEnvelope.transport_error, null);
  assert.equal(nextCalls, chunks.length);
});

test("ningún evento posterior a DONE se incorpora al estado", async () => {
  const initial = validChunks().slice(0, 2);
  const finalChunk = [
    validChunks()[2],
    sse("[DONE]"),
    sse({ choices: [{ delta: { content: "NO_DEBE_APARECER" }, finish_reason: "length" }], usage: { total_tokens: 999 } }),
  ].join("");
  const { result } = await run([...initial, finalChunk]);
  assert.equal(result.classification, "REVIEW_VALIDA");
  assert.equal(result.content, JSON.stringify(REVIEW));
  assert.equal(result.apiEnvelope.usage.total_tokens, 23);
  assert.equal(result.telemetry.sse_events, 4);
});

test("iterator.return se invoca exactamente una vez al observar DONE", async () => {
  const chunks = validChunks();
  let position = 0;
  let returnCalls = 0;
  const iterator = {
    next() { return Promise.resolve({ value: chunks[position++], done: false }); },
    return() { returnCalls += 1; return Promise.resolve({ done: true }); },
  };
  const fake = { status: 200, headers: { "content-type": "text/event-stream" }, body: { [Symbol.asyncIterator]: () => iterator } };
  const { result } = await run([], {
    requestFactory: () => ({ connected: Promise.resolve(), response: Promise.resolve(fake), abort() {} }),
  });
  assert.equal(result.classification, "REVIEW_VALIDA");
  assert.equal(returnCalls, 1);
});

test("cierre natural sin DONE conserva la clasificación DONE_MISSING", async () => {
  const { result } = await run(validChunks().slice(0, -1));
  assert.equal(result.classification, "REVIEW_INVALIDA");
  assert.ok(result.apiEnvelope.protocol_errors.includes("DONE_MISSING"));
});

test("timeout de conexión tiene código propio", async () => {
  const { result } = await run([], {
    requestFactory: () => ({ connected: new Promise(() => {}), response: new Promise(() => {}), abort() {} }),
    timeouts: { connectMs: 5, firstEventMs: 50, idleMs: 50, totalMs: 100 },
  });
  assert.equal(result.apiEnvelope.transport_error.code, STREAM_TIMEOUT_CODES.connect);
});

test("timeout de primer evento tiene código propio", async () => {
  const stalled = { status: 200, headers: { "content-type": "text/event-stream" }, body: { [Symbol.asyncIterator]() { return { next: () => new Promise(() => {}) }; } } };
  const { result } = await run([], {
    requestFactory: () => ({ connected: Promise.resolve(), response: Promise.resolve(stalled), abort() {} }),
    timeouts: { connectMs: 50, firstEventMs: 5, idleMs: 50, totalMs: 100 },
  });
  assert.equal(result.apiEnvelope.transport_error.code, STREAM_TIMEOUT_CODES.firstEvent);
});

test("timeout de inactividad tiene código propio", async () => {
  let calls = 0;
  const stalled = { status: 200, headers: { "content-type": "text/event-stream" }, body: { [Symbol.asyncIterator]() { return { next() { calls += 1; return calls === 1 ? Promise.resolve({ value: sse({ choices: [{ delta: { content: "{" }, finish_reason: null }] }), done: false }) : new Promise(() => {}); } }; } } };
  const { result } = await run([], {
    requestFactory: () => ({ connected: Promise.resolve(), response: Promise.resolve(stalled), abort() {} }),
    timeouts: { connectMs: 50, firstEventMs: 50, idleMs: 5, totalMs: 100 },
  });
  assert.equal(result.apiEnvelope.transport_error.code, STREAM_TIMEOUT_CODES.idle);
});

test("timeout total tiene código propio", async () => {
  const { result } = await run([], {
    requestFactory: () => ({ connected: new Promise(() => {}), response: new Promise(() => {}), abort() {} }),
    timeouts: { connectMs: 100, firstEventMs: 100, idleMs: 100, totalMs: 5 },
  });
  assert.equal(result.apiEnvelope.transport_error.code, STREAM_TIMEOUT_CODES.total);
});

test("inactividad se reinicia con eventos y no corta un stream lento pero vivo", async () => {
  async function* live() {
    for (const chunk of validChunks()) {
      await new Promise((resolve) => setTimeout(resolve, 3));
      yield chunk;
    }
  }
  const fakeResponse = { status: 200, headers: { "content-type": "text/event-stream" }, body: live() };
  const { result } = await run([], {
    requestFactory: () => ({ connected: Promise.resolve(), response: Promise.resolve(fakeResponse), abort() {} }),
    timeouts: { connectMs: 50, firstEventMs: 20, idleMs: 20, totalMs: 200 },
  });
  assert.equal(result.classification, "REVIEW_VALIDA");
});

test("attempt_id se persiste antes del envío", async () => {
  const order = [];
  const requestFactory = (request) => { order.push("request"); return factoryFor(validChunks())(request); };
  await run([], { order, requestFactory, persistAttempt: async () => { order.push("persist"); } });
  assert.deepEqual(order.slice(0, 2), ["persist", "request"]);
});

test("fallo económico indeterminado no dispara reintento", async () => {
  let calls = 0;
  const { result } = await run([], {
    requestFactory: () => { calls += 1; return { connected: Promise.reject(new Error("synthetic failure")), response: new Promise(() => {}), abort() {} }; },
  });
  assert.equal(result.classification, "REVIEW_INVALIDA");
  assert.equal(calls, 1);
  assert.equal(result.telemetry.retry_count, 0);
});

test("error de transporte queda sanitizado sin credenciales", async () => {
  const { result } = await run([], {
    requestFactory: () => ({ connected: Promise.reject(new Error("Bearer FAKE-NOT-A-REAL-SECRET")), response: new Promise(() => {}), abort() {} }),
  });
  assert.equal(JSON.stringify(result.apiEnvelope).includes("FAKE-NOT-A-REAL-SECRET"), false);
});

test("max_completion_tokens llega intacto a la fábrica inyectada", async () => {
  const capture = {};
  await run(validChunks(), { capture, maxCompletionTokens: 2345 });
  const body = JSON.parse(capture.request.body);
  assert.equal(OUTPUT_TOKEN_PARAMETER, "max_completion_tokens");
  assert.equal(body.max_completion_tokens, 2345);
  assert.equal(Object.hasOwn(body, "max_tokens"), false);
  assert.equal(body.stream, true);
  assert.deepEqual(body.stream_options, { include_usage: true });
});

test("transporte ensambla un informe durable válido", async () => {
  const { result } = await run();
  assert.match(result.report, /^INFORME_VALIDO\n/);
});

test("HTTP distinto de 200 invalida el stream", async () => {
  const fake = response(validChunks(), { status: 503 });
  const { result } = await run([], { requestFactory: () => ({ connected: Promise.resolve(), response: Promise.resolve(fake), abort() {} }) });
  assert.ok(result.apiEnvelope.protocol_errors.includes("HTTP_NOT_200"));
});

test("content-type distinto de SSE invalida el stream", async () => {
  const fake = response(validChunks(), { contentType: "application/json" });
  const { result } = await run([], { requestFactory: () => ({ connected: Promise.resolve(), response: Promise.resolve(fake), abort() {} }) });
  assert.ok(result.apiEnvelope.protocol_errors.includes("CONTENT_TYPE_NOT_SSE"));
});

test("límite predeterminado de salida queda fijado en 32768", () => {
  assert.equal(DEFAULT_MAX_COMPLETION_TOKENS, 32768);
});

test("la batería de transporte ejecuta cero solicitudes reales de red", () => {
  assert.equal(networkRequests, 0);
});
