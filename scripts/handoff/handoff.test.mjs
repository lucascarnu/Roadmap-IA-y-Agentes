import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CrashSimulation, GOVERNING_CONTEXT, acquireLock, parseContractBody, poll, sha256, validateContract, validateResult,
} from "./handoff.mjs";
import { buildWindowsCmdInvocation, observeAuthentication, runProcess } from "./env.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const HEAD = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const MODULE_URL = pathToFileURL(join(HERE, "handoff.mjs")).href;
const CONTRACT_SCHEMA = JSON.parse(readFileSync(join(HERE, "handoff.schema.json"), "utf8"));
const RESULT_SCHEMA = JSON.parse(readFileSync(join(HERE, "handoff-result.schema.json"), "utf8"));
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
      ...GOVERNING_CONTEXT.common,
      GOVERNING_CONTEXT.codex,
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

function spawnFailure(code, command) {
  return {
    error: Object.assign(new Error(`spawnSync ${command} ${code}`), { code }),
    status: null,
    stdout: "",
    stderr: "",
  };
}

function assertResultFailed(result, currentContract) {
  assert.throws(
    () => validateResult(result, currentContract, BASE_CONFIG),
    (error) => error.name === "HandoffError" && error.label === "handoff:failed",
  );
}

function assertStructuredOutputSubset(schema) {
  const allowed = new Set([
    "type", "enum", "properties", "items", "required", "additionalProperties",
    "description", "title", "$schema",
  ]);
  const visit = (node, path, typeRequired = false) => {
    assert(node && typeof node === "object" && !Array.isArray(node), `${path} no es un nodo de schema`);
    if (typeRequired) assert(Object.hasOwn(node, "type"), `${path} no declara type`);
    assert.equal(Object.hasOwn(node, "const"), false, `${path} contiene const`);
    for (const keyword of Object.keys(node)) assert(allowed.has(keyword), `${path} usa keyword no permitida: ${keyword}`);
    const types = Array.isArray(node.type) ? node.type : [node.type];
    if (types.includes("object")) {
      assert.equal(node.additionalProperties, false, `${path} no cierra additionalProperties`);
      assert.deepEqual(
        [...node.required].sort(),
        Object.keys(node.properties).sort(),
        `${path} no requiere exactamente todas sus propiedades`,
      );
    }
    if (node.properties) {
      for (const [name, child] of Object.entries(node.properties)) visit(child, `${path}.properties.${name}`, true);
    }
    if (node.items) visit(node.items, `${path}.items`, true);
  };
  visit(schema, "$", true);
}

test("runProcess no reintenta si el primer intento funciona en win32", () => {
  const calls = [];
  const result = runProcess("codex", ["--version"], {
    platform: "win32",
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: "codex-cli 0.147.0", stderr: "" };
    },
  });
  assert.equal(result.stdout, "codex-cli 0.147.0");
  assert.deepEqual(calls.map(({ command }) => command), ["codex"]);
});

test("runProcess reintenta una vez mediante cmd.exe ante ENOENT en win32", () => {
  const calls = [];
  const result = runProcess("codex", ["login", "status"], {
    platform: "win32",
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return calls.length === 1
        ? spawnFailure("ENOENT", command)
        : { status: 0, stdout: "Logged in using ChatGPT", stderr: "" };
    },
  });
  assert.equal(result.stdout, "Logged in using ChatGPT");
  assert.deepEqual(calls.map(({ command }) => command), ["codex", process.env.COMSPEC ?? "cmd.exe"]);
  assert.deepEqual(calls[1].args, ["/d", "/s", "/c", "codex.cmd login status"]);
  assert.equal(calls[1].options.shell, undefined);
  assert.equal(calls[1].options.windowsVerbatimArguments, true);
});

