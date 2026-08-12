import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CrashSimulation, acquireLock, parseContractBody, poll, sha256, validateContract, validateResult,
} from "./handoff.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const HEAD = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const MODULE_URL = pathToFileURL(join(HERE, "handoff.mjs")).href;
const BASE_CONFIG = {
  repository: "example/repo",
  default_head_ref: "main",
  max_unidades_por_corrida: 3,
  max_relevos: 2,
  timeout_ms: 30_000,
  agents: {
    claude: { executable: "claude", model: "opus", effort: "high", authorized_via: "anthropic_first_party_subscription" },
    codex: { executable: "codex", model: "gpt-5.6-sol", effort: "high", authorized_via: "chatgpt_subscription_session" },
  },
};

function contract(overrides = {}) {
  return {
    handoff_version: "1",
    tarea: "Auditar si sigue vigente el pendiente de integración automática por clase de riesgo.",
    destinatario: "codex",
    head_sha: HEAD,
    head_ref: "main",
    contexto_autorizado: [
      "pendientes.md",
      "decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md",
      "decisiones/0013-delegar-cierre-operativo-y-merge-rutinario.md",
    ],
    resultado_previo: null,
    origen: {
      tipo: "agente", ejecutor: "claude", rol: "arquitecto",
      modelo: "opus", esfuerzo: "high", issue_origen: null,
    },
    salida_requerida: "Veredicto, evidencia, recomendación y siguiente_destinatario=claude.",
    modo: "solo_lectura",
    profundidad_cadena: 1,
    ...overrides,
  };
}

function issueBody(value, marker = "") {
  return `${marker}${marker ? "\n\n" : ""}\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

function validResult(currentContract, next = currentContract.profundidad_cadena === 1 ? "claude" : null) {
  return {
    handoff_version: "1",
    estado: "COMPLETADO",
    veredicto: "El pendiente quedó desactualizado por 0013.",
    resumen: "0013 ya define el gate mínimo de integración rutinaria.",
    evidencia: [{ archivo: "decisiones/0013-delegar-cierre-operativo-y-merge-rutinario.md", detalle: "Define condiciones objetivas de integración." }],
    archivos_leidos: currentContract.contexto_autorizado,
    accion_recomendada: "Actualizar el pendiente en una tarea documental separada.",
    siguiente_destinatario: next,
    firma: {
      ejecutor: currentContract.destinatario,
      modelo: BASE_CONFIG.agents[currentContract.destinatario].model,
      esfuerzo: "high",
      head_sha: currentContract.head_sha,
    },
  };
}

class FakeBackend {
  constructor(issues = [], options = {}) {
    this.issues = issues.map((item) => ({ ...item, labels: new Set(item.labels ?? ["handoff:ready"]), comments: item.comments ?? [] }));
    this.heads = options.heads ? [...options.heads] : [HEAD];
    this.lastHead = this.heads.at(-1) ?? HEAD;
    this.next = Math.max(0, ...this.issues.map((item) => item.number)) + 1;
    this.publishFailures = options.publishFailures ?? 0;
  }

  ensureLabels() {}

  listByLabel(label) {
    return this.issues.filter((issue) => issue.labels.has(label)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  setState(number, from, to) {
    const issue = this.issues.find((item) => item.number === number);
    if (!issue) throw new Error(`Issue inexistente: ${number}`);
    if (from && !issue.labels.has(from)) throw new Error(`Issue ${number} no tiene ${from}`);
    if (from) issue.labels.delete(from);
    issue.labels.add(to);
  }

  comments(number) {
    return this.issues.find((item) => item.number === number)?.comments ?? [];
  }

  publish(number, bodyFile) {
    if (this.publishFailures > 0) {
      this.publishFailures -= 1;
      throw new Error("GitHub temporalmente no disponible");
    }
    const issue = this.issues.find((item) => item.number === number);
    issue.comments.push({ body: readFileSync(bodyFile, "utf8"), html_url: `https://example.test/issues/${number}#comment` });
    return `https://example.test/issues/${number}#comment`;
  }

  currentHead() {
    if (this.heads.length) this.lastHead = this.heads.shift();
    return this.lastHead;
  }

  findChild(marker) {
    return this.issues.find((issue) => issue.body.includes(marker)) ?? null;
  }

  createIssue(title, bodyFile) {
    const created = {
      number: this.next++, title, body: readFileSync(bodyFile, "utf8"),
      createdAt: new Date(Date.now() + this.next * 1000).toISOString(),
      labels: new Set(["handoff:ready"]), comments: [], url: `https://example.test/issues/${this.next - 1}`,
    };
    this.issues.push(created);
    return { number: created.number, url: created.url };
  }
}

