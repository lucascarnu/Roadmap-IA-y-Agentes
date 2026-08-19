#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync,
  readdirSync, statSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChildEnv, observeAuthentication, runProcess } from "./env.mjs";
import { createNotifier } from "./notify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const DEFAULT_CONFIG = join(HERE, "config.json");
const CONTRACT_SCHEMA = join(HERE, "handoff.schema.json");
const RESULT_SCHEMA = join(HERE, "handoff-result.schema.json");
const PROMPT_TEMPLATE = join(HERE, "prompt-template.md");
const RUNTIME = join(HERE, ".handoff");
const ARTIFACTS = join(HERE, "artifacts");
const HEAD_REF_PATTERN = /^(?!\.{1,2}(?:\/|$))(?!.*\/\.{1,2}(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
export const RESULT_LIMITS = Object.freeze({
  veredicto: 2000,
  resumen: 6000,
  accion_recomendada: 3000,
  evidencia_detalle: 2000,
  evidencia_items: 30,
  archivos_leidos: 30,
});
export const RESULT_SAFETY_RATIO = 0.75;

export function materializeResultSchema(baseSchema, limits = RESULT_LIMITS) {
  const schema = structuredClone(baseSchema);
  const properties = schema?.properties;
  if (!properties?.veredicto || !properties?.resumen || !properties?.accion_recomendada
    || !properties?.evidencia?.items?.properties?.detalle || !properties?.archivos_leidos) {
    fail("Schema base de resultado incompatible");
  }
  properties.veredicto.maxLength = limits.veredicto;
  properties.resumen.maxLength = limits.resumen;
  properties.accion_recomendada.maxLength = limits.accion_recomendada;
  properties.evidencia.maxItems = limits.evidencia_items;
  properties.evidencia.items.properties.detalle.maxLength = limits.evidencia_detalle;
  properties.archivos_leidos.maxItems = limits.archivos_leidos;
  properties.archivos_leidos.uniqueItems = true;
  return schema;
}

export function renderResultLimits(limits = RESULT_LIMITS, safetyRatio = RESULT_SAFETY_RATIO) {
  const safety = (value) => Math.floor(value * safetyRatio);
  return [
    `- \`veredicto\`: máximo duro ${limits.veredicto} caracteres; objetivo de seguridad ${safety(limits.veredicto)}.`,
    `- \`resumen\`: máximo duro ${limits.resumen} caracteres; objetivo de seguridad ${safety(limits.resumen)}.`,
    `- \`accion_recomendada\`: máximo duro ${limits.accion_recomendada} caracteres; objetivo de seguridad ${safety(limits.accion_recomendada)}.`,
    `- Cada \`evidencia[].detalle\`: máximo duro ${limits.evidencia_detalle} caracteres; objetivo de seguridad ${safety(limits.evidencia_detalle)}.`,
    `- \`evidencia\`: máximo ${limits.evidencia_items} ítems.`,
    `- \`archivos_leidos\`: máximo ${limits.archivos_leidos} ítems únicos.`,
  ].join("\n");
}

export function buildKimiFinalInstruction(limits = RESULT_LIMITS) {
  return [
    "Ejecutá la revisión congelada de tu system prompt y devolvé exclusivamente el objeto JSON requerido.",
    "Exceder cualquier límite duro invalida toda la inferencia; no se truncará ni reparará la salida.",
    "Para los campos extensos, mantenete como objetivo de seguridad en no más del 75 % del máximo duro:",
    renderResultLimits(limits),
    "No repitas todos los invariantes en `resumen`: usá `evidencia` para el detalle breve y `resumen` sólo para la síntesis.",
  ].join("\n");
}

const BASE_RESULT_SCHEMA = readJson(RESULT_SCHEMA);
export const EFFECTIVE_RESULT_SCHEMA = materializeResultSchema(BASE_RESULT_SCHEMA, RESULT_LIMITS);

export const GOVERNING_CONTEXT = Object.freeze({
  common: Object.freeze([
    "reglas.md",
    "decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md",
    "equipo.md",
    "decisiones/README.md",
    "pendientes.md",
  ]),
  claude: "CLAUDE.md",
  codex: "AGENTS.md",
  kimi: "reviewer-policy.md",
});

export const LABELS = [
  "handoff:waiting", "handoff:ready", "handoff:running", "handoff:done", "handoff:failed",
  "handoff:stale", "handoff:blocked", "handoff:blocked-via",
];

const TERMINAL_LABELS = new Set([
  "handoff:done", "handoff:failed", "handoff:stale", "handoff:blocked", "handoff:blocked-via",
]);

export class HandoffError extends Error {
  constructor(message, label = "handoff:failed") {
    super(message);
    this.name = "HandoffError";
    this.label = label;
  }
}

export class CrashSimulation extends Error {
  constructor(message = "Caída simulada después de running") {
    super(message);
    this.name = "CrashSimulation";
  }
}

function fail(message, label = "handoff:failed") {
  throw new HandoffError(message, label);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
}

function safeRelativePath(path) {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.startsWith("\\")) return false;
  const normalized = path.replaceAll("\\", "/");
  return !normalized.split("/").includes("..") && !normalized.includes("\0");
}

function onlyKeys(value, keys, label, terminalLabel = "handoff:blocked") {
  const extras = Object.keys(value).filter((key) => !keys.includes(key));
  if (extras.length) fail(`${label}: campos incompatibles: ${extras.join(", ")}`, terminalLabel);
}

function requiredGoverningContext(recipient) {
  return [...GOVERNING_CONTEXT.common, GOVERNING_CONTEXT[recipient]];
}

export function validateContract(contract, config) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) fail("Contrato no es objeto", "handoff:blocked");
  onlyKeys(contract, [
    "handoff_version", "tarea", "destinatario", "head_sha", "base_sha", "head_ref",
    "contexto_autorizado", "resultado_previo", "origen", "salida_requerida", "modo", "profundidad_cadena",
  ], "contrato");
  if (contract.handoff_version !== "1") fail("handoff_version incompatible", "handoff:blocked");
  if (typeof contract.tarea !== "string" || !contract.tarea.trim() || contract.tarea.length > 8000) fail("tarea inválida", "handoff:blocked");
  if (!["claude", "codex", "kimi"].includes(contract.destinatario) || !config.agents[contract.destinatario]) fail("destinatario inválido", "handoff:blocked");
  if (!/^[0-9a-f]{40}$/.test(contract.head_sha ?? "")) fail("head_sha inválido", "handoff:blocked");
  if (contract.base_sha !== undefined && !/^[0-9a-f]{40}$/.test(contract.base_sha)) fail("base_sha inválido", "handoff:blocked");
  if (contract.head_ref !== undefined && !HEAD_REF_PATTERN.test(contract.head_ref)) fail("head_ref inválido", "handoff:blocked");
  if (!Array.isArray(contract.contexto_autorizado) || contract.contexto_autorizado.length < 1 || contract.contexto_autorizado.length > 30) fail("contexto_autorizado inválido", "handoff:blocked");
  if (new Set(contract.contexto_autorizado).size !== contract.contexto_autorizado.length || contract.contexto_autorizado.some((path) => !safeRelativePath(path))) fail("contexto_autorizado inseguro", "handoff:blocked");
  const missingGoverningContext = requiredGoverningContext(contract.destinatario)
    .filter((path) => !contract.contexto_autorizado.includes(path));
  if (missingGoverningContext.length) {
    fail(`contexto_autorizado omite canon gobernante: ${missingGoverningContext.join(", ")}`, "handoff:blocked");
  }
  if (contract.resultado_previo !== null) {
    const previous = contract.resultado_previo;
    if (!previous || typeof previous !== "object" || Array.isArray(previous)) fail("resultado_previo inválido", "handoff:blocked");
    onlyKeys(previous, ["issue", "marker", "result_sha256"], "resultado_previo");
    if (!Number.isInteger(previous.issue) || previous.issue < 1 || typeof previous.marker !== "string" || !/^[0-9a-f]{64}$/.test(previous.result_sha256 ?? "")) fail("resultado_previo incompleto", "handoff:blocked");
  }
  const origin = contract.origen;
  if (!origin || typeof origin !== "object" || Array.isArray(origin)) fail("origen inválido", "handoff:blocked");
  onlyKeys(origin, ["tipo", "ejecutor", "rol", "modelo", "esfuerzo", "issue_origen"], "origen");
  if (contract.profundidad_cadena === 1) {
    if (origin.tipo !== "agente" || origin.ejecutor !== "claude" || origin.rol !== "arquitecto"
      || typeof origin.modelo !== "string" || !origin.modelo || typeof origin.esfuerzo !== "string" || !origin.esfuerzo
      || origin.issue_origen !== null || contract.resultado_previo !== null) {
      fail("El handoff inicial no declara origen Claude / Arquitecto válido", "handoff:blocked");
    }
  } else if (origin.tipo !== "puente" || origin.ejecutor !== "handoff.mjs" || origin.rol !== "orquestador"
    || origin.modelo !== null || origin.esfuerzo !== null || !Number.isInteger(origin.issue_origen)
    || contract.resultado_previo === null || origin.issue_origen !== contract.resultado_previo.issue) {
    fail("El relevo no declara origen del puente válido", "handoff:blocked");
  }
  if (typeof contract.salida_requerida !== "string" || !contract.salida_requerida.trim() || contract.salida_requerida.length > 4000) fail("salida_requerida inválida", "handoff:blocked");
  if (contract.modo !== "solo_lectura") fail("modo debe ser solo_lectura", "handoff:blocked");
  if (!Number.isInteger(contract.profundidad_cadena) || contract.profundidad_cadena < 1) fail("profundidad_cadena inválida", "handoff:blocked");
  if (contract.profundidad_cadena > config.max_relevos) fail("Profundidad de cadena excedida", "handoff:blocked");
  return { ...contract, head_ref: contract.head_ref ?? config.default_head_ref };
}

