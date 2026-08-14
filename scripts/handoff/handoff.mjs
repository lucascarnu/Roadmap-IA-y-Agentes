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
const RESULT_LIMITS = Object.freeze({
  veredicto: 2000,
  resumen: 6000,
  accion_recomendada: 3000,
  evidencia_detalle: 2000,
  evidencia_items: 30,
  archivos_leidos: 30,
});

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
  "handoff:ready", "handoff:running", "handoff:done", "handoff:failed",
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

export function validateResult(result, contract, config) {
  if (!result || typeof result !== "object" || Array.isArray(result)) fail("Salida no es objeto");
  onlyKeys(result, [
    "handoff_version", "estado", "veredicto", "resumen", "evidencia", "archivos_leidos",
    "accion_recomendada", "siguiente_destinatario", "firma",
  ], "resultado", "handoff:failed");
  if (result.handoff_version !== "1") fail("handoff_version de salida inválido");
  if (!["COMPLETADO", "BLOQUEADO"].includes(result.estado)) fail("estado de salida inválido");
  for (const key of ["veredicto", "resumen", "accion_recomendada"]) if (typeof result[key] !== "string" || !result[key].trim()) fail(`${key} inválido`);
  for (const key of ["veredicto", "resumen", "accion_recomendada"]) if (result[key].length > RESULT_LIMITS[key]) fail(`${key} excede longitud máxima`);
  if (!Array.isArray(result.evidencia) || result.evidencia.length > RESULT_LIMITS.evidencia_items) fail("evidencia inválida");
  for (const item of result.evidencia) {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail("ítem de evidencia inválido");
    onlyKeys(item, ["archivo", "detalle"], "evidencia", "handoff:failed");
    if (typeof item.archivo !== "string" || !item.archivo || typeof item.detalle !== "string" || !item.detalle) fail("evidencia incompleta");
    if (item.detalle.length > RESULT_LIMITS.evidencia_detalle) fail("detalle de evidencia excede longitud máxima");
  }
  if (!Array.isArray(result.archivos_leidos) || result.archivos_leidos.length > RESULT_LIMITS.archivos_leidos || new Set(result.archivos_leidos).size !== result.archivos_leidos.length) fail("archivos_leidos inválido");
  if (!Array.isArray(result.archivos_leidos) || result.archivos_leidos.some((path) => !contract.contexto_autorizado.includes(path))) fail("archivos_leidos fuera del contexto autorizado");
  if (!["claude", "codex", "kimi", null].includes(result.siguiente_destinatario)) fail("siguiente_destinatario inválido");
  if (result.siguiente_destinatario && !config.agents[result.siguiente_destinatario]) fail("siguiente_destinatario no configurado");
  const signature = result.firma;
  if (!signature || typeof signature !== "object" || Array.isArray(signature)) fail("firma inválida");
  onlyKeys(signature, ["ejecutor", "modelo", "esfuerzo", "head_sha"], "firma", "handoff:failed");
  // La igualdad con contract.head_sha hereda su validación previa de 40 hex.
  if (signature.ejecutor !== contract.destinatario || signature.head_sha !== contract.head_sha) fail("firma no corresponde al contrato");
  if (typeof signature.modelo !== "string" || !signature.modelo || typeof signature.esfuerzo !== "string" || !signature.esfuerzo) fail("modelo/esfuerzo de firma inválidos");
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

export function createManifest(inputDir, headSha) {
  const entries = listFiles(inputDir).filter((path) => path !== "input-manifest.json").map((path) => {
    const content = readFileSync(join(inputDir, path));
    return { path, sha256: sha256(content), bytes: content.byteLength };
  });
  const inputFingerprint = sha256(Buffer.from(JSON.stringify(entries)));
  const manifest = { version: 1, head_sha: headSha, input_fingerprint: inputFingerprint, files: entries };
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

export function buildPrompt(template, contract, previousResult, contexts, resultSchema, frozenDiff = null) {
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
    SCHEMA_SALIDA: resultSchema.trim(),
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

export function prepareInput({ repo, contract, runDir, previousResult, run = runProcess }) {
  gitCommitExists(repo, contract.head_sha, run);
  if (contract.base_sha) gitCommitExists(repo, contract.base_sha, run);
  const inputDir = join(runDir, "input");
  mkdirSync(inputDir, { recursive: true });
  writeJson(join(inputDir, "contract.json"), contract);
  writeJson(join(inputDir, "handoff.schema.json"), readJson(CONTRACT_SCHEMA));
  const resultSchema = readFileSync(RESULT_SCHEMA, "utf8");
  writeJson(join(inputDir, "handoff-result.schema.json"), JSON.parse(resultSchema));
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
    readFileSync(PROMPT_TEMPLATE, "utf8"), contract, previousResult, contexts, resultSchema, frozenDiff,
  );
  writeText(join(inputDir, "prompt.md"), prompt);
  const manifest = createManifest(inputDir, contract.head_sha);
  verifyManifest(inputDir, manifest);
  writeJson(join(runDir, "input-manifest.json"), manifest);
  return { inputDir, manifest, prompt };
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

export function invokeAgent({ contract, adapter, prompt, runDir, run = runProcess, env = buildChildEnv() }) {
  const started = Date.now();
  let parsed;
  let raw;
  if (contract.destinatario === "claude") {
    const emptyMcp = join(runDir, "empty-mcp.json");
    writeJson(emptyMcp, { mcpServers: {} });
    const response = run(adapter.executable, [
      "--print", "--safe-mode", "--tools", "", "--strict-mcp-config", "--mcp-config", emptyMcp,
      "--disable-slash-commands", "--no-chrome", "--no-session-persistence", "--output-format", "json",
      "--json-schema", readFileSync(RESULT_SCHEMA, "utf8"), "--model", adapter.model, "--effort", adapter.effort,
    ], { cwd: runDir, env, input: Buffer.from(prompt, "utf8"), timeout: adapter.timeout_ms });
    raw = response.stdout;
    parsed = parseClaude(raw);
  } else if (contract.destinatario === "codex") {
    const finalPath = join(runDir, "final.json");
    const response = run(adapter.executable, [
      "exec", "--strict-config", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check",
      "--sandbox", "read-only", "--cd", runDir, "--model", adapter.model,
      "--config", `model_reasoning_effort=\"${adapter.effort}\"`, "--config", "approval_policy=\"never\"",
      "--config", "web_search=\"disabled\"", "--config", "features.shell_tool=false",
      "--config", "features.apps=false", "--config", "features.code_mode.enabled=false",
      "--output-schema", RESULT_SCHEMA, "--output-last-message", finalPath, "--json", "--color", "never", "-",
    ], { cwd: runDir, env, input: Buffer.from(prompt, "utf8"), timeout: adapter.timeout_ms });
    raw = response.stdout;
    parsed = parseCodex(raw, finalPath);
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
    const response = run(adapter.executable, [
      "--model", adapter.alias, "--agent-file", agentFile, "--skills-dir", emptySkills,
      "--output-format", "stream-json", "--prompt",
      "Ejecutá la revisión congelada de tu system prompt y devolvé exclusivamente el objeto JSON requerido.",
    ], { cwd: runDir, env: kimiEnv, timeout: adapter.timeout_ms });
    raw = response.stdout;
    parsed = parseKimi(raw);
  }
  writeText(join(runDir, "raw-output.jsonl"), raw);
  return { ...parsed, duration_ms: Date.now() - started };
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
    const colors = { ready: "1f883d", running: "bf8700", done: "0969da", failed: "cf222e", stale: "8250df", blocked: "bc4c00", "blocked-via": "a40e26" };
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
        invocation = invoke({ contract, adapter, prompt: prepared.prompt, runDir, run: context.run, env: buildChildEnv() });
        result = validateResult(invocation.result, contract, config);
        writeJson(resultPath, result);
        state = { ...state, phase: "result_persisted", previous_phase: "result_persisted", run_dir: runDir, marker };
        saveState(runtimeDir, issue.number, state);
        if (hooks?.afterPersist) await hooks.afterPersist({ issue, contract, state, result });
      }

      const remoteHeadAfter = await backend.currentHead(contract.head_ref);
      if (remoteHeadAfter !== contract.head_sha) fail(`HEAD movido durante la corrida: ${remoteHeadAfter}`, "handoff:stale");
      const adapter = { ...config.agents[contract.destinatario], timeout_ms: config.timeout_ms };
      viaAfter = observeVia(authObserver, contract.destinatario, adapter);
      writeJson(join(runDir, "via-observada.json"), viaAfter);
      if (!viaAfter.valid) fail("La vía observada no coincide o no es demostrable", "handoff:blocked-via");

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
      return { issue: issue.number, status: label.slice(8), error: error.message };
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

  for (const result of processed.filter((item) => ["failed", "blocked", "blocked-via", "stale"].includes(item.status))) {
    await notifySafely(notify, {
      event: "terminal_error",
      title: "Handoff requiere atención",
      message: `Issue #${result.issue} terminó en handoff:${result.status}: ${compactReason(result.error)}`,
      priority: 4,
      tags: ["warning"],
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
  try {
    if (options.ensureLabels === true) await backend.ensureLabels();
    await recoverOrphans({ backend, runtimeDir, transitions });
    while (processed.length < config.max_unidades_por_corrida) {
      const ready = await backend.listByLabel("handoff:ready");
      if (!ready.length) break;
      const result = await processIssue({
        backend, config, repo, runtimeDir, artifactsDir, transitions, invoke, authObserver,
        hooks: options.hooks, run: options.run ?? runProcess,
      }, ready[0]);
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
  return "Uso: node scripts/handoff/handoff.mjs poll | setup-labels";
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
  fail(usage(), "handoff:blocked");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(`FAIL_CLOSED: ${error.message}`);
    process.exitCode = 1;
  });
}