function fixture(backend, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "handoff-test-"));
  return {
    root,
    options: {
      config: BASE_CONFIG,
      repo: ROOT,
      backend,
      runtimeDir: join(root, ".handoff"),
      artifactsDir: join(root, "artifacts"),
      ensureLabels: false,
      authObserver: (agent, adapter) => ({ authorized_via: adapter.authorized_via, observed_via: adapter.authorized_via, evidence: { fixture: true }, valid: true }),
      invoke: ({ contract: current }) => ({ result: validResult(current), telemetry: { fixture: true }, duration_ms: 1 }),
      ...overrides,
    },
  };
}

function clean(item) {
  rmSync(item.root, { recursive: true, force: true });
}

test("contrato y resultado válidos respetan los schemas conceptuales", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  assert.equal(validateResult(validResult(current), current, BASE_CONFIG).estado, "COMPLETADO");
  assert.deepEqual(parseContractBody(issueBody(current)), current);
});

test("camino feliz drena #A y el #B creado automáticamente en la misma corrida", async () => {
  const backend = new FakeBackend([{ number: 1, title: "A", body: issueBody(contract()), createdAt: "2026-08-11T00:00:00Z" }]);
  const fx = fixture(backend);
  try {
    const result = await poll(fx.options);
    assert.deepEqual(result.processed.map((item) => item.status), ["done", "done"], JSON.stringify(result, null, 2));
    assert.equal(backend.issues.length, 2);
    assert.equal(backend.issues[0].comments.length, 1);
    assert.equal(backend.issues[1].comments.length, 1);
    assert(backend.issues.every((item) => item.labels.has("handoff:done")));
    const child = validateContract(parseContractBody(backend.issues[1].body), BASE_CONFIG);
    assert.equal(child.destinatario, "claude");
    assert.equal(child.profundidad_cadena, 2);
    assert.equal(child.resultado_previo.issue, 1);
  } finally { clean(fx); }
});

test("F1: caída después de running se recupera una vez sin duplicar publicación", async () => {
  const backend = new FakeBackend([{ number: 1, title: "A", body: issueBody(contract()), createdAt: "2026-08-11T00:00:00Z" }]);
  const fx = fixture(backend, {
    hooks: {
      crash_owner_pid: 999999,
      preserveLockOnCrash: true,
      afterClaim: () => { throw new CrashSimulation(); },
    },
    preserveGlobalLock: true,
  });
  await assert.rejects(() => poll(fx.options), CrashSimulation);
  assert(backend.issues[0].labels.has("handoff:running"));
  delete fx.options.hooks;
  delete fx.options.preserveGlobalLock;
  try {
    const recovered = await poll(fx.options);
    assert.equal(recovered.processed[0].status, "done");
    assert.equal(backend.issues[0].comments.length, 1);
  } finally { clean(fx); }
});

test("F1: una segunda caída consecutiva agota el reintento y bloquea", async () => {
  const backend = new FakeBackend([{ number: 1, title: "A", body: issueBody(contract()), createdAt: "2026-08-11T00:00:00Z" }]);
  const crashHooks = {
    crash_owner_pid: 999999,
    preserveLockOnCrash: true,
    afterClaim: () => { throw new CrashSimulation(); },
  };
  const fx = fixture(backend, { hooks: crashHooks, preserveGlobalLock: true });
  await assert.rejects(() => poll(fx.options), CrashSimulation);
  await assert.rejects(() => poll(fx.options), CrashSimulation);
  delete fx.options.hooks;
  delete fx.options.preserveGlobalLock;
  try {
    const blocked = await poll(fx.options);
    assert.equal(blocked.processed.length, 0);
    assert(backend.issues[0].labels.has("handoff:blocked"));
    assert.equal(backend.issues[0].comments.length, 0);
  } finally { clean(fx); }
});