export function validateResultAgainstSchema(result, schema = EFFECTIVE_RESULT_SCHEMA) {
  if (!result || typeof result !== "object" || Array.isArray(result)) fail("Salida no es objeto");
  onlyKeys(result, [
    "handoff_version", "estado", "veredicto", "resumen", "evidencia", "archivos_leidos",
    "accion_recomendada", "siguiente_destinatario", "firma",
  ], "resultado", "handoff:failed");
  if (result.handoff_version !== "1") fail("handoff_version de salida inválido");
  if (!["COMPLETADO", "BLOQUEADO"].includes(result.estado)) fail("estado de salida inválido");
  const properties = schema.properties;
  for (const key of ["veredicto", "resumen", "accion_recomendada"]) {
    if (typeof result[key] !== "string") fail(`${key} inválido`);
    if (result[key].length > properties[key].maxLength) fail(`${key} excede longitud máxima`);
  }
  if (!Array.isArray(result.evidencia) || result.evidencia.length > properties.evidencia.maxItems) fail("evidencia inválida");
  for (const item of result.evidencia) {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail("ítem de evidencia inválido");
    onlyKeys(item, ["archivo", "detalle"], "evidencia", "handoff:failed");
    if (typeof item.archivo !== "string" || typeof item.detalle !== "string") fail("evidencia incompleta");
    if (item.detalle.length > properties.evidencia.items.properties.detalle.maxLength) fail("detalle de evidencia excede longitud máxima");
  }
  if (!Array.isArray(result.archivos_leidos)
    || result.archivos_leidos.some((path) => typeof path !== "string")
    || result.archivos_leidos.length > properties.archivos_leidos.maxItems
    || (properties.archivos_leidos.uniqueItems === true
      && new Set(result.archivos_leidos).size !== result.archivos_leidos.length)) fail("archivos_leidos inválido");
  if (!["claude", "codex", "kimi", null].includes(result.siguiente_destinatario)) fail("siguiente_destinatario inválido");
  const signature = result.firma;
  if (!signature || typeof signature !== "object" || Array.isArray(signature)) fail("firma inválida");
  onlyKeys(signature, ["ejecutor", "modelo", "esfuerzo", "head_sha"], "firma", "handoff:failed");
  if (!["claude", "codex", "kimi"].includes(signature.ejecutor)
    || typeof signature.modelo !== "string" || typeof signature.esfuerzo !== "string"
    || typeof signature.head_sha !== "string") fail("firma inválida");
  return result;
}

export function validateResult(result, contract, config, schema = EFFECTIVE_RESULT_SCHEMA) {
  validateResultAgainstSchema(result, schema);
  for (const key of ["veredicto", "resumen", "accion_recomendada"]) {
    if (!result[key].trim()) fail(`${key} inválido`);
  }
  for (const item of result.evidencia) {
    if (!item.archivo || !item.detalle) fail("evidencia incompleta");
  }
  if (!Array.isArray(result.archivos_leidos) || result.archivos_leidos.some((path) => !contract.contexto_autorizado.includes(path))) fail("archivos_leidos fuera del contexto autorizado");
  if (result.siguiente_destinatario && !config.agents[result.siguiente_destinatario]) fail("siguiente_destinatario no configurado");
  const signature = result.firma;
  // La igualdad con contract.head_sha hereda su validación previa de 40 hex.
  if (signature.ejecutor !== contract.destinatario || signature.head_sha !== contract.head_sha) fail("firma no corresponde al contrato");
  if (!signature.modelo || !signature.esfuerzo) fail("modelo/esfuerzo de firma inválidos");
  if (contract.profundidad_cadena >= config.max_relevos && result.siguiente_destinatario !== null) fail("La salida intenta exceder max_relevos", "handoff:blocked");
  return result;
}

export function parseContractBody(body) {
  if (typeof body !== "string") fail("Issue sin cuerpo", "handoff:blocked");
  const fenced = body.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : body.replace(/<!--[\s\S]*?-->/g, "").trim();
  try {
    return JSON.parse(candidate);
  } catch (error) {
    fail(`Contrato JSON inválido: ${error.message}`, "handoff:blocked");
  }
}

function markerFor(issue, headSha, fingerprint) {
  return `<!-- handoff:${issue}:${headSha}:${fingerprint} -->`;
}

function childMarker(parentIssue, headSha, fingerprint) {
  return `<!-- handoff-child:${parentIssue}:${headSha}:${fingerprint} -->`;
}

function issueStatePath(runtimeDir, issue) {
  return join(runtimeDir, "issues", String(issue), "state.json");
}

function issueLockPath(runtimeDir, issue) {
  return join(runtimeDir, "issues", String(issue), "lock");
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function acquireLock(path, owner = { pid: process.pid, created_at: new Date().toISOString() }) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    mkdirSync(path, { recursive: false });
    writeJson(join(path, "owner.json"), owner);
    return true;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return false;
  }
}

function acquireRecoverableProcessLock(path, owner = { pid: process.pid, created_at: new Date().toISOString() }) {
  if (acquireLock(path, owner)) return true;
  try {
    const owner = readJson(join(path, "owner.json"));
    if (processAlive(owner.pid)) return false;
  } catch {
    return false;
  }
  releaseLock(path);
  return acquireLock(path, owner);
}

function releaseLock(path) {
  rmSync(path, { recursive: true, force: true });
}

function listFiles(root) {
  const files = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const absolute = join(dir, name);
      if (statSync(absolute).isDirectory()) visit(absolute);
      else files.push(relative(root, absolute).split(sep).join("/"));
    }
  };
  visit(root);
  return files.sort();
}

export function createManifest(inputDir, headSha, resultLimits = RESULT_LIMITS) {
  const entries = listFiles(inputDir).filter((path) => path !== "input-manifest.json").map((path) => {
    const content = readFileSync(join(inputDir, path));
    return { path, sha256: sha256(content), bytes: content.byteLength };
  });
  const inputFingerprint = sha256(Buffer.from(JSON.stringify(entries)));
  const manifest = {
    version: 1,
    head_sha: headSha,
    input_fingerprint: inputFingerprint,
    result_limits: { ...resultLimits },
    files: entries,
  };
  writeJson(join(inputDir, "input-manifest.json"), manifest);
  return manifest;
}

