#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA = join(HERE, "common-review.schema.json");
const DEFAULT_CONFIG = join(HERE, "config.json");
const IMPACTS = ["M1", "M2", "M3", "O"];
const EVIDENCE_STATES = ["SETTLED", "NEEDS_EVIDENCE", "UNVERIFIABLE"];
const EVIDENCE_ORIGINS = ["DIFF", "REPOSITORY_FILE", "GITHUB_STATE", "ACTIONS_RUN", "NONE"];
const SEVERITY = { M1: 4, M2: 3, M3: 2, O: 1 };

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i];
    if (!key.startsWith("--")) fail(`Argumento inesperado: ${key}`);
    const value = rest[i + 1];
    if (value === undefined || value.startsWith("--")) fail(`Falta valor para ${key}`);
    options[key.slice(2)] = value;
    i += 1;
  }
  return { command, options };
}

function required(options, name) {
  const value = options[name];
  if (!value) fail(`Falta --${name}`);
  return value;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileHash(path) {
  return sha256(readFileSync(path));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    input: options.input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout ?? 20 * 60 * 1000,
    windowsHide: true,
  });
  if (result.error) {
    const error = new Error(`${command}: ${result.error.message}`);
    error.stdout = result.stdout ?? "";
    error.stderr = result.stderr ?? "";
    throw error;
  }
  if (result.status !== 0) {
    const error = new Error(`${command} terminó con ${result.status}: ${(result.stderr || result.stdout || "sin salida").trim()}`);
    error.stdout = result.stdout ?? "";
    error.stderr = result.stderr ?? "";
    throw error;
  }
  return result;
}

function git(repo, args) {
  return run("git", ["-C", repo, ...args]).stdout.trim();
}

export function verifyHead(repo, expected) {
  const actual = git(repo, ["rev-parse", "HEAD"]);
  if (actual !== expected) fail(`HEAD movido: esperado ${expected}; actual ${actual}`);
  return actual;
}

function isNullableString(value) {
  return value === null || typeof value === "string";
}

function assertOnlyKeys(value, allowed, label) {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) fail(`${label}: campos incompatibles: ${extras.join(", ")}`);
}

export function validateReviewPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("Review no es un objeto");
  assertOnlyKeys(payload, ["decision_preliminar", "resumen", "hallazgos"], "payload");
  if (!['REQUEST_CHANGES', 'COMMENT', 'APPROVE'].includes(payload.decision_preliminar)) fail("decision_preliminar inválida");
  if (typeof payload.resumen !== "string" || payload.resumen.length > 4000) fail("resumen inválido");
  if (!Array.isArray(payload.hallazgos)) fail("hallazgos debe ser un array");
  if (payload.hallazgos.length > 12) fail("demasiados hallazgos");
  for (const [index, finding] of payload.hallazgos.entries()) {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) fail(`hallazgo ${index} inválido`);
    assertOnlyKeys(finding, ["impacto", "estado_evidencia", "origen_evidencia", "path", "line", "titulo", "descripcion", "solicitud_verificacion"], `hallazgo ${index}`);
    if (!IMPACTS.includes(finding.impacto)) fail(`hallazgo ${index}: impacto inválido`);
    if (!EVIDENCE_STATES.includes(finding.estado_evidencia)) fail(`hallazgo ${index}: evidencia inválida`);
    if (!EVIDENCE_ORIGINS.includes(finding.origen_evidencia)) fail(`hallazgo ${index}: origen inválido`);
    if (!isNullableString(finding.path)) fail(`hallazgo ${index}: path inválido`);
    if (!(finding.line === null || (Number.isInteger(finding.line) && finding.line > 0))) fail(`hallazgo ${index}: line inválida`);
    if (typeof finding.titulo !== "string" || !finding.titulo.trim()) fail(`hallazgo ${index}: título inválido`);
    if (typeof finding.descripcion !== "string" || !finding.descripcion.trim()) fail(`hallazgo ${index}: descripción inválida`);
    if (finding.titulo.length > 300 || finding.descripcion.length > 1800) fail(`hallazgo ${index}: texto excede schema`);
    if (finding.estado_evidencia === "SETTLED") {
      if (finding.origen_evidencia === "NONE") fail(`hallazgo ${index}: SETTLED sin origen`);
      if (finding.solicitud_verificacion !== null) fail(`hallazgo ${index}: SETTLED no admite solicitud`);
    } else {
      if (finding.origen_evidencia !== "NONE") fail(`hallazgo ${index}: evidencia abierta debe usar NONE`);
      if (finding.estado_evidencia === "NEEDS_EVIDENCE" && (!finding.solicitud_verificacion || typeof finding.solicitud_verificacion !== "object")) {
        fail(`hallazgo ${index}: NEEDS_EVIDENCE requiere solicitud`);
      }
    }
    if (finding.solicitud_verificacion !== null) {
      const request = finding.solicitud_verificacion;
      if (!request || typeof request !== "object" || Array.isArray(request)) fail(`hallazgo ${index}: solicitud inválida`);
      assertOnlyKeys(request, ["pregunta_cerrada", "por_que_importa", "fuente_requerida", "objetivo_concreto"], `hallazgo ${index}.solicitud`);
      for (const key of ["pregunta_cerrada", "por_que_importa", "fuente_requerida", "objetivo_concreto"]) {
        if (typeof request[key] !== "string" || !request[key]) fail(`hallazgo ${index}: solicitud incompleta`);
      }
      if (!["REPOSITORY_FILE", "GITHUB_STATE", "ACTIONS_RUN", "OFFICIAL_DOCUMENTATION", "NONE_AVAILABLE"].includes(request.fuente_requerida)) {
        fail(`hallazgo ${index}: fuente requerida inválida`);
      }
    }
  }
  return payload;
}

