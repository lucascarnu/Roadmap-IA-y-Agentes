import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";

import { sanitize, SANITIZE_MARKERS } from "./sanitize.mjs";
import { assembleReport, REPORT_MARKERS, verifyReport } from "./report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REVIEW = { head: "a".repeat(40), verdict: "APROBADO", findings: [] };
let networkRequests = 0;
const originalNetwork = {
  fetch: globalThis.fetch,
  httpRequest: http.request,
  httpsRequest: https.request,
};

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

test("preserva prompt_tokens numérico", () => {
  assert.equal(sanitize({ prompt_tokens: 11 }).prompt_tokens, 11);
});

test("preserva completion_tokens numérico", () => {
  assert.equal(sanitize({ completion_tokens: 12 }).completion_tokens, 12);
});

test("preserva reasoning_tokens numérico", () => {
  assert.equal(sanitize({ reasoning_tokens: 13 }).reasoning_tokens, 13);
});

test("preserva total_tokens numérico", () => {
  assert.equal(sanitize({ total_tokens: 23 }).total_tokens, 23);
});

test("preserva max_completion_tokens numérico", () => {
  assert.equal(sanitize({ max_completion_tokens: 32768 }).max_completion_tokens, 32768);
});

test("redacta max_completion_tokens con tipo inesperado", () => {
  assert.equal(
    sanitize({ max_completion_tokens: "32768" }).max_completion_tokens,
    SANITIZE_MARKERS.unexpectedType,
  );
  assert.equal(
    sanitize({ max_completion_tokens: { value: 32768 } }).max_completion_tokens,
    SANITIZE_MARKERS.unexpectedType,
  );
});

test("redacta contador conocido con string inesperado", () => {
  assert.equal(sanitize({ prompt_tokens: "FAKE-NOT-A-REAL-SECRET" }).prompt_tokens, SANITIZE_MARKERS.unexpectedType);
});

test("redacta contador conocido con objeto inesperado", () => {
  assert.equal(sanitize({ completion_tokens: { secret: "FAKE-NOT-A-REAL-SECRET" } }).completion_tokens, SANITIZE_MARKERS.unexpectedType);
});

test("recorre prompt_tokens_details y conserva cached_tokens numérico", () => {
  assert.equal(sanitize({ prompt_tokens_details: { cached_tokens: 7 } }).prompt_tokens_details.cached_tokens, 7);
});

test("recorre completion_tokens_details y conserva reasoning_tokens numérico", () => {
  assert.equal(sanitize({ completion_tokens_details: { reasoning_tokens: 8 } }).completion_tokens_details.reasoning_tokens, 8);
});

test("redacta prompt_tokens_details con tipo inesperado", () => {
  assert.equal(sanitize({ prompt_tokens_details: "FAKE-NOT-A-REAL-SECRET" }).prompt_tokens_details, SANITIZE_MARKERS.unexpectedType);
});

test("redacta completion_tokens_details con tipo inesperado", () => {
  assert.equal(sanitize({ completion_tokens_details: ["FAKE-NOT-A-REAL-SECRET"] }).completion_tokens_details, SANITIZE_MARKERS.unexpectedType);
});

test("redacta clave sensible anidada en prompt_tokens_details", () => {
  assert.equal(sanitize({ prompt_tokens_details: { api_key: { nested: true } } }).prompt_tokens_details.api_key, SANITIZE_MARKERS.redacted);
});

test("redacta clave sensible anidada en completion_tokens_details", () => {
  assert.equal(sanitize({ completion_tokens_details: { authorization: ["FAKE-NOT-A-REAL-SECRET"] } }).completion_tokens_details.authorization, SANITIZE_MARKERS.redacted);
});

test("prompt_tokens_details no se preserva ciegamente", () => {
  const original = { cached_tokens: 4, token_secret: "FAKE-NOT-A-REAL-SECRET", ordinary: "safe" };
  const sanitized = sanitize({ prompt_tokens_details: original }).prompt_tokens_details;
  assert.notEqual(sanitized, original);
  assert.equal(sanitized.cached_tokens, 4);
  assert.equal(sanitized.token_secret, SANITIZE_MARKERS.redacted);
});