export function verifyManifest(inputDir, manifest) {
  for (const entry of manifest.files) {
    const content = readFileSync(join(inputDir, entry.path));
    if (sha256(content) !== entry.sha256 || content.byteLength !== entry.bytes) fail(`Input alterado: ${entry.path}`);
  }
  if (sha256(Buffer.from(JSON.stringify(manifest.files))) !== manifest.input_fingerprint) fail("input_fingerprint incompatible");
  return true;
}

function transitionLog(path, event) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, { encoding: "utf8", flag: "a" });
}

function gitShow(repo, sha, path, run = runProcess) {
  return run("git", ["-c", `safe.directory=${repo}`, "-C", repo, "show", `${sha}:${path}`], { env: buildChildEnv(), timeout: 60_000 }).stdout;
}

function gitCommitExists(repo, sha, run = runProcess) {
  run("git", ["-c", `safe.directory=${repo}`, "-C", repo, "cat-file", "-e", `${sha}^{commit}`], { env: buildChildEnv(), timeout: 30_000 });
  return true;
}

function gitDiff(repo, baseSha, headSha, run = runProcess) {
  return run("git", [
    "-c", `safe.directory=${repo}`, "-C", repo, "diff", "--binary", "--full-index",
    "--no-color", baseSha, headSha, "--",
  ], { env: buildChildEnv(), timeout: 60_000 }).stdout;
}

function canonicalResultExample(contract) {
  const examplePath = contract.contexto_autorizado[0];
  return {
    handoff_version: "1",
    estado: "COMPLETADO",
    veredicto: "Resultado breve.",
    resumen: "Resumen breve.",
    evidencia: [{ archivo: examplePath, detalle: "Evidencia breve." }],
    archivos_leidos: [examplePath],
    accion_recomendada: "Siguiente acción breve.",
    siguiente_destinatario: null,
    firma: {
      ejecutor: contract.destinatario,
      modelo: "NO_OBSERVABLE",
      esfuerzo: "NO_OBSERVABLE",
      head_sha: contract.head_sha,
    },
  };
}

export function buildPrompt(
  template, contract, previousResult, contexts, resultSchema, frozenDiff = null, resultLimits = RESULT_LIMITS,
) {
  const renderedContexts = contexts.map(({ path, content }) => `### ${path}\n\n${content}`).join("\n\n");
  const renderedDiff = frozenDiff === null ? "" : [
    "\n\n## Diff congelado base → HEAD",
    "",
    "El siguiente diff forma parte de la unidad congelada. No lo incluyas en",
    "`archivos_leidos`: ese campo sigue admitiendo únicamente paths de",
    "`contexto_autorizado`.",
    "",
    "```diff",
    frozenDiff,
    "```",
  ].join("\n");
  const values = {
    DESTINATARIO_MAYUSCULAS: contract.destinatario.toUpperCase(),
    CONTRATO: JSON.stringify(contract, null, 2),
    RESULTADO_PREVIO: previousResult ? JSON.stringify(previousResult, null, 2) : "null",
    CONTEXTO: renderedContexts,
    SCHEMA_SALIDA: typeof resultSchema === "string" ? resultSchema.trim() : JSON.stringify(resultSchema, null, 2),
    LIMITES_RESULTADO: renderResultLimits(resultLimits),
    EJEMPLO_SALIDA: JSON.stringify(canonicalResultExample(contract), null, 2),
    DIFF_CONGELADO: renderedDiff,
  };
  const replaced = [];
  const prompt = template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (!Object.hasOwn(values, key)) return match;
    replaced.push(key);
    return values[key];
  });
  const expected = Object.keys(values);
  if (replaced.length !== expected.length || expected.some((key) => !replaced.includes(key))) {
    fail(`Template de prompt incompatible: se esperaban exactamente estas claves: ${expected.join(", ")}`);
  }
  return prompt;
}

function extractCommentResult(body, marker, expectedHash) {
  if (!body.includes(marker)) return null;
  const fenced = body.match(/```json\s*([\s\S]*?)```/i);
  if (!fenced) fail("Comentario previo sin resultado JSON", "handoff:blocked");
  const raw = fenced[1].trim();
  if (sha256(Buffer.from(raw)) !== expectedHash) fail("Hash del resultado previo incompatible", "handoff:blocked");
  return JSON.parse(raw);
}

export function prepareInput({
  repo, contract, runDir, previousResult, run = runProcess, resultLimits = RESULT_LIMITS,
}) {
  gitCommitExists(repo, contract.head_sha, run);
  if (contract.base_sha) gitCommitExists(repo, contract.base_sha, run);
  const inputDir = join(runDir, "input");
  mkdirSync(inputDir, { recursive: true });
  writeJson(join(inputDir, "contract.json"), contract);
  writeJson(join(inputDir, "handoff.schema.json"), readJson(CONTRACT_SCHEMA));
  const resultSchema = materializeResultSchema(readJson(RESULT_SCHEMA), resultLimits);
  writeJson(join(inputDir, "handoff-result.schema.json"), resultSchema);
  writeJson(join(inputDir, "result-limits.json"), resultLimits);
  const contexts = contract.contexto_autorizado.map((path) => {
    const content = gitShow(repo, contract.head_sha, path, run);
    const target = join(inputDir, "context", ...path.replaceAll("\\", "/").split("/"));
    writeText(target, content);
    return { path, content };
  });
  const frozenDiff = contract.base_sha ? gitDiff(repo, contract.base_sha, contract.head_sha, run) : null;
  if (frozenDiff !== null) writeText(join(inputDir, "diff.patch"), frozenDiff);
  if (previousResult) writeJson(join(inputDir, "previous-result.json"), previousResult);
  const prompt = buildPrompt(
    readFileSync(PROMPT_TEMPLATE, "utf8"), contract, previousResult, contexts, resultSchema, frozenDiff, resultLimits,
  );
  writeText(join(inputDir, "prompt.md"), prompt);
  const manifest = createManifest(inputDir, contract.head_sha, resultLimits);
  verifyManifest(inputDir, manifest);
  writeJson(join(runDir, "input-manifest.json"), manifest);
  return { inputDir, manifest, prompt, resultSchema };
}

function parseClaude(stdout) {
  const envelope = JSON.parse(stdout);
  const candidate = envelope.structured_output ?? envelope.result;
  const result = typeof candidate === "string" ? JSON.parse(candidate) : candidate;
  return { result, telemetry: { usage: envelope.usage ?? null, model_usage: envelope.modelUsage ?? null } };
}

function parseCodex(stdout, finalPath) {
  const events = stdout.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const forbidden = events.find((event) => event.type === "item.completed" && !["agent_message", "reasoning"].includes(event.item?.type));
  if (forbidden) fail(`Codex intentó usar herramienta: ${forbidden.item?.type}`);
  const error = events.find((event) => event.type === "error" || event.type === "turn.failed");
  if (error) fail(`Codex falló: ${JSON.stringify(error)}`);
  const completed = [...events].reverse().find((event) => event.type === "turn.completed");
  return { result: readJson(finalPath), telemetry: { usage: completed?.usage ?? null } };
}

function parseKimi(stdout) {
  const events = stdout.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const forbidden = events.find((event) => !["meta", "assistant"].includes(event.role));
  if (forbidden) fail(`Kimi emitió un evento no permitido: ${forbidden.role ?? "sin rol"}`);
  const message = [...events].reverse().find((event) => event.role === "assistant" && typeof event.content === "string");
  if (!message) fail("Kimi no emitió contenido de Assistant");
  const fenced = message.content.match(/^\s*```json[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```[^\S\r\n]*$/i);
  const content = fenced?.[1] ?? message.content;
  let result;
  try {
    result = JSON.parse(content);
  } catch (error) {
    fail(`Kimi no emitió JSON válido: ${error.message}`);
  }
  const version = events.find((event) => event.role === "meta" && event.type === "system.version")?.version ?? null;
  const usage = [...events].reverse().find((event) => event.usage)?.usage ?? null;
  return { result, telemetry: { version, usage } };
}

