import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import { sanitize } from "./sanitize.mjs";

const CONTRACT_START = "<<<JSON_CONTRACTUAL_COMPLETO_INICIO>>>";
const CONTRACT_END = "<<<JSON_CONTRACTUAL_COMPLETO_FIN>>>";
const ENVELOPE_START = "<<<SOBRE_API_SANITIZADO_INICIO>>>";
const ENVELOPE_END = "<<<SOBRE_API_SANITIZADO_FIN>>>";
const TELEMETRY_START = "<<<TELEMETRIA_INICIO>>>";
const TELEMETRY_END = "<<<TELEMETRIA_FIN>>>";
const BACKUP_START = "<<<JSON_CONTRACTUAL_RESPALDO_INICIO>>>";
const BACKUP_END = "<<<JSON_CONTRACTUAL_RESPALDO_FIN>>>";

function count(text, marker) {
  return text.split(marker).length - 1;
}

function nonEmptyReview(review) {
  return review !== null && typeof review === "object" && !Array.isArray(review) && Object.keys(review).length > 0;
}

function stringify(value) {
  return JSON.stringify(value, null, 2);
}

function envelopeFrom(result, options) {
  return options.apiEnvelope ?? result.apiEnvelope ?? result.rawResponse ?? result.raw ?? null;
}

function telemetryFrom(result, options) {
  return options.telemetry ?? result.telemetry ?? result.usage ?? {};
}

function buildValidCandidate(result, options) {
  return [
    "INFORME_VALIDO",
    "",
    "## JSON CONTRACTUAL COMPLETO DE LA REVIEW",
    CONTRACT_START,
    stringify(result.review),
    CONTRACT_END,
    "",
    "## SOBRE API SANITIZADO",
    ENVELOPE_START,
    stringify(sanitize(envelopeFrom(result, options), options.sanitizeOptions)),
    ENVELOPE_END,
    "",
    "## TELEMETRÍA",
    TELEMETRY_START,
    stringify(sanitize(telemetryFrom(result, options), options.sanitizeOptions)),
    TELEMETRY_END,
    "",
  ].join("\n");
}

function buildInvalid(result, reason, options) {
  const reviewText = stringify(result.review);
  return [
    "INFORME_INVALIDO",
    "",
    `ADVERTENCIA: el informe no superó su autoverificación (${reason}). No se ejecutó ni se sugiere una inferencia nueva.`,
    "",
    "## JSON CONTRACTUAL COMPLETO DE LA REVIEW",
    CONTRACT_START,
    reviewText,
    CONTRACT_END,
    "",
    "## RESPALDO EXPLÍCITO DEL PAYLOAD CONTRACTUAL",
    BACKUP_START,
    reviewText,
    BACKUP_END,
    "",
    "## SOBRE API SANITIZADO",
    ENVELOPE_START,
    stringify(sanitize(envelopeFrom(result, options), options.sanitizeOptions)),
    ENVELOPE_END,
    "",
    "## TELEMETRÍA",
    TELEMETRY_START,
    stringify(sanitize(telemetryFrom(result, options), options.sanitizeOptions)),
    TELEMETRY_END,
    "",
  ].join("\n");
}

export function verifyReport(text, result) {
  try {
    if (typeof text !== "string") return { valid: false, reason: "REPORT_NOT_STRING" };
    if (!nonEmptyReview(result?.review)) return { valid: false, reason: "REVIEW_EMPTY_OR_INVALID" };
    if (!text.startsWith("INFORME_VALIDO\n")) return { valid: false, reason: "CLASSIFICATION_NOT_VALID" };
    if (count(text, CONTRACT_START) !== 1 || count(text, CONTRACT_END) !== 1) {
      return { valid: false, reason: "CONTRACT_MARKERS_MISSING_OR_DUPLICATED" };
    }
    const start = text.indexOf(CONTRACT_START);
    const end = text.indexOf(CONTRACT_END);
    if (start < 0 || end < 0 || end <= start + CONTRACT_START.length) {
      return { valid: false, reason: "CONTRACT_MARKERS_OUT_OF_ORDER_OR_EMPTY" };
    }
    const extracted = text.slice(start + CONTRACT_START.length, end).trim();
    if (!extracted) return { valid: false, reason: "CONTRACT_BLOCK_EMPTY" };
    let parsed;
    try {
      parsed = JSON.parse(extracted);
    } catch {
      return { valid: false, reason: "CONTRACT_JSON_INVALID" };
    }
    if (!isDeepStrictEqual(parsed, result.review)) return { valid: false, reason: "CONTRACT_DIVERGES_FROM_REVIEW" };
    return { valid: true, reason: "OK" };
  } catch {
    return { valid: false, reason: "VERIFY_INTERNAL_ERROR" };
  }
}

function defaultIo() {
  return {
    writeFile(file, text) {
      writeFileSync(file, text, "utf8");
    },
    readFile(file) {
      return readFileSync(file, "utf8");
    },
  };
}

export function assembleReport(result, options = {}) {
  const candidate = buildValidCandidate(result, options);
  const verification = verifyReport(candidate, result);
  let finalText = verification.valid ? candidate : buildInvalid(result, verification.reason, options);

  if (!options.persistPath) return finalText;

  const io = options.io ?? defaultIo();
  io.writeFile(options.persistPath, finalText);
  let persisted = io.readFile(options.persistPath);
  const persistedVerification = finalText.startsWith("INFORME_VALIDO\n")
    ? verifyReport(persisted, result)
    : { valid: false, reason: "CLASSIFICATION_NOT_VALID" };

  if (persisted !== finalText || (finalText.startsWith("INFORME_VALIDO\n") && !persistedVerification.valid)) {
    const reason = persisted !== finalText ? "PERSISTED_BYTES_DIVERGE" : persistedVerification.reason;
    finalText = buildInvalid(result, reason, options);
    io.writeFile(options.persistPath, finalText);
    persisted = io.readFile(options.persistPath);
    if (persisted !== finalText) {
      finalText = buildInvalid(result, "PERSISTENCE_UNSTABLE", options);
      io.writeFile(options.persistPath, finalText);
      persisted = io.readFile(options.persistPath);
      if (persisted !== finalText) finalText = persisted;
    }
  }

  return finalText;
}

export const REPORT_MARKERS = Object.freeze({
  contractStart: CONTRACT_START,
  contractEnd: CONTRACT_END,
  envelopeStart: ENVELOPE_START,
  envelopeEnd: ENVELOPE_END,
  telemetryStart: TELEMETRY_START,
  telemetryEnd: TELEMETRY_END,
  backupStart: BACKUP_START,
  backupEnd: BACKUP_END,
});