test("completion_tokens_details no se preserva ciegamente", () => {
  const original = { reasoning_tokens: 5, cookie: { nested: true }, ordinary: "safe" };
  const sanitized = sanitize({ completion_tokens_details: original }).completion_tokens_details;
  assert.notEqual(sanitized, original);
  assert.equal(sanitized.reasoning_tokens, 5);
  assert.equal(sanitized.cookie, SANITIZE_MARKERS.redacted);
});

test("redacta authorization con valor objeto", () => {
  assert.equal(sanitize({ authorization: { value: "FAKE-NOT-A-REAL-SECRET" } }).authorization, SANITIZE_MARKERS.redacted);
});

test("redacta authorization con valor array", () => {
  assert.equal(sanitize({ authorization: ["FAKE-NOT-A-REAL-SECRET"] }).authorization, SANITIZE_MARKERS.redacted);
});

test("redacta api_key con valor no string", () => {
  assert.equal(sanitize({ api_key: 123 }).api_key, SANITIZE_MARKERS.redacted);
});

test("redacta Bearer dentro de texto libre", () => {
  const output = sanitize("mensaje Bearer FAKE-NOT-A-REAL-SECRET final");
  assert.equal(output.includes("FAKE-NOT-A-REAL-SECRET"), false);
  assert.match(output, /Bearer \[REDACTED\]/);
});

test("redacta usuario contraseña y parámetros de URL", () => {
  const output = sanitize("https://fake-user:fake-password@example.invalid/path?a=one&b=two");
  assert.equal(output.includes("fake-user"), false);
  assert.equal(output.includes("fake-password"), false);
  assert.equal(output.includes("a=one"), false);
  assert.equal(output.includes("b=two"), false);
});

test("redacta asignaciones sensibles dentro de message", () => {
  const output = sanitize({ message: "api_key=FAKE-NOT-A-REAL-SECRET token:ANOTHER-FAKE" });
  assert.equal(JSON.stringify(output).includes("FAKE-NOT-A-REAL-SECRET"), false);
  assert.equal(JSON.stringify(output).includes("ANOTHER-FAKE"), false);
});

test("redacta asignaciones sensibles dentro de stack", () => {
  const output = sanitize({ stack: "Error: password=FAKE-NOT-A-REAL-SECRET" });
  assert.equal(output.stack.includes("FAKE-NOT-A-REAL-SECRET"), false);
});

test("redacta headers authorization y set-cookie", () => {
  const output = sanitize({ headers: { authorization: { nested: true }, "set-cookie": ["FAKE-NOT-A-REAL-SECRET"] } });
  assert.equal(output.headers.authorization, SANITIZE_MARKERS.redacted);
  assert.equal(output.headers["set-cookie"], SANITIZE_MARKERS.redacted);
});

test("inspecciona propiedades propias y cause de Error", () => {
  const cause = Object.assign(new Error("api_key=FAKE-NOT-A-REAL-SECRET"), { authorization: { nested: true } });
  const error = new Error("Bearer FAKE-NOT-A-REAL-SECRET");
  Object.defineProperty(error, "code", { value: "SYNTHETIC", enumerable: false });
  error.cause = cause;
  const output = sanitize(error);
  assert.equal(output.code, "SYNTHETIC");
  assert.equal(output.message.includes("FAKE-NOT-A-REAL-SECRET"), false);
  assert.equal(output.cause.authorization, SANITIZE_MARKERS.redacted);
});

test("controla referencia circular sin lanzar", () => {
  const input = { value: "safe" };
  input.self = input;
  assert.equal(sanitize(input).self, SANITIZE_MARKERS.circular);
});

test("aplica límite de profundidad configurable", () => {
  assert.equal(sanitize({ one: { two: { three: true } } }, { maxDepth: 2 }).one.two, SANITIZE_MARKERS.maxDepth);
});

test("payload contractual válido y presente", () => {
  const report = assembleReport({ review: REVIEW, apiEnvelope: {}, usage: {} });
  assert.deepEqual(verifyReport(report, { review: REVIEW }), { valid: true, reason: "OK" });
});