export function observeUsageBeforeResultParse(agent, raw) {
  try {
    if (agent === "claude") {
      const envelope = JSON.parse(raw);
      return envelope.usage ?? envelope.modelUsage ?? null;
    }
    const events = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    if (agent === "codex") {
      return [...events].reverse().find((event) => event.type === "turn.completed")?.usage ?? null;
    }
    return [...events].reverse().find((event) => event.usage)?.usage ?? null;
  } catch {
    return null;
  }
}

export function invokeAgent({
  contract, adapter, prompt, runDir, run = runProcess, env = buildChildEnv(),
  resultSchema = EFFECTIVE_RESULT_SCHEMA, resultLimits = RESULT_LIMITS, observeAfter = null, now = Date.now,
}) {
  const started = now();
  let response;
  let executionError = null;
  let finalPath = null;
  const execute = (command, args, options) => {
    try {
      response = run(command, args, options);
    } catch (error) {
      executionError = error;
      response = {
        status: error?.status ?? null,
        stdout: error?.stdout ?? "",
        stderr: error?.stderr ?? "",
      };
    }
  };
  if (contract.destinatario === "claude") {
    const emptyMcp = join(runDir, "empty-mcp.json");
    writeJson(emptyMcp, { mcpServers: {} });
    execute(adapter.executable, [
      "--print", "--safe-mode", "--tools", "", "--strict-mcp-config", "--mcp-config", emptyMcp,
      "--disable-slash-commands", "--no-chrome", "--no-session-persistence", "--output-format", "json",
      "--json-schema", JSON.stringify(resultSchema), "--model", adapter.model, "--effort", adapter.effort,
    ], { cwd: runDir, env, input: Buffer.from(prompt, "utf8"), timeout: adapter.timeout_ms });
  } else if (contract.destinatario === "codex") {
    finalPath = join(runDir, "final.json");
    const runtimeSchemaPath = join(runDir, "handoff-result.effective.schema.json");
    writeJson(runtimeSchemaPath, resultSchema);
    execute(adapter.executable, [
      "exec", "--strict-config", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check",
      "--sandbox", "read-only", "--cd", runDir, "--model", adapter.model,
      "--config", `model_reasoning_effort=\"${adapter.effort}\"`, "--config", "approval_policy=\"never\"",
      "--config", "web_search=\"disabled\"", "--config", "features.shell_tool=false",
      "--config", "features.apps=false", "--config", "features.code_mode.enabled=false",
      "--output-schema", runtimeSchemaPath, "--output-last-message", finalPath, "--json", "--color", "never", "-",
    ], { cwd: runDir, env, input: Buffer.from(prompt, "utf8"), timeout: adapter.timeout_ms });
  } else {
    const emptySkills = join(runDir, "empty-kimi-skills");
    const agentFile = join(runDir, "kimi-reviewer.md");
    mkdirSync(emptySkills, { recursive: true });
    writeText(agentFile, `---\nname: handoff-reviewer\ndescription: Reviewer aislado del paquete congelado\ntools: []\n---\n\n${prompt}`);
    const kimiEnv = buildChildEnv(env, {
      KIMI_CODE_NO_AUTO_UPDATE: "1",
      KIMI_DISABLE_TELEMETRY: "1",
      KIMI_MODEL_THINKING_EFFORT: adapter.effort,
    });
    execute(adapter.executable, [
      "--model", adapter.alias, "--agent-file", agentFile, "--skills-dir", emptySkills,
      "--output-format", "stream-json", "--prompt", buildKimiFinalInstruction(resultLimits),
    ], { cwd: runDir, env: kimiEnv, timeout: adapter.timeout_ms });
  }
  const raw = response?.stdout ?? "";
  const duration = now() - started;
  writeText(join(runDir, "raw-output.jsonl"), raw);
  const receipt = {
    provider: contract.destinatario,
    model_requested: adapter.alias ?? adapter.model,
    duration_ms: duration,
    exit_code: response?.status ?? null,
    usage_observable: observeUsageBeforeResultParse(contract.destinatario, raw),
  };
  writeJson(join(runDir, "invocation-receipt.json"), receipt);
  let viaAfter = null;
  let viaError = null;
  if (observeAfter) {
    try {
      viaAfter = observeAfter();
    } catch (error) {
      viaError = error;
      viaAfter = {
        valid: false,
        observed_via: "NO_OBSERVABLE",
        cause: "POST_INVOCATION_VIA_OBSERVATION_FAILED",
      };
    }
    writeJson(join(runDir, "via-observada.json"), viaAfter);
  }
  if (executionError) throw executionError;
  if (viaError) throw viaError;
  const parsed = contract.destinatario === "claude" ? parseClaude(raw)
    : contract.destinatario === "codex" ? parseCodex(raw, finalPath)
      : parseKimi(raw);
  return { ...parsed, duration_ms: duration, receipt, viaAfter };
}

export class GithubBackend {
  constructor(repository, options = {}) {
    this.repository = repository;
    this.run = options.run ?? runProcess;
    this.env = options.env ?? buildChildEnv();
  }

  gh(args, options = {}) {
    return this.run("gh", args, { env: this.env, timeout: options.timeout ?? 60_000, input: options.input, cwd: options.cwd }).stdout.trim();
  }

  ensureLabels() {
    const colors = { waiting: "d4c5f9", ready: "1f883d", running: "bf8700", done: "0969da", failed: "cf222e", stale: "8250df", blocked: "bc4c00", "blocked-via": "a40e26" };
    for (const label of LABELS) this.gh(["label", "create", label, "--repo", this.repository, "--color", colors[label.slice(8)], "--force"]);
  }

  listByLabel(label) {
    const raw = this.gh(["issue", "list", "--repo", this.repository, "--state", "open", "--label", label, "--limit", "100", "--json", "number,title,body,createdAt,labels,url,author"]);
    return JSON.parse(raw || "[]").sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.number - b.number);
  }

  setState(issue, from, to) {
    const args = ["issue", "edit", String(issue), "--repo", this.repository, "--add-label", to];
    if (from) args.push("--remove-label", from);
    this.gh(args);
  }

  comments(issue) {
    const raw = this.gh(["api", `repos/${this.repository}/issues/${issue}/comments`, "--paginate", "--slurp"]);
    const pages = JSON.parse(raw || "[]");
    return Array.isArray(pages[0]) ? pages.flat() : pages;
  }

  publish(issue, bodyFile) {
    return this.gh(["issue", "comment", String(issue), "--repo", this.repository, "--body-file", bodyFile]);
  }

  currentHead(ref) {
    return this.gh(["api", `repos/${this.repository}/git/ref/heads/${ref}`, "--jq", ".object.sha"]);
  }

  checkRun(pr, name) {
    const raw = this.gh(["pr", "view", String(pr), "--repo", this.repository, "--json", "statusCheckRollup"]);
    const checks = JSON.parse(raw || "{}").statusCheckRollup ?? [];
    const matches = checks.filter((check) => check.__typename === "CheckRun" && check.name === name);
    if (matches.length > 1) fail(`Check run ambiguo en PR #${pr}: ${name}`, "handoff:blocked");
    return matches[0] ?? null;
  }

  findChild(marker) {
    const raw = this.gh(["issue", "list", "--repo", this.repository, "--state", "all", "--limit", "100", "--json", "number,body,url"]);
    return JSON.parse(raw || "[]").find((issue) => (issue.body ?? "").includes(marker)) ?? null;
  }

  createIssue(title, bodyFile) {
    const url = this.gh(["issue", "create", "--repo", this.repository, "--title", title, "--body-file", bodyFile, "--label", "handoff:ready"]);
    const number = Number(url.match(/\/(\d+)$/)?.[1]);
    if (!Number.isInteger(number)) throw new Error(`No se pudo obtener número del Issue: ${url}`);
    return { number, url };
  }
}

function stateFor(runtimeDir, issue) {
  const path = issueStatePath(runtimeDir, issue);
  return existsSync(path) ? readJson(path) : null;
}

function saveState(runtimeDir, issue, state) {
  writeJson(issueStatePath(runtimeDir, issue), state);
}

