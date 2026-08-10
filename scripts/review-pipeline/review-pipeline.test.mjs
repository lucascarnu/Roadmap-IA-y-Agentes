import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCommonReview,
  createManifest,
  evaluateShadow,
  fuseReviews,
  main,
  parseDiffAnchors,
  publishReview,
  validateCommonReview,
  validateReviewPayload,
  verifyInputManifest,
} from "./review-pipeline.mjs";

const HEAD = "a".repeat(40);
const HERE = dirname(fileURLToPath(import.meta.url));

function finding(overrides = {}) {
  return {
    impacto: "M3",
    estado_evidencia: "SETTLED",
    origen_evidencia: "DIFF",
    path: "src/a.js",
    line: 2,
    titulo: "Hallazgo",
    descripcion: "Descripción verificable",
    solicitud_verificacion: null,
    ...overrides,
  };
}

function review(reviewer, hallazgos = [], fingerprint = "input-1") {
  return {
    reviewer,
    head_sha: HEAD,
    decision_preliminar: "COMMENT",
    resumen: "Resumen",
    hallazgos,
    telemetria: { input_fingerprint: fingerprint, prompt_sha256: "prompt-1" },
  };
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function initializeRepository(repo) {
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.invalid");
}

function commitAll(repo, message) {
  git(repo, "add", ".");
  git(repo, "commit", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

function createTrustedHarness(policy = "POLÍTICA GOBERNANTE A") {
  const trusted = mkdtempSync(join(tmpdir(), "blind-trusted-"));
  initializeRepository(trusted);
  const contents = {
    "AGENTS.md": "AGENTS CONFIABLE",
    "reviewer-policy.md": policy,
    "vision.md": "VISIÓN CONFIABLE",
    "reglas.md": "REGLAS CONFIABLES",
  };
  for (const [name, content] of Object.entries(contents)) writeFileSync(join(trusted, name), `${content}\n`, "utf8");
  return { root: trusted, sha: commitAll(trusted, "trusted harness") };
}

function prMetadata(number, base, head) {
  return { number, title: "Caso", body: "", base: { ref: "main", sha: base }, head: { ref: "topic", sha: head } };
}

function payload(hallazgos = []) {
  return { decision_preliminar: "COMMENT", resumen: "Resumen", hallazgos };
}

test("valida el contrato común y falla cerrado ante evidencia incoherente", () => {
  const candidate = review("claude", [finding()]);
  assert.equal(validateCommonReview(candidate), candidate);
});

test("rechaza SETTLED sin origen", () => {
  assert.throws(() => validateCommonReview(review("claude", [finding({ origen_evidencia: "NONE" })])), /SETTLED sin origen/);
});

test("gate material activa shadow aun con evidencia abierta", () => {
  const result = evaluateShadow({
    principal: review("claude", [finding({
      impacto: "M2", estado_evidencia: "NEEDS_EVIDENCE", origen_evidencia: "NONE",
      solicitud_verificacion: { pregunta_cerrada: "¿Pasa?", por_que_importa: "Es material", fuente_requerida: "ACTIONS_RUN", objetivo_concreto: "Observar el check" },
    })]),
    prNumber: 11,
    changedPaths: ["docs/a.md"],
    mode: "material|muestreo|riesgo",
  });
  assert.equal(result.run_shadow, true);
  assert.equal(result.triggers.material, true);
});

test("muestreo es determinista y sólo opera sin materialidad", () => {
  const base = { principal: review("claude"), changedPaths: ["docs/a.md"], mode: "material|muestreo|riesgo", modulus: 5 };
  assert.equal(evaluateShadow({ ...base, prNumber: 10 }).triggers.muestreo, true);
  assert.equal(evaluateShadow({ ...base, prNumber: 11 }).triggers.muestreo, false);
});

test("riesgo usa una lista corta de paths", () => {
  const result = evaluateShadow({
    principal: review("claude"), prNumber: 11, changedPaths: [".github/workflows/review.yml"],
    mode: "material|muestreo|riesgo", riskPatterns: ["^\\.github/workflows/"],
  });
  assert.equal(result.triggers.riesgo, true);
  assert.equal(result.run_shadow, true);
});

test("shadow_trigger inválido falla antes de leer la review", () => {
  assert.throws(() => evaluateShadow({ principal: null, prNumber: 1, changedPaths: [], mode: "otro" }), /shadow_trigger inválido/);
});

test("manifiesto detecta contaminación del input ciego", () => {
  const root = mkdtempSync(join(tmpdir(), "blind-manifest-"));
  mkdirSync(join(root, "context"));
  writeFileSync(join(root, "review-prompt.txt"), "caso original", "utf8");
  writeFileSync(join(root, "context", "reglas.md"), "reglas", "utf8");
  const manifest = createManifest(root, ["review-prompt.txt", "context/reglas.md"], HEAD);
  assert.equal(verifyInputManifest(root, manifest), true);
  writeFileSync(join(root, "review-prompt.txt"), "caso original + resultado principal", "utf8");
  assert.throws(() => verifyInputManifest(root, manifest), /Input alterado/);
});

test("prepare congela HEAD, diff, contexto y schema sin ejecutar el caso", async () => {
  const repo = mkdtempSync(join(tmpdir(), "blind-prepare-repo-"));
  const trusted = createTrustedHarness();
  writeFileSync(join(repo, "change.txt"), "base\n", "utf8");
  initializeRepository(repo);
  const base = commitAll(repo, "base");
  writeFileSync(join(repo, "change.txt"), "base\nchanged\n", "utf8");
  const head = commitAll(repo, "change");
  const out = join(repo, "artifacts");
  const prPath = join(repo, "pr.json");
  writeFileSync(prPath, JSON.stringify(prMetadata(7, base, head)), "utf8");
  await main(["prepare", "--repo", repo, "--trusted-root", trusted.root, "--trusted-sha", trusted.sha, "--pr-json", prPath, "--head-sha", head, "--out", out]);
  const manifest = JSON.parse(readFileSync(join(out, "input", "input-manifest.json"), "utf8"));
  assert.equal(manifest.head_sha, head);
  assert.equal(verifyInputManifest(join(out, "input"), manifest), true);
  assert.match(readFileSync(join(out, "input", "review-prompt.txt"), "utf8"), /Diff completo/);
  await assert.rejects(() => main(["prepare", "--repo", repo, "--trusted-root", trusted.root, "--trusted-sha", trusted.sha, "--pr-json", prPath, "--head-sha", "b".repeat(40), "--out", out]), /HEAD movido/);
});

test("prepare usa merge-base y excluye cambios posteriores de main", async () => {
  const repo = mkdtempSync(join(tmpdir(), "blind-three-dot-"));
  const trusted = createTrustedHarness();
  initializeRepository(repo);
  writeFileSync(join(repo, "base.txt"), "base\n", "utf8");
  commitAll(repo, "base");
  git(repo, "switch", "-c", "topic");
  writeFileSync(join(repo, "pr-only.txt"), "CAMBIO EXCLUSIVO DE PR\n", "utf8");
  const head = commitAll(repo, "pr change");
  git(repo, "switch", "main");
  writeFileSync(join(repo, "main-only.txt"), "CAMBIO POSTERIOR DE MAIN\n", "utf8");
  const advancedBase = commitAll(repo, "main advanced");
  git(repo, "switch", "topic");
  const prPath = join(repo, "pr.json");
  const out = join(repo, "artifacts");
  writeFileSync(prPath, JSON.stringify(prMetadata(8, advancedBase, head)), "utf8");
  await main(["prepare", "--repo", repo, "--trusted-root", trusted.root, "--trusted-sha", trusted.sha, "--pr-json", prPath, "--head-sha", head, "--out", out]);
  const diff = readFileSync(join(out, "input", "diff.patch"), "utf8");
  const metadata = JSON.parse(readFileSync(join(out, "input", "pr-metadata.json"), "utf8"));
  assert.match(diff, /CAMBIO EXCLUSIVO DE PR/);
  assert.doesNotMatch(diff, /main-only\.txt|CAMBIO POSTERIOR DE MAIN/);
  assert.deepEqual(metadata.changed_paths, ["pr-only.txt"]);
  assert.notEqual(metadata.merge_base_sha, advancedBase);
});

test("la política gobernante proviene del harness y la propuesta de la PR queda sólo en el diff", async () => {
  const repo = mkdtempSync(join(tmpdir(), "blind-policy-target-"));
  const trusted = createTrustedHarness("POLÍTICA A DESDE TRUSTED");
  initializeRepository(repo);
  writeFileSync(join(repo, "reviewer-policy.md"), "POLÍTICA ORIGINAL DEL TARGET\n", "utf8");
  const base = commitAll(repo, "base policy");
  git(repo, "switch", "-c", "topic");
  writeFileSync(join(repo, "reviewer-policy.md"), "POLÍTICA B PROPUESTA POR PR\n", "utf8");
  const head = commitAll(repo, "change policy");
  const prPath = join(repo, "pr.json");
  const out = join(repo, "artifacts");
  writeFileSync(prPath, JSON.stringify(prMetadata(9, base, head)), "utf8");
  await main(["prepare", "--repo", repo, "--trusted-root", trusted.root, "--trusted-sha", trusted.sha, "--pr-json", prPath, "--head-sha", head, "--out", out]);
  const prompt = readFileSync(join(out, "input", "review-prompt.txt"), "utf8");
  const [governing, reviewedDiff] = prompt.split("## Diff completo bajo revisión");
  assert.match(governing, /POLÍTICA A DESDE TRUSTED/);
  assert.doesNotMatch(governing, /POLÍTICA B PROPUESTA POR PR/);
  assert.match(reviewedDiff, /POLÍTICA B PROPUESTA POR PR/);
  assert.equal(readFileSync(join(out, "input", "context", "trusted-reviewer-policy.md"), "utf8").trim(), "POLÍTICA A DESDE TRUSTED");
  writeFileSync(join(trusted.root, "reviewer-policy.md"), "POLÍTICA LOCAL NO COMMITTEADA\n", "utf8");
  const secondOut = join(repo, "artifacts-second");
  await main(["prepare", "--repo", repo, "--trusted-root", trusted.root, "--trusted-sha", trusted.sha, "--pr-json", prPath, "--head-sha", head, "--out", secondOut]);
  const secondPrompt = readFileSync(join(secondOut, "input", "review-prompt.txt"), "utf8");
  assert.match(secondPrompt, /POLÍTICA A DESDE TRUSTED/);
  assert.doesNotMatch(secondPrompt, /POLÍTICA LOCAL NO COMMITTEADA/);
  writeFileSync(join(trusted.root, "reviewer-policy.md"), "", "utf8");
  const emptyPolicySha = commitAll(trusted.root, "empty governing policy");
  await assert.rejects(() => main(["prepare", "--repo", repo, "--trusted-root", trusted.root, "--trusted-sha", emptyPolicySha, "--pr-json", prPath, "--head-sha", head, "--out", join(repo, "artifacts-empty")]), /Contexto gobernante confiable vacío/);
  await assert.rejects(() => main(["prepare", "--repo", repo, "--trusted-root", trusted.root, "--trusted-sha", "b".repeat(40), "--pr-json", prPath, "--head-sha", head, "--out", out]), /HEAD movido/);
});

test("fusión conserva severidad mayor para el mismo path+line", () => {
  const result = fuseReviews({
    principal: review("claude", [finding({ impacto: "M3" })]),
    shadow: review("codex", [finding({ impacto: "M1", titulo: "Más severo" })]),
    shadowDecision: { run_shadow: true },
    anchors: new Set(["src/a.js:2"]),
  });
  assert.equal(result.hallazgos.length, 1);
  assert.equal(result.hallazgos[0].impacto, "M1");
  assert.deepEqual(result.hallazgos[0].reviewers.sort(), ["claude", "codex"]);
  assert.equal(result.decision, "REQUEST_CHANGES");
});

test("no deduplica semánticamente findings con anclas distintas", () => {
  const result = fuseReviews({
    principal: review("claude", [finding({ line: 2 })]),
    shadow: review("codex", [finding({ line: 3 })]),
    shadowDecision: { run_shadow: true },
    anchors: new Set(["src/a.js:2", "src/a.js:3"]),
  });
  assert.equal(result.hallazgos.length, 2);
});

test("decisión distingue material settled, material abierto y ausencia material", () => {
  const settled = fuseReviews({ principal: review("claude", [finding({ impacto: "M2" })]), shadowDecision: { run_shadow: false }, anchors: new Set(["src/a.js:2"]) });
  const open = fuseReviews({ principal: review("claude", [finding({ impacto: "M2", estado_evidencia: "UNVERIFIABLE", origen_evidencia: "NONE" })]), shadowDecision: { run_shadow: false }, anchors: new Set() });
  const clean = fuseReviews({ principal: review("claude", [finding({ impacto: "M3" })]), shadowDecision: { run_shadow: false }, anchors: new Set(["src/a.js:2"]) });
  assert.equal(settled.decision, "REQUEST_CHANGES");
  assert.equal(open.decision, "COMMENT");
  assert.equal(clean.decision, "APPROVE");
});

test("falla cerrado si falta el shadow requerido", () => {
  assert.throws(() => fuseReviews({ principal: review("claude"), shadowDecision: { run_shadow: true }, anchors: new Set() }), /Falta la review shadow/);
});

test("falla cerrado si principal y shadow no recibieron el mismo input", () => {
  assert.throws(() => fuseReviews({
    principal: review("claude", [], "uno"), shadow: review("codex", [], "otro"),
    shadowDecision: { run_shadow: true }, anchors: new Set(),
  }), /inputs diferentes/);
});

test("parsea líneas del lado nuevo del diff como anclas válidas", () => {
  const anchors = parseDiffAnchors("diff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1,2 +1,3 @@\n contexto\n+agregado\n viejo");
  assert.equal(anchors.has("src/a.js:2"), true);
  assert.equal(anchors.has("src/a.js:1"), true);
});

test("resetea el estado de anclas al comenzar cada archivo", () => {
  const diff = [
    "diff --git a/one.txt b/one.txt",
    "--- a/one.txt",
    "+++ b/one.txt",
    "@@ -0,0 +1 @@",
    "+uno",
    "diff --git a/two.txt b/two.txt",
    "similarity index 100%",
    "index 1111111..2222222 100644",
    "--- a/two.txt",
    "+++ b/two.txt",
    "@@ -10 +10 @@",
    "+dos",
  ].join("\n");
  const anchors = parseDiffAnchors(diff);
  assert.equal(anchors.has("one.txt:1"), true);
  assert.equal(anchors.has("one.txt:2"), false);
  assert.equal(anchors.has("two.txt:10"), true);
});

test("la telemetría pertenece sólo al harness y model_runtime conserva tipo string", () => {
  assert.throws(() => validateReviewPayload({ ...payload(), telemetria: { falsa: true } }), /campos incompatibles/);
  const common = buildCommonReview({
    reviewer: "claude",
    role: "principal",
    manifest: {
      head_sha: HEAD,
      input_fingerprint: "fingerprint",
      files: [{ path: "review-prompt.txt", sha256: "prompt" }],
    },
    adapter: { model: "modelo", effort: "high", durationMs: 12 },
    payload: payload(),
    providerUsage: { input_tokens: 10, output_tokens: 2 },
    modelRuntime: "modelo-runtime",
  });
  assert.equal(common.telemetria.model_runtime, "modelo-runtime");
  assert.equal(typeof common.telemetria.model_runtime, "string");
  assert.equal(common.telemetria.duration_ms, 12);
  assert.equal("falsa" in common.telemetria, false);
  assert.throws(() => buildCommonReview({
    reviewer: "codex", role: "shadow", manifest: common.telemetria,
    adapter: { model: "modelo", effort: "high", durationMs: 1 }, payload: payload(),
    providerUsage: null, modelRuntime: ["tipo", "inconsistente"],
  }), /model_runtime debe ser string/);
});

test("workflow serializa por PR y exige harness de la rama por defecto", () => {
  const workflow = readFileSync(join(HERE, "..", "..", ".github", "workflows", "blind-review-pipeline.yml"), "utf8");
  const concurrencyLine = workflow.split(/\r?\n/).find((line) => line.trim().startsWith("group:"));
  assert.match(concurrencyLine, /blind-review-pipeline/);
  assert.match(concurrencyLine, /github\.repository/);
  assert.match(concurrencyLine, /inputs\.pr_number/);
  assert.doesNotMatch(concurrencyLine, /workflow_sha/);
  assert.match(workflow, /ref: refs\/heads\/\$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow, /WORKFLOW_SHA.*HARNESS_SHA/s);
  assert.match(workflow, /DISPATCH_REF.*EXPECTED_REF/s);
  assert.match(workflow, /--trusted-root harness/);
});

test("publish=none nunca toca la red", async () => {
  let calls = 0;
  const result = await publishReview({
    mode: "none", fusion: { head_sha: HEAD }, repository: "o/r", prNumber: 1, token: null,
    fetchImpl: async () => { calls += 1; throw new Error("no debe llamarse"); },
  });
  assert.equal(result.published, false);
  assert.equal(calls, 0);
});

test("publicación consolidada falla cerrado ante duplicado", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => [{ body: `<!-- blind-review-pipeline:${HEAD} -->` }] });
  await assert.rejects(() => publishReview({
    mode: "consolidada", fusion: { head_sha: HEAD }, repository: "o/r", prNumber: 1, token: "x", fetchImpl,
  }), /duplicada/);
});