test("F2: dos procesos casi simultáneos sólo permiten un lock", async () => {
  const root = mkdtempSync(join(tmpdir(), "handoff-lock-"));
  const lock = join(root, "issue.lock");
  const start = Date.now() + 700;
  const source = `import { acquireLock } from ${JSON.stringify(MODULE_URL)}; const wait=${start}-Date.now(); if(wait>0) await new Promise(r=>setTimeout(r,wait)); const ok=acquireLock(${JSON.stringify(lock)}); console.log(ok?'CLAIMED':'REJECTED'); if(ok) await new Promise(r=>setTimeout(r,500));`;
  const launch = () => new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("exit", (code) => code === 0 ? resolvePromise(stdout.trim()) : rejectPromise(new Error(stderr)));
  });
  try {
    const outcomes = await Promise.all([launch(), launch()]);
    assert.deepEqual(outcomes.sort(), ["CLAIMED", "REJECTED"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("fallo de GitHub tras inferencia reutiliza resultado persistido sin reinferir", async () => {
  const backend = new FakeBackend(
    [{ number: 1, title: "A", body: issueBody(contract()), createdAt: "2026-08-11T00:00:00Z" }],
    { publishFailures: 1 },
  );
  let invocations = 0;
  const fx = fixture(backend, {
    invoke: ({ contract: current }) => {
      invocations += 1;
      return { result: validResult(current, null), telemetry: {}, duration_ms: 1 };
    },
  });
  try {
    const first = await poll(fx.options);
    assert.equal(first.processed[0].status, "deferred");
    assert.equal(invocations, 1);
    assert(backend.issues[0].labels.has("handoff:running"));
    const second = await poll(fx.options);
    assert.equal(second.processed[0].status, "done");
    assert.equal(invocations, 1);
    assert.equal(backend.issues[0].comments.length, 1);
  } finally { clean(fx); }
});

test("F3: HEAD movido durante la corrida termina stale y no publica", async () => {
  const moved = "f".repeat(40);
  const backend = new FakeBackend([{ number: 1, title: "A", body: issueBody(contract()), createdAt: "2026-08-11T00:00:00Z" }], { heads: [HEAD, moved] });
  const fx = fixture(backend);
  try {
    const result = await poll(fx.options);
    assert.equal(result.processed[0].status, "stale");
    assert.equal(backend.issues[0].comments.length, 0);
    assert(backend.issues[0].labels.has("handoff:stale"));
  } finally { clean(fx); }
});

test("F4: contrato inválido termina blocked", async () => {
  const invalid = { ...contract() };
  delete invalid.head_sha;
  const backend = new FakeBackend([{ number: 1, title: "bad", body: issueBody(invalid), createdAt: "2026-08-11T00:00:00Z" }]);
  const fx = fixture(backend);
  try {
    const result = await poll(fx.options);
    assert.equal(result.processed[0].status, "blocked");
    assert(backend.issues[0].labels.has("handoff:blocked"));
  } finally { clean(fx); }
});

test("F5: salida inválida termina failed sin resultado válido", async () => {
  const backend = new FakeBackend([{ number: 1, title: "A", body: issueBody(contract()), createdAt: "2026-08-11T00:00:00Z" }]);
  const fx = fixture(backend, { invoke: () => ({ result: { estado: "COMPLETADO" }, telemetry: {}, duration_ms: 1 }) });
  try {
    const result = await poll(fx.options);
    assert.equal(result.processed[0].status, "failed");
    assert.equal(backend.issues[0].comments.length, 0);
    assert(backend.issues[0].labels.has("handoff:failed"));
  } finally { clean(fx); }
});

test("F6: salida que intenta superar max_relevos termina blocked", async () => {
  const previous = validResult(contract(), "claude");
  const previousRaw = JSON.stringify(previous, null, 2);
  const previousMarker = "<!-- previous-result -->";
  const depthTwo = contract({
    destinatario: "claude",
    profundidad_cadena: 2,
    resultado_previo: { issue: 99, marker: previousMarker, result_sha256: sha256(Buffer.from(previousRaw)) },
    origen: { tipo: "puente", ejecutor: "handoff.mjs", rol: "orquestador", modelo: null, esfuerzo: null, issue_origen: 99 },
  });
  const backend = new FakeBackend([
    { number: 99, title: "A", body: "{}", createdAt: "2026-08-10T00:00:00Z", labels: ["handoff:done"], comments: [{ body: `${previousMarker}\n\n\`\`\`json\n${previousRaw}\n\`\`\`` }] },
    { number: 1, title: "B", body: issueBody(depthTwo), createdAt: "2026-08-11T00:00:00Z" },
  ]);
  const fx = fixture(backend, { invoke: ({ contract: current }) => ({ result: validResult(current, "codex"), telemetry: {}, duration_ms: 1 }) });
  try {
    const result = await poll(fx.options);
    assert.equal(result.processed[0].status, "blocked");
    const blockedIssue = backend.issues.find((item) => item.number === 1);
    assert.equal(blockedIssue.comments.length, 0);
    assert(blockedIssue.labels.has("handoff:blocked"));
  } finally { clean(fx); }
});

test("guardarraíl de vía falla cerrado cuando no es demostrable", async () => {
  const backend = new FakeBackend([{ number: 1, title: "A", body: issueBody(contract()), createdAt: "2026-08-11T00:00:00Z" }]);
  const fx = fixture(backend, { authObserver: () => ({ authorized_via: "chatgpt_subscription_session", observed_via: "unverified", evidence: {}, valid: false }) });
  try {
    const result = await poll(fx.options);
    assert.equal(result.processed[0].status, "blocked-via");
    assert.equal(backend.issues[0].comments.length, 0);
  } finally { clean(fx); }
});

test("guardarraíl de vía clasifica fallo del cliente como blocked-via", async () => {
  const backend = new FakeBackend([{ number: 1, title: "A", body: issueBody(contract()), createdAt: "2026-08-11T00:00:00Z" }]);
  const fx = fixture(backend, { authObserver: () => { throw new Error("cliente inaccesible"); } });
  try {
    const result = await poll(fx.options);
    assert.equal(result.processed[0].status, "blocked-via");
    assert.equal(backend.issues[0].comments.length, 0);
  } finally { clean(fx); }
});