async function recoverOrphans({ backend, runtimeDir, transitions }) {
  const recovered = [];
  for (const issue of backend.listByLabel("handoff:running")) {
    const state = stateFor(runtimeDir, issue.number);
    if (!state) {
      backend.setState(issue.number, "handoff:running", "handoff:blocked");
      transitionLog(transitions, { issue: issue.number, from: "running", to: "blocked", reason: "running sin estado local" });
      continue;
    }
    if (processAlive(state.owner_pid)) continue;
    const recoveries = state.recovery_count ?? 0;
    if (recoveries >= 1 && state.phase !== "result_persisted" && state.phase !== "published") {
      backend.setState(issue.number, "handoff:running", "handoff:blocked");
      saveState(runtimeDir, issue.number, { ...state, phase: "blocked", blocked_reason: "reintento automático agotado" });
      transitionLog(transitions, { issue: issue.number, from: "running", to: "blocked", reason: "reintento agotado" });
      continue;
    }
    releaseLock(issueLockPath(runtimeDir, issue.number));
    backend.setState(issue.number, "handoff:running", "handoff:ready");
    saveState(runtimeDir, issue.number, { ...state, phase: "recovered", previous_phase: state.phase, recovery_count: recoveries + 1, owner_pid: null });
    transitionLog(transitions, { issue: issue.number, from: "running", to: "ready", reason: "huérfano recuperado" });
    recovered.push(issue.number);
  }
  return recovered;
}

function resultComment(marker, result) {
  const raw = JSON.stringify(result, null, 2);
  return { raw, body: `${marker}\n\n\`\`\`json\n${raw}\n\`\`\`\n` };
}

function childContract(parentContract, result, pointer) {
  const governingContext = requiredGoverningContext(result.siguiente_destinatario);
  const childTask = result.siguiente_destinatario === "kimi"
    ? `Revisar como Reviewer independiente el resultado estructurado del handoff previo para: ${parentContract.tarea}`
    : `Auditar como Arquitecto / Lead el resultado estructurado del handoff previo para: ${parentContract.tarea}`;
  return {
    handoff_version: "1",
    tarea: childTask,
    destinatario: result.siguiente_destinatario,
    head_sha: parentContract.head_sha,
    ...(parentContract.base_sha ? { base_sha: parentContract.base_sha } : {}),
    head_ref: parentContract.head_ref,
    contexto_autorizado: [...new Set([...parentContract.contexto_autorizado, ...governingContext])],
    resultado_previo: pointer,
    origen: {
      tipo: "puente", ejecutor: "handoff.mjs", rol: "orquestador",
      modelo: null, esfuerzo: null, issue_origen: pointer.issue,
    },
    salida_requerida: "Auditoría estructurada del resultado previo, con siguiente_destinatario=null.",
    modo: "solo_lectura",
    profundidad_cadena: parentContract.profundidad_cadena + 1,
  };
}

function observeVia(authObserver, agent, adapter) {
  try {
    return authObserver(agent, adapter);
  } catch (error) {
    fail(`No se pudo observar la vía de ${agent}: ${error.message}`, "handoff:blocked-via");
  }
}

async function loadPreviousResult(backend, pointer) {
  if (!pointer) return null;
  for (const comment of backend.comments(pointer.issue)) {
    const found = extractCommentResult(comment.body ?? "", pointer.marker, pointer.result_sha256);
    if (found) return found;
  }
  fail("No se encontró el resultado_previo publicado", "handoff:blocked");
}

async function processIssue(context, issue) {
  const { backend, config, repo, runtimeDir, artifactsDir, transitions, invoke, authObserver, hooks } = context;
  let currentLabel = "handoff:ready";
  let contract;
  let state = stateFor(runtimeDir, issue.number);
  const lockPath = issueLockPath(runtimeDir, issue.number);
  if (!acquireLock(lockPath)) return { issue: issue.number, status: "locked" };
  try {
    try {
      contract = validateContract(parseContractBody(issue.body), config);
      const remoteHead = await backend.currentHead(contract.head_ref);
      if (remoteHead !== contract.head_sha) fail(`HEAD movido: esperado ${contract.head_sha}; actual ${remoteHead}`, "handoff:stale");
      backend.setState(issue.number, "handoff:ready", "handoff:running");
      currentLabel = "handoff:running";
      state = {
        ...(state ?? {}), issue: issue.number, owner_pid: hooks?.crash_owner_pid ?? process.pid,
        phase: state?.phase === "recovered" ? (state.previous_phase ?? "running") : (state?.phase ?? "running"),
        recovery_count: state?.recovery_count ?? 0, head_sha: contract.head_sha,
      };
      saveState(runtimeDir, issue.number, state);
      transitionLog(transitions, { issue: issue.number, from: "ready", to: "running" });
      if (hooks?.afterClaim) await hooks.afterClaim({ issue, contract, state });

      const runDir = state.run_dir ?? join(artifactsDir, `issue-${issue.number}-${contract.head_sha.slice(0, 12)}`);
      mkdirSync(runDir, { recursive: true });
      const previousResult = await loadPreviousResult(backend, contract.resultado_previo);
      const prepared = prepareInput({ repo, contract, runDir, previousResult, run: context.run });
      const marker = markerFor(issue.number, contract.head_sha, prepared.manifest.input_fingerprint);
      const resultPath = join(runDir, "result.validated.json");
      let result;
      let invocation = null;
      let viaBefore;
      let viaAfter;

      if (existsSync(resultPath) && ["result_persisted", "published"].includes(state.phase)) {
        result = validateResult(readJson(resultPath), contract, config);
      } else {
        const adapter = { ...config.agents[contract.destinatario], timeout_ms: config.timeout_ms };
        viaBefore = observeVia(authObserver, contract.destinatario, adapter);
        writeJson(join(runDir, "via-before.json"), viaBefore);
        if (!viaBefore.valid) fail("La vía preflight no coincide o no es demostrable", "handoff:blocked-via");
        invocation = invoke({
          contract,
          adapter,
          prompt: prepared.prompt,
          runDir,
          run: context.run,
          env: buildChildEnv(),
          resultSchema: prepared.resultSchema,
          resultLimits: prepared.manifest.result_limits,
          observeAfter: () => observeVia(authObserver, contract.destinatario, adapter),
        });
        viaAfter = invocation.viaAfter ?? observeVia(authObserver, contract.destinatario, adapter);
        if (!invocation.viaAfter) writeJson(join(runDir, "via-observada.json"), viaAfter);
        if (!viaAfter.valid) fail("La vía observada no coincide o no es demostrable", "handoff:blocked-via");
        result = validateResult(invocation.result, contract, config, prepared.resultSchema);
        writeJson(resultPath, result);
        state = { ...state, phase: "result_persisted", previous_phase: "result_persisted", run_dir: runDir, marker };
        saveState(runtimeDir, issue.number, state);
        if (hooks?.afterPersist) await hooks.afterPersist({ issue, contract, state, result });
      }

      const remoteHeadAfter = await backend.currentHead(contract.head_ref);
      if (remoteHeadAfter !== contract.head_sha) fail(`HEAD movido durante la corrida: ${remoteHeadAfter}`, "handoff:stale");
      if (!viaAfter) {
        const adapter = { ...config.agents[contract.destinatario], timeout_ms: config.timeout_ms };
        viaAfter = observeVia(authObserver, contract.destinatario, adapter);
        writeJson(join(runDir, "via-observada.json"), viaAfter);
        if (!viaAfter.valid) fail("La vía observada no coincide o no es demostrable", "handoff:blocked-via");
      }

      const { raw, body } = resultComment(marker, result);
      const existing = backend.comments(issue.number).find((comment) => (comment.body ?? "").includes(marker));
      if (!existing) {
        const bodyFile = join(runDir, "result-comment.md");
        writeText(bodyFile, body);
        await backend.publish(issue.number, bodyFile);
      }
      state = { ...state, phase: "published", previous_phase: "published", marker, result_sha256: sha256(Buffer.from(raw)) };
      saveState(runtimeDir, issue.number, state);

      let child = null;
      if (result.siguiente_destinatario) {
        if (contract.profundidad_cadena >= config.max_relevos) fail("Siguiente relevo excede max_relevos", "handoff:blocked");
        const pointer = { issue: issue.number, marker, result_sha256: state.result_sha256 };
        const nextContract = childContract(contract, result, pointer);
        validateContract(nextContract, config);
        const childId = childMarker(issue.number, contract.head_sha, prepared.manifest.input_fingerprint);
        child = backend.findChild(childId);
        if (!child) {
          const childBody = `${childId}\n\n\`\`\`json\n${JSON.stringify(nextContract, null, 2)}\n\`\`\`\n`;
          const bodyFile = join(runDir, "child-issue.md");
          writeText(bodyFile, childBody);
          child = await backend.createIssue(`handoff: ${nextContract.destinatario} / ${nextContract.head_sha.slice(0, 12)}`, bodyFile);
        }
        state = { ...state, child_issue: child.number };
        saveState(runtimeDir, issue.number, state);
      }

      backend.setState(issue.number, "handoff:running", "handoff:done");
      currentLabel = "handoff:done";
      saveState(runtimeDir, issue.number, { ...state, phase: "done", owner_pid: null });
      transitionLog(transitions, { issue: issue.number, from: "running", to: "done", child_issue: child?.number ?? null });
      writeJson(join(runDir, "telemetry.json"), {
        issue: issue.number, head_sha: contract.head_sha, input_fingerprint: prepared.manifest.input_fingerprint,
        prompt_sha256: prepared.manifest.files.find((entry) => entry.path === "prompt.md")?.sha256,
        via_before: viaBefore ?? "reused_result", via_after: viaAfter,
        duration_ms: invocation?.duration_ms ?? 0, invocation: invocation?.telemetry ?? null,
        result_sha256: state.result_sha256, child_issue: child?.number ?? null,
      });
      return { issue: issue.number, status: "done", child_issue: child?.number ?? null };
    } catch (error) {
      if (error instanceof CrashSimulation) throw error;
      const persistedState = stateFor(runtimeDir, issue.number) ?? state ?? {};
      if (!(error instanceof HandoffError) && ["result_persisted", "published"].includes(persistedState.phase)) {
        saveState(runtimeDir, issue.number, { ...persistedState, owner_pid: null, github_error: error.message });
        transitionLog(transitions, { issue: issue.number, from: "running", to: "running", error: error.message, recoverable: true });
        return { issue: issue.number, status: "deferred", error: error.message };
      }
      const label = error instanceof HandoffError ? error.label : "handoff:failed";
      if (!TERMINAL_LABELS.has(label)) throw error;
      if (currentLabel === "handoff:running" || currentLabel === "handoff:ready") {
        backend.setState(issue.number, currentLabel, label);
        currentLabel = label;
      }
      const current = stateFor(runtimeDir, issue.number) ?? state ?? {};
      saveState(runtimeDir, issue.number, { ...current, phase: label.slice(8), owner_pid: null, error: error.message });
      transitionLog(transitions, { issue: issue.number, from: "running", to: label.slice(8), error: error.message });
      const adapter = contract ? config.agents[contract.destinatario] : null;
      return {
        issue: issue.number,
        status: label.slice(8),
        error: error.message,
        ...(label === "handoff:blocked-via" ? {
          failed_via: adapter?.authorized_via ?? null,
          authorized_fallback_via: adapter?.authorized_fallback_via ?? null,
        } : {}),
      };
    }
  } finally {
    if (!(hooks?.preserveLockOnCrash && currentLabel === "handoff:running")) releaseLock(lockPath);
  }
}