export function validateCommonReview(review) {
  if (!review || typeof review !== "object") fail("Review común inválida");
  assertOnlyKeys(review, ["reviewer", "head_sha", "decision_preliminar", "resumen", "hallazgos", "telemetria"], "review común");
  if (!['claude', 'codex'].includes(review.reviewer)) fail("reviewer inválido");
  if (!/^[0-9a-f]{40}$/.test(review.head_sha || "")) fail("head_sha inválido");
  if (!['REQUEST_CHANGES', 'COMMENT', 'APPROVE'].includes(review.decision_preliminar)) fail("decision_preliminar inválida");
  if (!review.telemetria || typeof review.telemetria !== "object" || Array.isArray(review.telemetria)) fail("telemetria inválida");
  validateReviewPayload({
    decision_preliminar: review.decision_preliminar,
    resumen: review.resumen,
    hallazgos: review.hallazgos,
  });
  return review;
}

function outputSchema(commonSchema) {
  return {
    $schema: commonSchema.$schema,
    $defs: commonSchema.$defs,
    ...commonSchema.$defs.review_payload,
  };
}

function contextFiles(repo) {
  return ["AGENTS.md", "reviewer-policy.md", "vision.md", "reglas.md"].map((name) => ({
    name,
    content: readFileSync(join(repo, name), "utf8"),
  }));
}

function buildPrompt(pr, diff, contexts) {
  const context = contexts.map(({ name, content }) => `\n## ${name}\n\n${content}`).join("\n");
  return `Sos un reviewer independiente de una pull request. Analizá únicamente el material incluido abajo. No uses memoria de otras sesiones, reviews previas ni resultados de otro reviewer. No ejecutes herramientas ni busques fuentes externas.\n\nDevolvé exclusivamente un objeto JSON válido conforme al schema entregado. Aplicá reviewer-policy.md. Un hallazgo SETTLED necesita evidencia suficiente en el material servido. Si falta evidencia, usá NEEDS_EVIDENCE o UNVERIFIABLE y no lo presentes como hecho cerrado. No incluyas secretos ni razonamiento interno.\n\n## Pull request\n\n${JSON.stringify(pr, null, 2)}\n${context}\n\n## Diff completo\n\n\`\`\`diff\n${diff}\n\`\`\`\n`;
}

export function createManifest(inputDir, files, headSha) {
  const entries = files.map((relativePath) => ({
    path: relativePath.replaceAll("\\", "/"),
    sha256: fileHash(join(inputDir, relativePath)),
    bytes: readFileSync(join(inputDir, relativePath)).byteLength,
  })).sort((a, b) => a.path.localeCompare(b.path));
  const inputFingerprint = sha256(Buffer.from(JSON.stringify(entries)));
  return { version: 1, head_sha: headSha, input_fingerprint: inputFingerprint, files: entries };
}