test("invocación Windows fija la línea exacta para configuración de reasoning", () => {
  const invocation = buildWindowsCmdInvocation("codex", [
    "exec", "--config", 'model_reasoning_effort="high"',
  ], "C:\\Windows\\System32\\cmd.exe");
  assert.equal(invocation.command, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(invocation.args, [
    "/d", "/s", "/c", 'codex.cmd exec --config model_reasoning_effort="high"',
  ]);
  assert.equal(invocation.commandLine, 'codex.cmd exec --config model_reasoning_effort="high"');
});

test("runProcess no aplica fallback .cmd fuera de win32", () => {
  for (const platform of ["linux", "darwin"]) {
    const calls = [];
    assert.throws(() => runProcess("codex", [], {
      platform,
      spawn: (command) => { calls.push(command); return spawnFailure("ENOENT", command); },
    }), { code: "ENOENT" });
    assert.deepEqual(calls, ["codex"]);
  }
});

test("runProcess no reescribe un comando que ya tiene extensión", () => {
  const calls = [];
  assert.throws(() => runProcess("codex.cmd", [], {
    platform: "win32",
    spawn: (command) => { calls.push(command); return spawnFailure("ENOENT", command); },
  }), { code: "ENOENT" });
  assert.deepEqual(calls, ["codex.cmd"]);
});

test("runProcess propaga ENOENT si también falla cmd.exe", () => {
  const calls = [];
  assert.throws(() => runProcess("codex", [], {
    platform: "win32",
    spawn: (command) => { calls.push(command); return spawnFailure("ENOENT", command); },
  }), (error) => error.code === "ENOENT" && error.message.startsWith(`${process.env.COMSPEC ?? "cmd.exe"}:`));
  assert.deepEqual(calls, ["codex", process.env.COMSPEC ?? "cmd.exe"]);
});

test("runProcess no reintenta ante un error distinto de ENOENT", () => {
  const calls = [];
  assert.throws(() => runProcess("codex", [], {
    platform: "win32",
    spawn: (command) => { calls.push(command); return spawnFailure("EACCES", command); },
  }), { code: "EACCES" });
  assert.deepEqual(calls, ["codex"]);
});

test("runProcess conserva args, input, env, cwd y timeout en el segundo intento", () => {
  const calls = [];
  const args = ["login", "status"];
  const input = Buffer.from("entrada", "utf8");
  const env = { PATH: "ruta-controlada" };
  runProcess("codex", args, {
    platform: "win32",
    spawn: (command, receivedArgs, options) => {
      calls.push({ command, args: receivedArgs, options });
      return calls.length === 1
        ? spawnFailure("ENOENT", command)
        : { status: 0, stdout: "ok", stderr: "" };
    },
    input,
    env,
    cwd: "directorio-controlado",
    timeout: 1234,
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].args, ["/d", "/s", "/c", "codex.cmd login status"]);
  assert.strictEqual(calls[1].options.input, input);
  assert.strictEqual(calls[1].options.env, env);
  assert.equal(calls[1].options.cwd, "directorio-controlado");
  assert.equal(calls[1].options.timeout, 1234);
  assert.equal(calls[1].options.maxBuffer, 64 * 1024 * 1024);
  assert.equal(calls[1].options.windowsHide, true);
  assert.equal(calls[1].options.windowsVerbatimArguments, true);
});

test("contrato y resultado válidos respetan los schemas conceptuales", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  assert.equal(validateResult(validResult(current), current, BASE_CONFIG).estado, "COMPLETADO");
  assert.deepEqual(parseContractBody(issueBody(current)), current);
});

test("schema de salida usa sólo el subconjunto estructurado admitido", () => {
  assertStructuredOutputSubset(RESULT_SCHEMA);
});

test("veredicto de 2001 caracteres termina handoff:failed", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  assertResultFailed({ ...validResult(current), veredicto: "v".repeat(2001) }, current);
});

test("resumen de 6001 caracteres termina handoff:failed", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  assertResultFailed({ ...validResult(current), resumen: "r".repeat(6001) }, current);
});

test("accion_recomendada de 3001 caracteres termina handoff:failed", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  assertResultFailed({ ...validResult(current), accion_recomendada: "a".repeat(3001) }, current);
});

test("detalle de evidencia de 2001 caracteres termina handoff:failed", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  const result = validResult(current);
  result.evidencia[0].detalle = "d".repeat(2001);
  assertResultFailed(result, current);
});

test("archivos_leidos con 31 elementos termina handoff:failed", () => {
  const paths = Array.from({ length: 31 }, (_, index) => `contexto/${index}.md`);
  const current = { ...validateContract(contract(), BASE_CONFIG), contexto_autorizado: paths };
  assertResultFailed({ ...validResult(current), archivos_leidos: paths }, current);
});

test("archivos_leidos duplicados termina handoff:failed", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  const duplicate = current.contexto_autorizado[0];
  assertResultFailed({ ...validResult(current), archivos_leidos: [duplicate, duplicate] }, current);
});

test("salida en todos los límites exactos es válida", () => {
  const paths = Array.from({ length: 30 }, (_, index) => `contexto/${index}.md`);
  const current = { ...validateContract(contract(), BASE_CONFIG), contexto_autorizado: paths };
  const result = validResult(current);
  result.veredicto = "v".repeat(2000);
  result.resumen = "r".repeat(6000);
  result.accion_recomendada = "a".repeat(3000);
  result.evidencia = paths.map((path) => ({ archivo: path, detalle: "d".repeat(2000) }));
  result.archivos_leidos = paths;
  assert.equal(validateResult(result, current, BASE_CONFIG), result);
});