function compactReason(value, limit = 240) {
  const reason = String(value ?? "sin motivo informado").replace(/\s+/g, " ").trim();
  return reason.length <= limit ? reason : `${reason.slice(0, limit - 1)}…`;
}

async function notifySafely(notify, payload) {
  try {
    await notify(payload);
  } catch (error) {
    console.warn(`ntfy: ${payload.event} falló sin afectar poll: ${error.message}`);
  }
}

async function notifyPollResult({ backend, processed, notify }) {
  const ready = await backend.listByLabel("handoff:ready");
  for (const issue of ready) {
    await notifySafely(notify, {
      event: "ready_pending",
      title: "Handoff pendiente",
      message: `Issue #${issue.number} quedó en handoff:ready. Volvé a ejecutar poll.`,
      priority: 4,
      tags: ["hourglass_flowing_sand"],
    });
  }

  for (const result of processed.filter((item) => ["failed", "blocked", "stale"].includes(item.status))) {
    await notifySafely(notify, {
      event: "terminal_error",
      title: "Handoff requiere atención",
      message: `Issue #${result.issue} terminó en handoff:${result.status}: ${compactReason(result.error)}`,
      priority: 4,
      tags: ["warning"],
    });
  }

  for (const result of processed.filter((item) => item.status === "blocked-via")) {
    if (result.authorized_fallback_via) {
      await notifySafely(notify, {
        event: "fallback_available",
        title: "Handoff cambió de vía",
        message: `Issue #${result.issue}: la vía ${result.failed_via ?? "seleccionada"} no pudo demostrarse; contingencia autorizada disponible: ${result.authorized_fallback_via}.`,
        priority: 2,
        tags: ["information_source"],
      });
      continue;
    }
    await notifySafely(notify, {
      event: "terminal_error",
      title: "Handoff requiere atención",
      message: `Issue #${result.issue} terminó en handoff:blocked-via sin contingencia autorizada: ${compactReason(result.error)}`,
      priority: 4,
      tags: ["warning"],
    });
    await notifySafely(notify, {
      event: "needs_human",
      title: "Handoff requiere intervención",
      message: `Issue #${result.issue} no tiene una vía autorizada disponible: ${compactReason(result.error)}`,
      priority: 5,
      tags: ["rotating_light"],
    });
  }

  for (const result of processed.filter((item) => item.status === "done" && item.child_issue === null)) {
    await notifySafely(notify, {
      event: "chain_complete",
      title: "Cadena de handoff completada",
      message: `Issue #${result.issue} completó la cadena sin siguiente destinatario.`,
      priority: 3,
      tags: ["white_check_mark"],
    });
  }
}

const WAIT_CONDITIONS = new Set(["tiempo", "check_run"]);
const WAIT_FIELDS = [
  "handoff_wait_version", "condicion", "parametros", "intervalo_segundos", "max_intentos", "blocked_since",
];
const MAX_BACKOFF_SECONDS = 60 * 60;
const BLOCKED_LONG_MS = 24 * 60 * 60 * 1000;

function labelsOf(issue) {
  if (issue.labels instanceof Set) return [...issue.labels];
  return (issue.labels ?? []).map((label) => typeof label === "string" ? label : label.name);
}