export function verifyInputManifest(inputDir, manifest) {
  for (const entry of manifest.files) {
    const actual = fileHash(join(inputDir, entry.path));
    if (actual !== entry.sha256) fail(`Input alterado: ${entry.path}`);
  }
  const recomputed = sha256(Buffer.from(JSON.stringify(manifest.files)));
  if (recomputed !== manifest.input_fingerprint) fail("Fingerprint de input incompatible");
  return true;
}

function prepare(options) {
  const repo = resolve(required(options, "repo"));
  const pr = readJson(required(options, "pr-json"));
  const headSha = required(options, "head-sha");
  const out = resolve(required(options, "out"));
  const schema = readJson(options.schema ?? DEFAULT_SCHEMA);
  verifyHead(repo, headSha);
  if (pr.head?.sha !== headSha) fail(`La PR ya no apunta a ${headSha}`);
  if (!pr.base?.sha || !Number.isInteger(pr.number)) fail("Metadatos de PR incompletos");
  const diff = git(repo, ["diff", "--no-ext-diff", "--unified=80", pr.base.sha, headSha, "--"]);
  if (!diff) fail("Diff vacío; no hay caso para revisar");
  const changedPaths = git(repo, ["diff", "--name-only", pr.base.sha, headSha, "--"]).split(/\r?\n/).filter(Boolean);
  const inputDir = join(out, "input");
  mkdirSync(join(inputDir, "context"), { recursive: true });
  const normalizedPr = {
    number: pr.number,
    title: pr.title ?? "",
    body: pr.body ?? "",
    base_ref: pr.base.ref,
    base_sha: pr.base.sha,
    head_ref: pr.head.ref,
    head_sha: headSha,
    changed_paths: changedPaths,
  };
  writeJson(join(inputDir, "pr-metadata.json"), normalizedPr);
  writeFileSync(join(inputDir, "diff.patch"), `${diff}\n`, "utf8");
  const contexts = contextFiles(repo);
  for (const item of contexts) writeFileSync(join(inputDir, "context", item.name), item.content, "utf8");
  writeJson(join(inputDir, "model-output.schema.json"), outputSchema(schema));
  writeFileSync(join(inputDir, "review-prompt.txt"), buildPrompt(normalizedPr, diff, contexts), "utf8");
  const files = [
    "pr-metadata.json", "diff.patch", "model-output.schema.json", "review-prompt.txt",
    ...contexts.map(({ name }) => `context/${name}`),
  ];
  const manifest = createManifest(inputDir, files, headSha);
  writeJson(join(inputDir, "input-manifest.json"), manifest);
  return manifest;
}

function parseClaude(stdout) {
  const envelope = JSON.parse(stdout);
  const candidate = envelope.structured_output ?? envelope.result;
  const payload = typeof candidate === "string" ? JSON.parse(candidate) : candidate;
  return { payload, envelope };
}

function parseCodex(stdout, finalPath) {
  const events = stdout.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const forbidden = events.find((event) => event.type === "item.completed" && !["agent_message", "reasoning"].includes(event.item?.type));
  if (forbidden) fail(`Codex intentó usar una herramienta: ${forbidden.item?.type}`);
  const error = events.find((event) => event.type === "error" || event.type === "turn.failed");
  if (error) fail(`Codex falló: ${JSON.stringify(error)}`);
  const completed = [...events].reverse().find((event) => event.type === "turn.completed");
  const payload = JSON.parse(readFileSync(finalPath, "utf8"));
  return { payload, events, usage: completed?.usage ?? null };
}

function authenticationPath(reviewer) {
  if (reviewer === "claude") return process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY" : "sesión CLI configurada";
  return (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY) ? "API key" : "sesión CLI configurada";
}

