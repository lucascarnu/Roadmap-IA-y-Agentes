import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createManifest,
  evaluateShadow,
  fuseReviews,
  main,
  parseDiffAnchors,
  publishReview,
  validateCommonReview,
  verifyInputManifest,
} from "./review-pipeline.mjs";

const HEAD = "a".repeat(40);

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
  for (const name of ["AGENTS.md", "reviewer-policy.md", "vision.md", "reglas.md"]) writeFileSync(join(repo, name), `${name}\n`, "utf8");
  writeFileSync(join(repo, "change.txt"), "base\n", "utf8");
  git(repo, "init");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.invalid");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "base");
  const base = git(repo, "rev-parse", "HEAD");
  writeFileSync(join(repo, "change.txt"), "base\nchanged\n", "utf8");
  git(repo, "add", "change.txt");
  git(repo, "commit", "-m", "change");
  const head = git(repo, "rev-parse", "HEAD");
  const out = join(repo, "artifacts");
  const prPath = join(repo, "pr.json");
  writeFileSync(prPath, JSON.stringify({ number: 7, title: "Caso", body: "", base: { ref: "main", sha: base }, head: { ref: "topic", sha: head } }), "utf8");
  await main(["prepare", "--repo", repo, "--pr-json", prPath, "--head-sha", head, "--out", out]);
  const manifest = JSON.parse(readFileSync(join(out, "input", "input-manifest.json"), "utf8"));
  assert.equal(manifest.head_sha, head);
  assert.equal(verifyInputManifest(join(out, "input"), manifest), true);
  assert.match(readFileSync(join(out, "input", "review-prompt.txt"), "utf8"), /Diff completo/);
  await assert.rejects(() => main(["prepare", "--repo", repo, "--pr-json", prPath, "--head-sha", "b".repeat(40), "--out", out]), /HEAD movido/);
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