function parseWaitDescriptor(issue, comments) {
  const markerPattern = new RegExp(`^<!-- handoff-wait:${issue.number}:([0-9a-f]{40}) -->\\r?$`, "m");
  const candidates = comments.filter((comment) => markerPattern.test(comment.body ?? ""));
  if (candidates.length !== 1) fail(
    candidates.length ? "Descriptor de espera ambiguo" : "Descriptor de espera ausente",
    "handoff:blocked",
  );
  const body = candidates[0].body ?? "";
  const exact = body.match(/^<!-- handoff-wait:(\d+):([0-9a-f]{40}) -->\s*```json\s*([\s\S]*?)```\s*$/i);
  if (!exact || Number(exact[1]) !== issue.number) fail("Descriptor de espera inválido", "handoff:blocked");
  let descriptor;
  try {
    descriptor = JSON.parse(exact[3]);
  } catch (error) {
    fail(`Descriptor de espera JSON inválido: ${error.message}`, "handoff:blocked");
  }
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) fail("Descriptor de espera no es objeto", "handoff:blocked");
  onlyKeys(descriptor, WAIT_FIELDS, "descriptor de espera");
  if (WAIT_FIELDS.some((field) => !Object.hasOwn(descriptor, field))) fail("Descriptor de espera incompleto", "handoff:blocked");
  if (descriptor.handoff_wait_version !== "1") fail("handoff_wait_version incompatible", "handoff:blocked");
  if (!WAIT_CONDITIONS.has(descriptor.condicion)) fail(`Condición de espera desconocida: ${descriptor.condicion}`, "handoff:blocked");
  if (!descriptor.parametros || typeof descriptor.parametros !== "object" || Array.isArray(descriptor.parametros)) fail("parametros de espera inválidos", "handoff:blocked");
  if (!Number.isInteger(descriptor.intervalo_segundos) || descriptor.intervalo_segundos < 1) fail("intervalo_segundos inválido", "handoff:blocked");
  if (!Number.isInteger(descriptor.max_intentos) || descriptor.max_intentos < 1) fail("max_intentos inválido", "handoff:blocked");
  const blockedAt = Date.parse(descriptor.blocked_since);
  if (typeof descriptor.blocked_since !== "string" || !Number.isFinite(blockedAt)) fail("blocked_since inválido", "handoff:blocked");
  if (descriptor.condicion === "tiempo") {
    onlyKeys(descriptor.parametros, [], "parametros de tiempo");
  } else {
    onlyKeys(descriptor.parametros, ["pr", "nombre"], "parametros de check_run");
    if (!Number.isInteger(descriptor.parametros.pr) || descriptor.parametros.pr < 1
      || typeof descriptor.parametros.nombre !== "string" || !descriptor.parametros.nombre) {
      fail("parametros de check_run inválidos", "handoff:blocked");
    }
  }
  const contract = parseContractBody(issue.body);
  if (contract.head_sha !== exact[2]) fail("HEAD del descriptor de espera no coincide con el contrato", "handoff:blocked");
  return { descriptor, blockedAt };
}

async function evaluateWaitCondition(descriptor, backend) {
  if (descriptor.condicion === "tiempo") return { fulfilled: true, error: null };
  const check = await backend.checkRun(descriptor.parametros.pr, descriptor.parametros.nombre);
  const conclusion = check?.conclusion ?? null;
  return {
    fulfilled: conclusion === "SUCCESS",
    error: check ? `check_run ${descriptor.parametros.nombre}: ${conclusion ?? check.status ?? "SIN_CONCLUSION"}`
      : `check_run ${descriptor.parametros.nombre}: NO_ENCONTRADO`,
  };
}

async function notifyWaitBlocked({ notify, issue, reason, exhausted = false }) {
  if (exhausted) {
    await notifySafely(notify, {
      event: "terminal_error",
      title: "Handoff agotó reintentos",
      message: `Issue #${issue.number} terminó en handoff:blocked: ${compactReason(reason)}`,
      priority: 4,
      tags: ["warning"],
    });
  }
  await notifySafely(notify, {
    event: "needs_human",
    title: "Handoff requiere intervención",
    message: `Issue #${issue.number} requiere atención: ${compactReason(reason)}`,
    priority: 5,
    tags: ["rotating_light"],
  });
}

function retryPolicy(descriptor, state) {
  if (descriptor) return {
    intervalo_segundos: descriptor.intervalo_segundos,
    max_intentos: descriptor.max_intentos,
  };
  return state.retry_policy ?? null;
}

async function blockWaitingUnit({ backend, runtimeDir, transitions, notify, issue, state, reason, intentos, exhausted = false }) {
  backend.setState(issue.number, "handoff:waiting", "handoff:blocked");
  saveState(runtimeDir, issue.number, {
    ...state, phase: "blocked", ...(intentos === undefined ? {} : { intentos }),
    next_check_at: null, ultimo_error: reason,
  });
  transitionLog(transitions, { issue: issue.number, from: "waiting", to: "blocked", reason });
  await notifyWaitBlocked({ notify, issue, reason, exhausted });
}

async function recordUnexpectedWaitFailure({
  backend, runtimeDir, transitions, notify, issue, state, descriptor, currentMs, error,
}) {
  const reason = `Error inesperado al evaluar la espera: ${error.message}`;
  if (state.intentos !== undefined && (!Number.isInteger(state.intentos) || state.intentos < 0)) {
    await blockWaitingUnit({
      backend, runtimeDir, transitions, notify, issue, state, reason: "intentos local inválido",
    });
    return;
  }
  const intentos = (state.intentos ?? 0) + 1;
  const policy = retryPolicy(descriptor, state);
  if (policy && (!Number.isInteger(policy.intervalo_segundos) || policy.intervalo_segundos < 1
    || !Number.isInteger(policy.max_intentos) || policy.max_intentos < 1)) {
    await blockWaitingUnit({
      backend, runtimeDir, transitions, notify, issue, state, reason: "retry_policy local inválida",
    });
    return;
  }
  if (policy && intentos > policy.max_intentos) {
    await blockWaitingUnit({
      backend, runtimeDir, transitions, notify, issue, state,
      reason: `max_intentos agotado (${policy.max_intentos}): ${reason}`,
      intentos, exhausted: true,
    });
    return;
  }
  const backoffSeconds = policy
    ? Math.min(MAX_BACKOFF_SECONDS, policy.intervalo_segundos * (2 ** (intentos - 1)))
    : MAX_BACKOFF_SECONDS;
  saveState(runtimeDir, issue.number, {
    ...state, phase: "waiting", intentos,
    next_check_at: new Date(currentMs + backoffSeconds * 1000).toISOString(),
    ultimo_error: reason,
  });
  transitionLog(transitions, {
    issue: issue.number, from: "waiting", to: "waiting", error: reason, recoverable: true,
  });
  await notifySafely(notify, {
    event: "wait_check_error",
    title: "Handoff no pudo evaluar la espera",
    message: `Issue #${issue.number} seguirá en handoff:waiting: ${compactReason(reason)}`,
    priority: 4,
    tags: ["warning"],
  });
}

