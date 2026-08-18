const REDACTED = "[REDACTED]";
const REDACTED_UNEXPECTED_TYPE = "[REDACTED_UNEXPECTED_TYPE]";
const MAX_DEPTH = "[MAX_DEPTH]";
const CIRCULAR = "[CIRCULAR]";
const UNREADABLE = "[UNREADABLE]";

export const KNOWN_COUNTER_KEYS = Object.freeze([
  "prompt_tokens",
  "completion_tokens",
  "reasoning_tokens",
  "total_tokens",
  "cached_tokens",
  "input_estimated_tokens",
  "max_completion_tokens",
]);

export const KNOWN_COUNTER_CONTAINER_KEYS = Object.freeze([
  "prompt_tokens_details",
  "completion_tokens_details",
]);

const COUNTER_KEYS = new Set(KNOWN_COUNTER_KEYS);
const COUNTER_CONTAINER_KEYS = new Set(KNOWN_COUNTER_CONTAINER_KEYS);
const SENSITIVE_KEY = /(?:authorization|api[_-]?key|apikey|token|secret|cookie|credential|password|passwd|pwd)/i;
const URL_LIKE = /\bhttps?:\/\/[^\s"'<>]+/gi;
const BEARER_LIKE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const QUERY_VALUE = /([?&][^=&#\s]+)=([^&#\s]*)/g;
const SENSITIVE_ASSIGNMENT = /(\b(?:authorization|api[_-]?key|apikey|token|secret|cookie|credential|password|passwd|pwd)\b\s*[:=]\s*)([^\s,;]+)/gi;
const ERROR_KEYS = ["name", "message", "stack", "code", "errno", "syscall", "cause"];

function redactString(value, marker) {
  return String(value)
    .replace(BEARER_LIKE, `Bearer ${marker}`)
    .replace(SENSITIVE_ASSIGNMENT, `$1${marker}`)
    .replace(URL_LIKE, (raw) => {
      try {
        const parsed = new URL(raw);
        if (parsed.username) parsed.username = marker;
        if (parsed.password) parsed.password = marker;
        for (const key of [...parsed.searchParams.keys()]) parsed.searchParams.set(key, marker);
        return parsed.toString();
      } catch {
        return raw.replace(QUERY_VALUE, `$1=${marker}`);
      }
    })
    .replace(QUERY_VALUE, `$1=${marker}`);
}

function isCounterContainer(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sanitize(value, options = {}) {
  const maxDepth = Number.isInteger(options.maxDepth) && options.maxDepth >= 0 ? options.maxDepth : 12;
  const marker = typeof options.redactedMarker === "string" && options.redactedMarker
    ? options.redactedMarker
    : REDACTED;
  const unexpectedTypeMarker = typeof options.unexpectedTypeMarker === "string" && options.unexpectedTypeMarker
    ? options.unexpectedTypeMarker
    : REDACTED_UNEXPECTED_TYPE;
  const seen = new WeakSet();

  function walk(item, depth) {
    if (item === null || item === undefined) return item;
    if (typeof item === "string") return redactString(item, marker);
    if (typeof item === "number" || typeof item === "boolean") return item;
    if (typeof item === "bigint") return item.toString();
    if (typeof item === "function" || typeof item === "symbol") return String(item);
    if (depth >= maxDepth) return MAX_DEPTH;
    if (typeof item !== "object") return redactString(item, marker);
    if (seen.has(item)) return CIRCULAR;

    seen.add(item);
    if (Array.isArray(item)) return item.map((entry) => walk(entry, depth + 1));

    const result = {};
    const keys = new Set(Object.getOwnPropertyNames(item));
    if (item instanceof Error) for (const key of ERROR_KEYS) keys.add(key);

    for (const key of keys) {
      let child;
      try {
        child = item[key];
      } catch {
        result[key] = UNREADABLE;
        continue;
      }
      if (child === undefined) continue;

      if (COUNTER_CONTAINER_KEYS.has(key)) {
        result[key] = isCounterContainer(child) ? walk(child, depth + 1) : unexpectedTypeMarker;
        continue;
      }
      if (COUNTER_KEYS.has(key)) {
        result[key] = typeof child === "number" ? child : unexpectedTypeMarker;
        continue;
      }
      if (SENSITIVE_KEY.test(key)) {
        result[key] = marker;
        continue;
      }
      result[key] = walk(child, depth + 1);
    }
    return result;
  }

  return walk(value, 0);
}

export const SANITIZE_MARKERS = Object.freeze({
  redacted: REDACTED,
  unexpectedType: REDACTED_UNEXPECTED_TYPE,
  maxDepth: MAX_DEPTH,
  circular: CIRCULAR,
  unreadable: UNREADABLE,
});