test("payload contractual null produce INFORME_INVALIDO", () => {
  assert.match(assembleReport({ review: null }), /^INFORME_INVALIDO\n/);
});

test("payload contractual vacío produce INFORME_INVALIDO", () => {
  assert.match(assembleReport({ review: {} }), /^INFORME_INVALIDO\n/);
});

test("ausencia de delimitadores es detectada", () => {
  assert.equal(verifyReport("INFORME_VALIDO\n{}", { review: REVIEW }).valid, false);
});

test("delimitadores duplicados son detectados", () => {
  const report = assembleReport({ review: REVIEW });
  const duplicate = report.replace(REPORT_MARKERS.contractEnd, `${REPORT_MARKERS.contractStart}\n{}\n${REPORT_MARKERS.contractEnd}`);
  assert.equal(verifyReport(duplicate, { review: REVIEW }).valid, false);
});

test("divergencia frente a result.review es detectada", () => {
  const report = assembleReport({ review: REVIEW }).replace('"APROBADO"', '"CAMBIOS_REQUERIDOS"');
  assert.equal(verifyReport(report, { review: REVIEW }).reason, "CONTRACT_DIVERGES_FROM_REVIEW");
});

test("informe end-to-end conserva bloque contractual no vacío", () => {
  const report = assembleReport({ review: REVIEW, apiEnvelope: { authorization: "FAKE-NOT-A-REAL-SECRET" }, usage: { prompt_tokens: 11 } });
  const block = report.slice(report.indexOf(REPORT_MARKERS.contractStart) + REPORT_MARKERS.contractStart.length, report.indexOf(REPORT_MARKERS.contractEnd)).trim();
  assert.deepEqual(JSON.parse(block), REVIEW);
  assert.equal(block.length > 2, true);
});

test("persistencia y relectura coinciden con texto devuelto", () => {
  const directory = mkdtempSync(join(tmpdir(), "kimi-review-"));
  const file = join(directory, "report.txt");
  const report = assembleReport({ review: REVIEW }, { persistPath: file });
  assert.equal(readFileSync(file, "utf8"), report);
  assert.equal(verifyReport(report, { review: REVIEW }).valid, true);
});

test("divergencia simulada de persistencia produce INFORME_INVALIDO", () => {
  let stored = "";
  let reads = 0;
  const io = {
    writeFile(_file, text) { stored = text; },
    readFile() { reads += 1; return reads === 1 ? `${stored}DIVERGENCIA` : stored; },
  };
  const report = assembleReport({ review: REVIEW }, { persistPath: "synthetic", io });
  assert.match(report, /^INFORME_INVALIDO\n/);
  assert.equal(stored, report);
});

test("telemetría conserva los cuatro contadores sintéticos después", () => {
  const telemetry = { prompt_tokens: 11, completion_tokens: 12, reasoning_tokens: 13, total_tokens: 23 };
  assert.deepEqual(sanitize(telemetry), telemetry);
});

test("informe ensamblado muestra max_completion_tokens numérico", () => {
  const report = assembleReport(
    { review: REVIEW },
    { telemetry: { max_completion_tokens: 32768 } },
  );
  assert.match(report, /"max_completion_tokens": 32768/);
  assert.doesNotMatch(report, /"max_completion_tokens": "\[REDACTED/);
});

test("módulos durables no contienen transporte ni rutas personales", () => {
  for (const name of ["sanitize.mjs", "report.mjs"]) {
    const source = readFileSync(join(HERE, name), "utf8");
    assert.doesNotMatch(source, /node:https|node:http|\bfetch\s*\(|axios|undici|C:\\Users\\/i);
  }
});

test("archivos versionados no contienen rutas personales", () => {
  for (const name of [
    "sanitize.mjs",
    "report.mjs",
    "kimi-review.test.mjs",
    "stream-transport.mjs",
    "stream-transport.test.mjs",
    "README.md",
  ]) {
    assert.doesNotMatch(readFileSync(join(HERE, name), "utf8"), /C:\\Users\\/i);
  }
});

test("la batería ejecuta cero solicitudes de red", () => {
  assert.equal(networkRequests, 0);
});