export async function tick(options = {}) {
  const config = options.config ?? readJson(options.configPath ?? DEFAULT_CONFIG);
  const repo = resolve(options.repo ?? ROOT);
  const runtimeDir = resolve(options.runtimeDir ?? RUNTIME);
  const artifactsDir = resolve(options.artifactsDir ?? ARTIFACTS);
  const backend = options.backend ?? new GithubBackend(config.repository);
  const notify = options.notify ?? createNotifier();
  const warn = options.warn ?? console.warn;
  const now = options.now ?? (() => new Date());
  const pollFn = options.pollFn ?? poll;
  const transitions = join(artifactsDir, "transitions.log");
  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(artifactsDir, { recursive: true });
  const globalLock = join(runtimeDir, "poll.lock");
  if (!acquireRecoverableProcessLock(globalLock)) return { status: "locked", promovidas: [], poll: null };
  const promovidas = [];
  let rescatables = [];
  try {
    if (options.ensureLabels === true) await backend.ensureLabels();
    const waiting = await backend.listByLabel("handoff:waiting");
    rescatables = (await backend.listByLabel("handoff:ready"))
      .filter((issue) => stateFor(runtimeDir, issue.number)?.phase === "ready")
      .map((issue) => issue.number);
    for (const issue of waiting) {
      if (labelsOf(issue).some((label) => TERMINAL_LABELS.has(label))) continue;
      let state = stateFor(runtimeDir, issue.number) ?? {};
      const currentTime = now();
      const currentMs = currentTime.getTime();
      let parsed;
      try {
        parsed = parseWaitDescriptor(issue, await backend.comments(issue.number));
      } catch (error) {
        if (error instanceof HandoffError) {
          await blockWaitingUnit({ backend, runtimeDir, transitions, notify, issue, state, reason: error.message });
        } else {
          await recordUnexpectedWaitFailure({
            backend, runtimeDir, transitions, notify, issue, state, descriptor: null, currentMs, error,
          });
        }
        continue;
      }

      const { descriptor, blockedAt } = parsed;
      state = { ...state, retry_policy: retryPolicy(descriptor, state) };
      if (currentMs - blockedAt > BLOCKED_LONG_MS && state.blocked_long_notified !== true) {
        await notifySafely(notify, {
          event: "blocked_long",
          title: "Handoff en espera prolongada",
          message: `Issue #${issue.number} lleva más de 24 h en handoff:waiting.`,
          priority: 3,
          tags: ["hourglass"],
        });
        state = { ...state, blocked_long_notified: true };
        saveState(runtimeDir, issue.number, state);
      }
      if (state.intentos !== undefined && (!Number.isInteger(state.intentos) || state.intentos < 0)) {
        const reason = "intentos local inválido";
        backend.setState(issue.number, "handoff:waiting", "handoff:blocked");
        saveState(runtimeDir, issue.number, { ...state, phase: "blocked", ultimo_error: reason });
        transitionLog(transitions, { issue: issue.number, from: "waiting", to: "blocked", reason });
        await notifyWaitBlocked({ notify, issue, reason });
        continue;
      }
      const initialNextMs = blockedAt + descriptor.intervalo_segundos * 1000;
      const nextCheckMs = state.next_check_at ? Date.parse(state.next_check_at) : initialNextMs;
      if (!Number.isFinite(nextCheckMs)) {
        const reason = "next_check_at local inválido";
        backend.setState(issue.number, "handoff:waiting", "handoff:blocked");
        saveState(runtimeDir, issue.number, { ...state, phase: "blocked", ultimo_error: reason });
        transitionLog(transitions, { issue: issue.number, from: "waiting", to: "blocked", reason });
        await notifyWaitBlocked({ notify, issue, reason });
        continue;
      }
      if (!state.next_check_at) state = { ...state, intentos: state.intentos ?? 0, next_check_at: new Date(nextCheckMs).toISOString(), ultimo_error: state.ultimo_error ?? null };
      if (nextCheckMs > currentMs) {
        saveState(runtimeDir, issue.number, state);
        continue;
      }

      let evaluated;
      try {
        evaluated = await evaluateWaitCondition(descriptor, backend);
      } catch (error) {
        if (error instanceof HandoffError) {
          await blockWaitingUnit({ backend, runtimeDir, transitions, notify, issue, state, reason: error.message });
        } else {
          await recordUnexpectedWaitFailure({
            backend, runtimeDir, transitions, notify, issue, state, descriptor, currentMs, error,
          });
        }
        continue;
      }
      if (!evaluated.fulfilled) {
        const intentos = (state.intentos ?? 0) + 1;
        if (intentos > descriptor.max_intentos) {
          const reason = `max_intentos agotado (${descriptor.max_intentos}): ${evaluated.error}`;
          backend.setState(issue.number, "handoff:waiting", "handoff:blocked");
          saveState(runtimeDir, issue.number, { ...state, phase: "blocked", intentos, next_check_at: null, ultimo_error: reason });
          transitionLog(transitions, { issue: issue.number, from: "waiting", to: "blocked", reason });
          await notifyWaitBlocked({ notify, issue, reason, exhausted: true });
          continue;
        }
        const backoffSeconds = Math.min(MAX_BACKOFF_SECONDS, descriptor.intervalo_segundos * (2 ** (intentos - 1)));
        saveState(runtimeDir, issue.number, {
          ...state, phase: "waiting", intentos,
          next_check_at: new Date(currentMs + backoffSeconds * 1000).toISOString(),
          ultimo_error: evaluated.error,
        });
        continue;
      }

      backend.setState(issue.number, "handoff:waiting", "handoff:ready");
      const { retry_policy: _retryPolicy, ...stateWithoutRetryPolicy } = state;
      saveState(runtimeDir, issue.number, {
        ...stateWithoutRetryPolicy, phase: "ready", intentos: 0, blocked_long_notified: false,
        next_check_at: null, ultimo_error: null, resumed_at: currentTime.toISOString(),
      });
      transitionLog(transitions, { issue: issue.number, from: "waiting", to: "ready", condition: descriptor.condicion });
      promovidas.push(issue.number);
      await notifySafely(notify, {
        event: "resumed",
        title: "Handoff reanudado",
        message: `Issue #${issue.number} pasó de handoff:waiting a handoff:ready.`,
        priority: 3,
        tags: ["arrow_forward"],
      });
    }
  } finally {
    releaseLock(globalLock);
  }

  for (const issue of rescatables) {
    transitionLog(transitions, {
      issue, from: "ready", to: "ready", reason: "scheduler_retry_dispatch", recoverable: true,
    });
  }
  const pollResult = (promovidas.length || rescatables.length) ? await pollFn({
    config, repo, runtimeDir, artifactsDir, backend, notify,
    invoke: options.invoke, authObserver: options.authObserver, run: options.run,
  }) : null;
  if (promovidas.length) {
    const processed = new Set((pollResult?.processed ?? []).map((result) => result.issue));
    const pendientes = promovidas.filter((issue) => !processed.has(issue));
    if (pendientes.length) {
      const reason = `poll no procesó unidades promovidas por tick: ${pendientes.join(", ")}`;
      warn(`handoff: ${reason}`);
      for (const issue of pendientes) {
        transitionLog(transitions, {
          issue, from: "ready", to: "ready", reason: "poll_no_proceso_promocion", recoverable: true,
        });
      }
      await notifySafely(notify, {
        event: "dispatch_gap",
        title: "Handoff promovido pendiente",
        message: `${reason}. Un tick posterior intentará rescatarlo.`,
        priority: 4,
        tags: ["warning"],
      });
    }
  }
  return { status: "complete", promovidas, poll: pollResult };
}

export async function poll(options = {}) {
  const config = options.config ?? readJson(options.configPath ?? DEFAULT_CONFIG);
  const repo = resolve(options.repo ?? ROOT);
  const runtimeDir = resolve(options.runtimeDir ?? RUNTIME);
  const artifactsDir = resolve(options.artifactsDir ?? ARTIFACTS);
  const backend = options.backend ?? new GithubBackend(config.repository);
  const invoke = options.invoke ?? invokeAgent;
  const authObserver = options.authObserver ?? ((agent, adapter) => observeAuthentication(agent, adapter));
  const notify = options.notify ?? createNotifier();
  const transitions = join(artifactsDir, "transitions.log");
  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(artifactsDir, { recursive: true });
  const globalLock = join(runtimeDir, "poll.lock");
  const lockOwner = { pid: options.hooks?.crash_owner_pid ?? process.pid, created_at: new Date().toISOString() };
  if (!acquireRecoverableProcessLock(globalLock, lockOwner)) return { status: "locked", processed: [] };
  const processed = [];
  const processedIssues = new Set();
  try {
    if (options.ensureLabels === true) await backend.ensureLabels();
    await recoverOrphans({ backend, runtimeDir, transitions });
    while (processed.length < config.max_unidades_por_corrida) {
      const ready = await backend.listByLabel("handoff:ready");
      const issue = ready.find((candidate) => !processedIssues.has(candidate.number));
      if (!issue) break;
      processedIssues.add(issue.number);
      const result = await processIssue({
        backend, config, repo, runtimeDir, artifactsDir, transitions, invoke, authObserver,
        hooks: options.hooks, run: options.run ?? runProcess,
      }, issue);
      processed.push(result);
      if (result.status === "locked") break;
    }
    const outcome = { status: "complete", processed };
    try {
      await notifyPollResult({ backend, processed, notify });
    } catch (error) {
      console.warn(`ntfy: fallo inesperado no bloqueante: ${error.message}`);
    }
    return outcome;
  } finally {
    if (!options.preserveGlobalLock) releaseLock(globalLock);
  }
}

function usage() {
  return "Uso: node scripts/handoff/handoff.mjs poll | tick | setup-labels";
}

export async function main(argv = process.argv.slice(2)) {
  const [command] = argv;
  const config = readJson(DEFAULT_CONFIG);
  const backend = new GithubBackend(config.repository);
  if (command === "setup-labels") {
    backend.ensureLabels();
    return { status: "labels_ready" };
  }
  if (command === "poll") return poll({ config, backend });
  if (command === "tick") return tick({ config, backend });
  fail(usage(), "handoff:blocked");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(`FAIL_CLOSED: ${error.message}`);
    process.exitCode = 1;
  });
}