test("schema y validador exigen el mismo canon gobernante", () => {
  const commonFromSchema = CONTRACT_SCHEMA.allOf[0].properties.contexto_autorizado.allOf
    .map((requirement) => requirement.contains.const);
  const recipientRule = CONTRACT_SCHEMA.allOf[1];
  assert.deepEqual(commonFromSchema, GOVERNING_CONTEXT.common);
  assert.equal(recipientRule.then.properties.contexto_autorizado.contains.const, GOVERNING_CONTEXT.codex);
  assert.equal(recipientRule.else.properties.contexto_autorizado.contains.const, GOVERNING_CONTEXT.claude);
});

test("head_ref rechaza recorrido relativo, extremos y componentes vacíos", () => {
  const schemaPattern = new RegExp(CONTRACT_SCHEMA.properties.head_ref.pattern);
  const invalidRefs = ["../main", "refs/../../x", "main/..", "/main", "main/", "refs//main"];
  for (const headRef of invalidRefs) {
    assert.equal(schemaPattern.test(headRef), false, `schema aceptó ${headRef}`);
    assert.throws(() => validateContract(contract({ head_ref: headRef }), BASE_CONFIG), /head_ref inválido/);
  }
  const validRef = "feature/handoff.fix-1";
  assert.equal(schemaPattern.test(validRef), true);
  assert.equal(validateContract(contract({ head_ref: validRef }), BASE_CONFIG).head_ref, validRef);
});

test("head_ref inválido bloquea antes de inferencia", async () => {
  let invocations = 0;
  const backend = new FakeBackend([{
    number: 1,
    title: "bad-ref",
    body: issueBody(contract({ head_ref: "refs/../../x" })),
    createdAt: "2026-08-11T00:00:00Z",
  }]);
  const fx = fixture(backend, {
    invoke: () => { invocations += 1; throw new Error("No debe inferir"); },
  });
  try {
    const result = await poll(fx.options);
    assert.equal(result.processed[0].status, "blocked");
    assert.match(result.processed[0].error, /head_ref inválido/);
    assert.equal(invocations, 0);
    assert(backend.issues[0].labels.has("handoff:blocked"));
  } finally { clean(fx); }
});

test("contexto específico adicional sigue permitido junto al canon gobernante", () => {
  const additional = "decisiones/0012-handoffs-estructurados-y-ejecucion-local-por-suscripcion.md";
  const current = validateContract(contract({
    contexto_autorizado: [...contract().contexto_autorizado, additional],
  }), BASE_CONFIG);
  assert(current.contexto_autorizado.includes(additional));
});

test("falta de canon gobernante bloquea antes de inferencia", async () => {
  for (const recipient of ["codex", "claude"]) {
    const required = [...GOVERNING_CONTEXT.common, GOVERNING_CONTEXT[recipient]];
    const fullContext = [...required, "decisiones/0013-delegar-cierre-operativo-y-merge-rutinario.md"];
    for (const missing of required) {
      let invocations = 0;
      const invalid = contract({
        destinatario: recipient,
        contexto_autorizado: fullContext.filter((path) => path !== missing),
      });
      const backend = new FakeBackend([{ number: 1, title: "bad", body: issueBody(invalid), createdAt: "2026-08-11T00:00:00Z" }]);
      const fx = fixture(backend, {
        invoke: () => { invocations += 1; throw new Error("No debe inferir"); },
      });
      try {
        const result = await poll(fx.options);
        assert.equal(result.processed[0].status, "blocked", `${recipient}: ${missing}`);
        assert.match(result.processed[0].error, /omite canon gobernante/, `${recipient}: ${missing}`);
        assert.equal(invocations, 0, `${recipient}: ${missing}`);
        assert(backend.issues[0].labels.has("handoff:blocked"), `${recipient}: ${missing}`);
      } finally { clean(fx); }
    }
  }
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
    assert(child.contexto_autorizado.includes(GOVERNING_CONTEXT.claude));
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

test("fallo de ambos launchers durante observación termina blocked-via sin inferencia", async () => {
  const backend = new FakeBackend([{ number: 1, title: "A", body: issueBody(contract()), createdAt: "2026-08-11T00:00:00Z" }]);
  const commands = [];
  let invocations = 0;
  const spawn = (command) => {
    commands.push(command);
    return spawnFailure("ENOENT", command);
  };
  const fx = fixture(backend, {
    authObserver: (agent, adapter) => observeAuthentication(agent, adapter, {
      run: (command, args, options) => runProcess(command, args, {
        ...options, platform: "win32", spawn,
      }),
    }),
    invoke: () => { invocations += 1; throw new Error("No debe inferir"); },
  });
  try {
    const result = await poll(fx.options);
    assert.equal(result.processed[0].status, "blocked-via");
    assert.deepEqual(commands, ["codex", process.env.COMSPEC ?? "cmd.exe"]);
    assert.equal(invocations, 0);
    assert.equal(backend.issues[0].comments.length, 0);
    assert(backend.issues[0].labels.has("handoff:blocked-via"));
  } finally { clean(fx); }
});