function runReviewer(options) {
  const reviewer = required(options, "reviewer");
  const role = required(options, "role");
  if (!['claude', 'codex'].includes(reviewer) || !['principal', 'shadow'].includes(role)) fail("Reviewer o rol inválido");
  const inputDir = resolve(required(options, "input"));
  const out = resolve(required(options, "out"));
  const config = readJson(options.config ?? DEFAULT_CONFIG);
  const adapter = config.reviewers[reviewer];
  if (!adapter) fail(`No existe configuración para ${reviewer}`);
  const manifest = readJson(join(inputDir, "input-manifest.json"));
  verifyInputManifest(inputDir, manifest);
  const workspace = mkdtempSync(join(tmpdir(), `blind-review-${role}-`));
  cpSync(join(inputDir, "review-prompt.txt"), join(workspace, "review-prompt.txt"));
  cpSync(join(inputDir, "model-output.schema.json"), join(workspace, "model-output.schema.json"));
  const prompt = readFileSync(join(workspace, "review-prompt.txt"));
  const started = Date.now();
  let parsed;
  try {
    if (reviewer === "claude") {
      const emptyMcp = join(workspace, "empty-mcp.json");
      writeJson(emptyMcp, { mcpServers: {} });
      const result = run(adapter.executable, [
        "--print", "--safe-mode", "--tools", "", "--strict-mcp-config",
        "--mcp-config", emptyMcp, "--disable-slash-commands", "--no-chrome", "--no-session-persistence",
        "--output-format", "json", "--json-schema", readFileSync(join(workspace, "model-output.schema.json"), "utf8"),
        "--model", adapter.model, "--effort", adapter.effort,
      ], { cwd: workspace, input: prompt });
      parsed = parseClaude(result.stdout);
    } else {
      const finalPath = join(workspace, "final.json");
      const result = run(adapter.executable, [
        "exec", "--strict-config", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check",
        "--sandbox", "read-only", "--cd", workspace, "--model", adapter.model,
        "--config", `model_reasoning_effort=\"${adapter.effort}\"`, "--config", "approval_policy=\"never\"",
        "--config", "web_search=\"disabled\"", "--config", "features.shell_tool=false",
        "--config", "features.apps=false", "--config", "features.code_mode.enabled=false",
        "--output-schema", join(workspace, "model-output.schema.json"),
        "--output-last-message", finalPath, "--json", "--color", "never", "-",
      ], { cwd: workspace, input: prompt });
      parsed = parseCodex(result.stdout, finalPath);
    }
    validateReviewPayload(parsed.payload);
    const durationMs = Date.now() - started;
    const providerUsage = reviewer === "claude" ? (parsed.envelope.usage ?? null) : parsed.usage;
    const common = {
      reviewer,
      head_sha: manifest.head_sha,
      decision_preliminar: parsed.payload.decision_preliminar,
      resumen: parsed.payload.resumen,
      hallazgos: parsed.payload.hallazgos,
      telemetria: {
        ...parsed.payload.telemetria,
        role,
        model_configured: adapter.model,
        model_runtime: parsed.envelope?.modelUsage ? Object.keys(parsed.envelope.modelUsage) : "NO_OBSERVABLE",
        effort_configured: adapter.effort,
        effort_runtime: "NO_OBSERVABLE",
        usage: providerUsage,
        duration_ms: durationMs,
        retries: 0,
        tool_calls: 0,
        operational_failure: null,
        authentication_path: authenticationPath(reviewer),
        quota: "NO_OBSERVABLE en la salida de esta CLI",
        input_fingerprint: manifest.input_fingerprint,
        prompt_sha256: manifest.files.find((entry) => entry.path === "review-prompt.txt")?.sha256,
      },
    };
    validateCommonReview(common);
    writeJson(out, common);
    return common;
  } catch (error) {
    writeJson(join(dirname(out), `failure-${role}.json`), {
      reviewer,
      role,
      head_sha: manifest.head_sha,
      operational_failure: error.message,
      duration_ms: Date.now() - started,
      input_fingerprint: manifest.input_fingerprint,
      stderr_length: typeof error.stderr === "string" ? error.stderr.length : 0,
      stdout_length: typeof error.stdout === "string" ? error.stdout.length : 0,
    });
    throw error;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

export function evaluateShadow({ principal, prNumber, changedPaths, mode, modulus = 5, riskPatterns = [] }) {
  const material = principal.hallazgos.some((finding) => ['M1', 'M2'].includes(finding.impacto));
  const sampling = !material && prNumber % modulus === 0;
  const risk = changedPaths.some((path) => riskPatterns.some((pattern) => new RegExp(pattern, "i").test(path)));
  const triggers = { material, muestreo: sampling, riesgo: risk };
  const runShadow = mode === "always" || (mode === "material|muestreo|riesgo" && Object.values(triggers).some(Boolean));
  if (!['always', 'material|muestreo|riesgo'].includes(mode)) fail(`shadow_trigger inválido: ${mode}`);
  return { mode, run_shadow: runShadow, triggers, sampling_modulus: modulus };
}

function decideShadow(options) {
  const principal = validateCommonReview(readJson(required(options, "principal")));
  const metadata = readJson(join(resolve(required(options, "input")), "pr-metadata.json"));
  const config = readJson(options.config ?? DEFAULT_CONFIG);
  const result = evaluateShadow({
    principal,
    prNumber: metadata.number,
    changedPaths: metadata.changed_paths,
    mode: required(options, "mode"),
    modulus: config.sampling_modulus,
    riskPatterns: config.risk_path_patterns,
  });
  writeJson(required(options, "out"), result);
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) writeFileSync(githubOutput, `run_shadow=${result.run_shadow}\n`, { encoding: "utf8", flag: "a" });
  return result;
}

export function parseDiffAnchors(diff) {
  const anchors = new Set();
  let currentPath = null;
  let newLine = 0;
  let inHunk = false;
  for (const line of diff.split(/\r?\n/)) {
    const pathMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (pathMatch) { currentPath = pathMatch[1]; inHunk = false; continue; }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { newLine = Number(hunk[1]); inHunk = true; continue; }
    if (!currentPath || !inHunk || line.startsWith("---") || line.startsWith("\\ No newline")) continue;
    if (line.startsWith("+")) { anchors.add(`${currentPath}:${newLine}`); newLine += 1; }
    else if (!line.startsWith("-")) { anchors.add(`${currentPath}:${newLine}`); newLine += 1; }
  }
  return anchors;
}

function anchorValid(finding, anchors) {
  return finding.path !== null && finding.line !== null && anchors.has(`${finding.path}:${finding.line}`);
}

export function fuseReviews({ principal, shadow = null, shadowDecision, anchors }) {
  validateCommonReview(principal);
  if (shadowDecision.run_shadow && !shadow) fail("Falta la review shadow requerida");
  if (!shadowDecision.run_shadow && shadow) fail("Estado imposible: hay shadow no requerido");
  if (shadow) {
    validateCommonReview(shadow);
    if (shadow.head_sha !== principal.head_sha) fail("Reviews sobre HEAD distintos");
    if (shadow.telemetria.input_fingerprint !== principal.telemetria.input_fingerprint) fail("Contaminación detectable: inputs diferentes");
    if (shadow.telemetria.prompt_sha256 !== principal.telemetria.prompt_sha256) fail("Contaminación detectable: prompts diferentes");
  }
  const candidates = [
    ...principal.hallazgos.map((finding) => ({ ...finding, reviewers: [principal.reviewer] })),
    ...(shadow?.hallazgos ?? []).map((finding) => ({ ...finding, reviewers: [shadow.reviewer] })),
  ];
  const merged = [];
  for (const finding of candidates) {
    const sameAnchor = finding.path !== null && finding.line !== null
      ? merged.find((existing) => existing.path === finding.path && existing.line === finding.line)
      : null;
    if (sameAnchor && sameAnchor.impacto !== finding.impacto) {
      if (SEVERITY[finding.impacto] > SEVERITY[sameAnchor.impacto]) {
        Object.assign(sameAnchor, finding, { reviewers: [...new Set([...sameAnchor.reviewers, ...finding.reviewers])] });
      } else {
        sameAnchor.reviewers = [...new Set([...sameAnchor.reviewers, ...finding.reviewers])];
      }
    } else {
      merged.push(finding);
    }
  }
  const findings = merged.map((finding) => ({ ...finding, ancla_valida: anchorValid(finding, anchors) }));
  const settledMaterial = findings.some((finding) => ['M1', 'M2'].includes(finding.impacto) && finding.estado_evidencia === "SETTLED" && finding.ancla_valida);
  const openMaterial = findings.some((finding) => ['M1', 'M2'].includes(finding.impacto) && !(finding.estado_evidencia === "SETTLED" && finding.ancla_valida));
  const decision = settledMaterial ? "REQUEST_CHANGES" : openMaterial ? "COMMENT" : "APPROVE";
  return {
    version: 1,
    head_sha: principal.head_sha,
    reviewers: shadow ? [principal.reviewer, shadow.reviewer] : [principal.reviewer],
    decision,
    hallazgos: findings,
    limitacion_deduplicacion: "No se deduplican equivalencias semánticas sin igualdad exacta de path+line.",
  };
}

function fuse(options) {
  const principal = readJson(required(options, "principal"));
  const decision = readJson(required(options, "shadow-decision"));
  const shadow = options.shadow ? readJson(options.shadow) : null;
  const inputDir = resolve(required(options, "input"));
  const manifest = readJson(join(inputDir, "input-manifest.json"));
  verifyInputManifest(inputDir, manifest);
  if (principal.head_sha !== manifest.head_sha) fail("Review principal no corresponde al input congelado");
  const result = fuseReviews({ principal, shadow, shadowDecision: decision, anchors: parseDiffAnchors(readFileSync(join(inputDir, "diff.patch"), "utf8")) });
  writeJson(required(options, "out"), result);
  const telemetry = {
    head_sha: result.head_sha,
    reviewers: [principal, ...(shadow ? [shadow] : [])].map((review) => review.telemetria),
    shadow_decision: decision,
    final_decision: result.decision,
  };
  writeJson(options.telemetry ?? join(dirname(required(options, "out")), "telemetry.json"), telemetry);
  return result;
}

function renderReviewBody(fusion) {
  const marker = `<!-- blind-review-pipeline:${fusion.head_sha} -->`;
  const findings = fusion.hallazgos.length === 0 ? "Sin hallazgos." : fusion.hallazgos.map((finding) => {
    const location = finding.path ? `${finding.path}${finding.line ? `:${finding.line}` : ""}` : "sin ancla";
    return `- **${finding.impacto} / ${finding.estado_evidencia}** — ${finding.titulo} (${location})\n  ${finding.descripcion}`;
  }).join("\n");
  return `${marker}\n## Review consolidada\n\nDecisión: **${fusion.decision}**\n\n${findings}`;
}

export async function publishReview({ mode, fusion, repository, prNumber, token, fetchImpl = fetch }) {
  if (mode === "none") return { mode, published: false, reason: "publish=none" };
  if (mode !== "consolidada") fail(`publish inválido: ${mode}`);
  if (!token) fail("Falta token para publicación consolidada");
  const base = `https://api.github.com/repos/${repository}/pulls/${prNumber}/reviews`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
  const marker = `<!-- blind-review-pipeline:${fusion.head_sha} -->`;
  const existingResponse = await fetchImpl(base, { headers });
  if (!existingResponse.ok) fail(`No se pudieron verificar publicaciones: HTTP ${existingResponse.status}`);
  const existing = await existingResponse.json();
  if (existing.some((review) => (review.body ?? "").includes(marker))) fail("Publicación consolidada duplicada");
  const event = fusion.decision === "REQUEST_CHANGES" ? "REQUEST_CHANGES" : fusion.decision === "APPROVE" ? "APPROVE" : "COMMENT";
  const response = await fetchImpl(base, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ commit_id: fusion.head_sha, event, body: renderReviewBody(fusion), comments: [] }),
  });
  if (!response.ok) fail(`Falló la publicación: HTTP ${response.status}`);
  const published = await response.json();
  return { mode, published: true, review_id: published.id, event };
}

async function publish(options) {
  const result = await publishReview({
    mode: required(options, "mode"), fusion: readJson(required(options, "fusion")),
    repository: required(options, "repository"), prNumber: Number(required(options, "pr")),
    token: process.env.GITHUB_TOKEN,
  });
  writeJson(required(options, "out"), result);
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (command === "prepare") return prepare(options);
  if (command === "run") return runReviewer(options);
  if (command === "decide-shadow") return decideShadow(options);
  if (command === "fuse") return fuse(options);
  if (command === "publish") return publish(options);
  fail(`Comando desconocido: ${command ?? "(vacío)"}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`FAIL_CLOSED: ${error.message}`);
    process.exitCode = 1;
  });
}
