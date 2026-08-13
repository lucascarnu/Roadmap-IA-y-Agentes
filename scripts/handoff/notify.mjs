import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOCAL_CONFIG = join(HERE, "notify.local.json");
const DEFAULT_BASE_URL = "https://ntfy.sh";
const DEFAULT_TIMEOUT_MS = 5_000;
const SUPPORTED_PRIORITIES = new Set([3, 4, 5]);

function localTopic(path, logger) {
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return typeof value.topic === "string" ? value.topic.trim() : null;
  } catch (error) {
    logger.warn(`ntfy: configuración local inválida: ${error.message}`);
    return null;
  }
}

export function createNotifier(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const logger = options.logger ?? console;
  const localConfigPath = options.localConfigPath ?? DEFAULT_LOCAL_CONFIG;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const topic = env.ROADMAP_NTFY_TOPIC?.trim() || localTopic(localConfigPath, logger);
  const baseUrl = (env.ROADMAP_NTFY_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  let missingTopicLogged = false;

  return async function notify({ event, title, message, priority, tags = [] }) {
    if (!topic) {
      if (!missingTopicLogged) {
        logger.info("ntfy: sin topic configurado; notificaciones desactivadas");
        missingTopicLogged = true;
      }
      return { sent: false, reason: "not_configured" };
    }

    if (!SUPPORTED_PRIORITIES.has(priority)) {
      logger.warn(`ntfy: prioridad inválida para ${event}`);
      return { sent: false, reason: "invalid_priority" };
    }

    const url = `${baseUrl}/${encodeURIComponent(topic)}`;
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Title: title,
          Priority: String(priority),
          Tags: tags.join(","),
        },
        body: message,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        logger.warn(`ntfy: ${event} respondió HTTP ${response.status}`);
        return { sent: false, reason: "http_error", status: response.status };
      }
      return { sent: true };
    } catch (error) {
      logger.warn(`ntfy: ${event} no pudo enviarse: ${error.message}`);
      return { sent: false, reason: "request_error" };
    }
  };
}
