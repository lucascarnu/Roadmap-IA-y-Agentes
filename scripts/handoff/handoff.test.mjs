import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CrashSimulation, GOVERNING_CONTEXT, GithubBackend, HandoffError, acquireLock, buildPrompt, invokeAgent,
  parseContractBody, poll, prepareInput, sha256, tick,
  validateContract, validateResult,
} from "./handoff.mjs";
import { buildWindowsCmdInvocation, observeAuthentication, runProcess } from "./env.mjs";
import { createNotifier } from "./notify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const HEAD = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const MODULE_URL = pathToFileURL(join(HERE, "handoff.mjs")).href;
const CONTRACT_SCHEMA = JSON.parse(readFileSync(join(HERE, "handoff.schema.json"), "utf8"));
const RESULT_SCHEMA_RAW = readFileSync(join(HERE, "handoff-result.schema.json"), "utf8");
const RESULT_SCHEMA = JSON.parse(RESULT_SCHEMA_RAW);
const PROMPT_TEMPLATE = readFileSync(join(HERE, "prompt-template.md"), "utf8");
const BASE_CONFIG = {
  repository: "example/repo",
  default_head_ref: "main",
  max_unidades_por_corrida: 3,
  max_relevos: 2,
  timeout_ms: 30_000,
  agents: {
    claude: { executable: "claude", model: "opus", effort: "high", authorized_via: "anthropic_first_party_subscription" },
    codex: { executable: "codex", model: "gpt-5.6-sol", effort: "high", authorized_via: "chatgpt_subscription_session" },
    kimi: {
      executable: "kimi", model: "k3-256k", alias: "kimi-code/k3-256k",
      effort: "high", authorized_via: "kimi_membership_oauth",
    },
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
    this.checkRuns = options.checkRuns ?? {};
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

  checkRun(pr, name) {
    return this.checkRuns[`${pr}:${name}`] ?? null;
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
      notify: async () => ({ sent: false, reason: "fixture" }),
      ...overrides,
    },
  };
}

function clean(item) {
  rmSync(item.root, { recursive: true, force: true });
}

function waitDescriptor(issue, overrides = {}, markerHead = HEAD) {
  const descriptor = {
    handoff_wait_version: "1",
    condicion: "tiempo",
    parametros: {},
    intervalo_segundos: 60,
    max_intentos: 3,
    blocked_since: "2026-08-13T10:00:00.000Z",
    ...overrides,
  };
  return `<!-- handoff-wait:${issue}:${markerHead} -->\n\n\`\`\`json\n${JSON.stringify(descriptor, null, 2)}\n\`\`\`\n`;
}

function waitingIssue(number = 1, descriptorOverrides = {}, overrides = {}) {
  return {
    number,
    title: `waiting-${number}`,
    body: issueBody(contract()),
    createdAt: `2026-08-13T0${number}:00:00Z`,
    labels: ["handoff:waiting"],
    comments: [{ body: waitDescriptor(number, descriptorOverrides) }],
    ...overrides,
  };
}

function waitStatePath(fx, issue) {
  return join(fx.options.runtimeDir, "issues", String(issue), "state.json");
}

function setWaitState(fx, issue, state) {
  const path = waitStatePath(fx, issue);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function getWaitState(fx, issue) {
  return JSON.parse(readFileSync(waitStatePath(fx, issue), "utf8"));
}

function spawnFailure(code, command) {
  return {
    error: Object.assign(new Error(`spawnSync ${command} ${code}`), { code }),
    status: null,
    stdout: "",
    stderr: "",
  };
}

function ntfyFixture(fetchImpl, logger = { info() {}, warn() {} }) {
  return createNotifier({
    env: {
      ROADMAP_NTFY_TOPIC: "topic-ficticio-pruebas",
      ROADMAP_NTFY_BASE_URL: "https://notify.invalid",
    },
    fetchImpl,
    logger,
    timeoutMs: 100,
  });
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
    "description", "title",
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

function extractPromptJsonBlock(prompt, heading) {
  const normalized = prompt.replaceAll("\r\n", "\n");
  const marker = `## ${heading}\n\n\`\`\`json\n`;
  const start = normalized.indexOf(marker);
  assert.notEqual(start, -1, `Falta la sección ${heading}`);
  const contentStart = start + marker.length;
  const end = normalized.indexOf("\n```", contentStart);
  assert.notEqual(end, -1, `Falta el cierre JSON de ${heading}`);
  return normalized.slice(contentStart, end);
}

function extractPromptSection(prompt, heading, nextHeading) {
  const normalized = prompt.replaceAll("\r\n", "\n");
  const marker = `## ${heading}\n\n`;
  const start = normalized.indexOf(marker);
  assert.notEqual(start, -1, `Falta la sección ${heading}`);
  const contentStart = start + marker.length;
  const end = normalized.indexOf(`\n## ${nextHeading}`, contentStart);
  assert.notEqual(end, -1, `Falta el final de la sección ${heading}`);
  return normalized.slice(contentStart, end);
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1;
}

function renderedPrompt(currentContract) {
  const root = mkdtempSync(join(tmpdir(), "handoff-prompt-test-"));
  const run = (_command, args) => {
    if (args.includes("show")) return { status: 0, stdout: `contenido de ${args.at(-1)}\n`, stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  const prepared = prepareInput({ repo: ROOT, contract: currentContract, runDir: root, previousResult: null, run });
  return { ...prepared, clean: () => rmSync(root, { recursive: true, force: true }) };
}

function legacyPromptForOrdinaryContent({ template, currentContract, previousResult, contexts, resultSchema, frozenDiff }) {
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
  const examplePath = currentContract.contexto_autorizado[0];
  const example = {
    handoff_version: "1",
    estado: "COMPLETADO",
    veredicto: "Resultado breve.",
    resumen: "Resumen breve.",
    evidencia: [{ archivo: examplePath, detalle: "Evidencia breve." }],
    archivos_leidos: [examplePath],
    accion_recomendada: "Siguiente acción breve.",
    siguiente_destinatario: null,
    firma: {
      ejecutor: currentContract.destinatario,
      modelo: "NO_OBSERVABLE",
      esfuerzo: "NO_OBSERVABLE",
      head_sha: currentContract.head_sha,
    },
  };
  return template
    .replace("{{DESTINATARIO_MAYUSCULAS}}", currentContract.destinatario.toUpperCase())
    .replace("{{CONTRATO}}", JSON.stringify(currentContract, null, 2))
    .replace("{{RESULTADO_PREVIO}}", previousResult ? JSON.stringify(previousResult, null, 2) : "null")
    .replace("{{CONTEXTO}}", renderedContexts)
    .replace("{{SCHEMA_SALIDA}}", resultSchema.trim())
    .replace("{{EJEMPLO_SALIDA}}", JSON.stringify(example, null, 2))
    .replace("{{DIFF_CONGELADO}}", renderedDiff);
}

function schemaTokens(schema) {
  const keys = new Set();
  const enumValues = new Set();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.properties) for (const key of Object.keys(node.properties)) keys.add(key);
    if (node.enum) for (const value of node.enum) enumValues.add(JSON.stringify(value));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else visit(value);
    }
  };
  visit(schema);
  return { keys, enumValues };
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
  assert.equal(Object.hasOwn(RESULT_SCHEMA, "$schema"), false, "Claude rechaza la declaración de dialecto $schema");
  assertStructuredOutputSubset(RESULT_SCHEMA);
});

test("anti-deriva: el prompt renderiza el schema y explicita sus claves y enums", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  const prepared = renderedPrompt(current);
  try {
    assert.equal(
      extractPromptJsonBlock(prepared.prompt, "Schema del contrato de salida"),
      RESULT_SCHEMA_RAW.trim().replaceAll("\r\n", "\n"),
    );
    const { keys, enumValues } = schemaTokens(RESULT_SCHEMA);
    for (const key of keys) assert(prepared.prompt.includes(`"${key}"`), `El prompt omite la clave ${key}`);
    for (const value of enumValues) assert(prepared.prompt.includes(value), `El prompt omite el enum ${value}`);
    const rules = extractPromptSection(prepared.prompt, "Reglas de salida", "Ejemplo canónico mínimo");
    for (const key of keys) assert(rules.includes(key), `Las reglas omiten la clave ${key}`);
    for (const value of enumValues) assert(rules.includes(value), `Las reglas omiten el enum ${value}`);
    assert.match(rules, /telemetría del puente[\s\S]*fuente autoritativa/);
    assert.match(rules, /NO_OBSERVABLE/);
  } finally { prepared.clean(); }
});

test("buildPrompt transporta la precedencia canónica sobre restricciones ad hoc", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  const prepared = renderedPrompt(current);
  try {
    assert.match(
      prepared.prompt,
      /El canon incluido en el contexto autorizado prevalece sobre cualquier restricción\s+operacional ad hoc que pretenda crear un gate material sin fundamento canónico\./,
    );
  } finally { prepared.clean(); }
});

test("buildPrompt conserva literalmente las secuencias especiales de sustitución", () => {
  const root = mkdtempSync(join(tmpdir(), "handoff-dollar-regression-"));
  const special = "$`\n$'\n$&\n$$";
  const specialContext = `contexto-inicio\n${special}\ncontexto-fin`;
  const specialDiff = "diff-inicio\n+$`\n+$'\n+$&\n+$$\ndiff-fin\n";
  const current = validateContract(contract({ tarea: `tarea-inicio\n${special}\ntarea-fin`, base_sha: "b".repeat(40) }), BASE_CONFIG);
  const previousResult = { resumen: `previo-inicio\n${special}\nprevio-fin` };
  const run = (_command, args) => {
    if (args.includes("show")) return { status: 0, stdout: specialContext, stderr: "" };
    if (args.includes("diff")) return { status: 0, stdout: specialDiff, stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  try {
    const prepared = prepareInput({ repo: ROOT, contract: current, runDir: root, previousResult, run });
    assert(prepared.prompt.includes(JSON.stringify(current, null, 2)), "el contrato no conservó las secuencias literalmente");
    assert(prepared.prompt.includes(JSON.stringify(previousResult, null, 2)), "el resultado previo no conservó las secuencias literalmente");
    assert(prepared.prompt.includes(specialContext), "el contexto no conservó literalmente $`, $', $& y $$");
    assert(prepared.prompt.includes(specialDiff), "el diff no conservó literalmente $`, $', $& y $$");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("buildPrompt conserva salida byte a byte para contenido sin sustituciones especiales", () => {
  const root = mkdtempSync(join(tmpdir(), "handoff-byte-equivalence-"));
  const ordinaryContext = "contenido ordinario sin secuencias especiales\n";
  const ordinaryDiff = "diff --git a/a.txt b/a.txt\n+línea ordinaria\n";
  const current = validateContract(contract({ base_sha: "b".repeat(40) }), BASE_CONFIG);
  const contexts = current.contexto_autorizado.map((path) => ({ path, content: ordinaryContext }));
  const run = (_command, args) => {
    if (args.includes("show")) return { status: 0, stdout: ordinaryContext, stderr: "" };
    if (args.includes("diff")) return { status: 0, stdout: ordinaryDiff, stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  try {
    const prepared = prepareInput({ repo: ROOT, contract: current, runDir: root, previousResult: null, run });
    const expected = legacyPromptForOrdinaryContent({
      template: PROMPT_TEMPLATE,
      currentContract: current,
      previousResult: null,
      contexts,
      resultSchema: RESULT_SCHEMA_RAW,
      frozenDiff: ordinaryDiff,
    });
    assert.deepEqual(Buffer.from(prepared.prompt, "utf8"), Buffer.from(expected, "utf8"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("buildPrompt no reexamina tokens literales insertados desde contexto", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  const literalTokens = "{{SCHEMA_SALIDA}}\n{{EJEMPLO_SALIDA}}\n{{DIFF_CONGELADO}}";
  const path = current.contexto_autorizado[0];
  const prompt = buildPrompt(
    PROMPT_TEMPLATE, current, null, [{ path, content: literalTokens }], RESULT_SCHEMA_RAW, null,
  );
  assert(prompt.includes(`### ${path}\n\n${literalTokens}`));
  assert.equal(extractPromptJsonBlock(prompt, "Schema del contrato de salida"), RESULT_SCHEMA_RAW.trim().replaceAll("\r\n", "\n"));
  assert.equal(validateResult(JSON.parse(extractPromptJsonBlock(prompt, "Ejemplo canónico mínimo")), current, BASE_CONFIG).estado, "COMPLETADO");
  for (const token of ["{{SCHEMA_SALIDA}}", "{{EJEMPLO_SALIDA}}", "{{DIFF_CONGELADO}}"]) {
    assert.equal(countOccurrences(prompt, token), 1, `${token} fue reexaminado o el hueco real quedó sin sustituir`);
  }
});

test("buildPrompt no reexamina tokens literales insertados desde el diff", () => {
  const current = validateContract(contract({ base_sha: "b".repeat(40) }), BASE_CONFIG);
  const literalTokens = "{{SCHEMA_SALIDA}}\n{{EJEMPLO_SALIDA}}\n{{DIFF_CONGELADO}}";
  const prompt = buildPrompt(
    PROMPT_TEMPLATE, current, null,
    [{ path: current.contexto_autorizado[0], content: "contexto ordinario" }],
    RESULT_SCHEMA_RAW, `diff-inicio\n${literalTokens}\ndiff-fin\n`,
  );
  assert(prompt.includes(`diff-inicio\n${literalTokens}\ndiff-fin\n`));
  assert.equal(extractPromptJsonBlock(prompt, "Schema del contrato de salida"), RESULT_SCHEMA_RAW.trim().replaceAll("\r\n", "\n"));
  assert.equal(validateResult(JSON.parse(extractPromptJsonBlock(prompt, "Ejemplo canónico mínimo")), current, BASE_CONFIG).estado, "COMPLETADO");
  for (const token of ["{{SCHEMA_SALIDA}}", "{{EJEMPLO_SALIDA}}", "{{DIFF_CONGELADO}}"]) {
    assert.equal(countOccurrences(prompt, token), 1, `${token} fue reexaminado o el hueco real quedó sin sustituir`);
  }
});

test("buildPrompt no deja tokens sin sustituir en un caso normal", () => {
  const current = validateContract(contract({ base_sha: "b".repeat(40) }), BASE_CONFIG);
  const prompt = buildPrompt(
    PROMPT_TEMPLATE, current, null,
    [{ path: current.contexto_autorizado[0], content: "contexto ordinario" }],
    RESULT_SCHEMA_RAW, "diff ordinario\n",
  );
  assert.equal(prompt.match(/\{\{[A-Z_]+\}\}/g), null);
});

test("buildPrompt falla cerrado si el template no sustituye exactamente siete claves", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  const args = [
    current, null, [{ path: current.contexto_autorizado[0], content: "contexto" }], RESULT_SCHEMA_RAW, null,
  ];
  const missing = PROMPT_TEMPLATE.replace("{{CONTEXTO}}", "");
  const duplicated = `${PROMPT_TEMPLATE}\n{{CONTEXTO}}`;
  for (const template of [missing, duplicated]) {
    assert.throws(
      () => buildPrompt(template, ...args),
      (error) => error.name === "HandoffError" && /se esperaban exactamente estas claves/.test(error.message),
    );
  }
});

test("ejemplo canónico renderizado cumple validateResult", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  const prepared = renderedPrompt(current);
  try {
    const example = JSON.parse(extractPromptJsonBlock(prepared.prompt, "Ejemplo canónico mínimo"));
    assert.equal(validateResult(example, current, BASE_CONFIG), example);
  } finally { prepared.clean(); }
});

test("regresión de Issue 35 falla por handoff_version antes de normalizar campos", () => {
  const current = validateContract(contract({
    destinatario: "kimi",
    contexto_autorizado: [...GOVERNING_CONTEXT.common, GOVERNING_CONTEXT.kimi],
  }), BASE_CONFIG);
  const secondAttempt = {
    estado: "APROBADO",
    veredicto: "Aprobado.",
    resumen: "Revisión terminada.",
    evidencia: [{ archivo: "reviewer-policy.md", resultado: "Sin hallazgos." }],
    archivos_leidos: ["reviewer-policy.md"],
    accion_recomendada: "Integrar.",
    siguiente_destinatario: null,
    firma: {
      ejecutor: "kimi", modelo: "K3-256k", esfuerzo: "high", head_sha: current.head_sha,
      entorno: "CLI", via: "membresía", fecha: "2026-08-13", sujeto: "PR",
      reviewer: "Kimi", runtime: "0.34.0", resultado: "APROBADO",
    },
  };
  assert.throws(
    () => validateResult(secondAttempt, current, BASE_CONFIG),
    (error) => error.label === "handoff:failed" && /handoff_version/.test(error.message),
  );
});

test("handoff_version y estado inválidos producen mensajes separados", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  const missingVersion = validResult(current);
  delete missingVersion.handoff_version;
  assert.throws(() => validateResult(missingVersion, current, BASE_CONFIG), /handoff_version de salida inválido/);
  assert.throws(
    () => validateResult({ ...validResult(current), estado: "APROBADO" }, current, BASE_CONFIG),
    /estado de salida inválido/,
  );
});

test("claves extra fallan por separado en resultado, evidencia y firma", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  assert.throws(
    () => validateResult({ ...validResult(current), extra: true }, current, BASE_CONFIG),
    /resultado: campos incompatibles: extra/,
  );
  const extraEvidence = validResult(current);
  extraEvidence.evidencia[0].extra = true;
  assert.throws(() => validateResult(extraEvidence, current, BASE_CONFIG), /evidencia: campos incompatibles: extra/);
  const extraSignature = validResult(current);
  extraSignature.firma.extra = true;
  assert.throws(() => validateResult(extraSignature, current, BASE_CONFIG), /firma: campos incompatibles: extra/);
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
  assert.deepEqual(commonFromSchema, GOVERNING_CONTEXT.common);
  const recipientRules = Object.fromEntries(CONTRACT_SCHEMA.allOf.slice(1).map((rule) => [
    rule.if.properties.destinatario.const,
    rule.then.properties.contexto_autorizado.contains.const,
  ]));
  assert.deepEqual(recipientRules, {
    codex: GOVERNING_CONTEXT.codex,
    claude: GOVERNING_CONTEXT.claude,
    kimi: GOVERNING_CONTEXT.kimi,
  });
});

test("contrato Kimi exige reviewer-policy.md y admite el resto del canon", () => {
  const kimiContext = [...GOVERNING_CONTEXT.common, GOVERNING_CONTEXT.kimi];
  const current = validateContract(contract({ destinatario: "kimi", contexto_autorizado: kimiContext }), BASE_CONFIG);
  assert.equal(current.destinatario, "kimi");
  assert.throws(
    () => validateContract(contract({ destinatario: "kimi", contexto_autorizado: GOVERNING_CONTEXT.common }), BASE_CONFIG),
    /omite canon gobernante: reviewer-policy\.md/,
  );
});

test("resultado firmado por Kimi no puede corresponder a otro destinatario", () => {
  const current = validateContract(contract(), BASE_CONFIG);
  const result = validResult(current);
  result.firma.ejecutor = "kimi";
  assertResultFailed(result, current);
});

test("observeAuthentication demuestra Kimi managed OAuth y rechaza una vía directa", () => {
  const adapter = BASE_CONFIG.agents.kimi;
  const managed = {
    providers: {
      "managed:kimi-code": {
        type: "kimi", baseUrl: "https://api.kimi.com/coding/v1",
        apiKey: "", oauth: { storage: "file", key: "oauth/kimi-code" },
      },
    },
    models: {
      [adapter.alias]: {
        provider: "managed:kimi-code", model: adapter.model,
        capabilities: ["thinking", "always_thinking"], supportEfforts: ["low", "high", "max"],
      },
    },
  };
  const observed = observeAuthentication("kimi", adapter, {
    run: () => ({ stdout: JSON.stringify(managed), stderr: "", status: 0 }),
    env: {},
  });
  assert.equal(observed.observed_via, "kimi_membership_oauth");
  assert.equal(observed.valid, true);

  const direct = structuredClone(managed);
  direct.providers["managed:kimi-code"] = {
    type: "kimi", baseUrl: "https://api.moonshot.ai/v1", apiKey: "masked",
  };
  assert.equal(observeAuthentication("kimi", adapter, {
    run: () => ({ stdout: JSON.stringify(direct), stderr: "", status: 0 }), env: {},
  }).valid, false);
});

test("invokeAgent usa Kimi aislado, fija K3-256k high y no reenvía PAYG", () => {
  const current = validateContract(contract({
    destinatario: "kimi",
    contexto_autorizado: [...GOVERNING_CONTEXT.common, GOVERNING_CONTEXT.kimi],
  }), BASE_CONFIG);
  const root = mkdtempSync(join(tmpdir(), "handoff-kimi-test-"));
  const expected = validResult(current, null);
  const calls = [];
  try {
    const invocation = invokeAgent({
      contract: current,
      adapter: { ...BASE_CONFIG.agents.kimi, timeout_ms: 1234 },
      prompt: "PAQUETE CONGELADO",
      runDir: root,
      env: { PATH: "ruta-controlada", KIMI_API_KEY: "no-debe-pasar" },
      run: (command, args, options) => {
        calls.push({ command, args, options });
        return {
          status: 0,
          stderr: "",
          stdout: [
            JSON.stringify({ role: "meta", type: "system.version", version: "0.34.0" }),
            JSON.stringify({ role: "assistant", content: JSON.stringify(expected) }),
          ].join("\n"),
        };
      },
    });
    assert.deepEqual(invocation.result, expected);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "kimi");
    assert(calls[0].args.includes("kimi-code/k3-256k"));
    assert.equal(calls[0].args.includes("--session"), false);
    assert.equal(calls[0].args.includes("--continue"), false);
    assert.equal(calls[0].options.env.KIMI_MODEL_THINKING_EFFORT, "high");
    assert.equal(calls[0].options.env.KIMI_CODE_EXPERIMENTAL_FLAG, undefined);
    assert.equal(calls[0].options.env.KIMI_API_KEY, undefined);
    assert.equal(calls[0].options.env.KIMI_BASE_URL, undefined);
    assert.equal(calls[0].options.env.KIMI_CODE_BASE_URL, undefined);
    const agentPath = calls[0].args[calls[0].args.indexOf("--agent-file") + 1];
    const agent = readFileSync(agentPath, "utf8");
    assert.match(agent, /tools: \[\]/);
    assert.match(agent, /PAQUETE CONGELADO/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("invokeAgent acepta un único bloque JSON fenced de Kimi", () => {
  const current = validateContract(contract({
    destinatario: "kimi",
    contexto_autorizado: [...GOVERNING_CONTEXT.common, GOVERNING_CONTEXT.kimi],
  }), BASE_CONFIG);
  const root = mkdtempSync(join(tmpdir(), "handoff-kimi-fenced-test-"));
  const expected = validResult(current, null);
  try {
    const invocation = invokeAgent({
      contract: current,
      adapter: { ...BASE_CONFIG.agents.kimi, timeout_ms: 1234 },
      prompt: "PAQUETE CONGELADO",
      runDir: root,
      run: () => ({
        status: 0,
        stderr: "",
        stdout: [
          JSON.stringify({ role: "meta", type: "system.version", version: "0.34.0" }),
          JSON.stringify({ role: "assistant", content: `\`\`\`json\n${JSON.stringify(expected, null, 2)}\n\`\`\`` }),
        ].join("\n"),
      }),
    });
    assert.deepEqual(invocation.result, expected);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("invokeAgent rechaza prosa alrededor de un bloque JSON fenced de Kimi", () => {
  const current = validateContract(contract({
    destinatario: "kimi",
    contexto_autorizado: [...GOVERNING_CONTEXT.common, GOVERNING_CONTEXT.kimi],
  }), BASE_CONFIG);
  const root = mkdtempSync(join(tmpdir(), "handoff-kimi-fenced-prose-test-"));
  const expected = validResult(current, null);
  try {
    assert.throws(() => invokeAgent({
      contract: current,
      adapter: { ...BASE_CONFIG.agents.kimi, timeout_ms: 1234 },
      prompt: "PAQUETE CONGELADO",
      runDir: root,
      run: () => ({
        status: 0,
        stderr: "",
        stdout: JSON.stringify({
          role: "assistant",
          content: `Resultado:\n\`\`\`json\n${JSON.stringify(expected)}\n\`\`\``,
        }),
      }),
    }), /Kimi no emitió JSON válido/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("invokeAgent rechaza un bloque fenced de Kimi sin etiqueta json", () => {
  const current = validateContract(contract({
    destinatario: "kimi",
    contexto_autorizado: [...GOVERNING_CONTEXT.common, GOVERNING_CONTEXT.kimi],
  }), BASE_CONFIG);
  const root = mkdtempSync(join(tmpdir(), "handoff-kimi-unlabelled-fence-test-"));
  const expected = validResult(current, null);
  try {
    assert.throws(() => invokeAgent({
      contract: current,
      adapter: { ...BASE_CONFIG.agents.kimi, timeout_ms: 1234 },
      prompt: "PAQUETE CONGELADO",
      runDir: root,
      run: () => ({
        status: 0,
        stderr: "",
        stdout: JSON.stringify({ role: "assistant", content: `\`\`\`\n${JSON.stringify(expected)}\n\`\`\`` }),
      }),
    }), /Kimi no emitió JSON válido/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("invokeAgent rechaza eventos de herramienta emitidos por Kimi", () => {
  const current = validateContract(contract({
    destinatario: "kimi",
    contexto_autorizado: [...GOVERNING_CONTEXT.common, GOVERNING_CONTEXT.kimi],
  }), BASE_CONFIG);
  const root = mkdtempSync(join(tmpdir(), "handoff-kimi-tool-test-"));
  try {
    assert.throws(() => invokeAgent({
      contract: current,
      adapter: { ...BASE_CONFIG.agents.kimi, timeout_ms: 1234 },
      prompt: "PAQUETE CONGELADO",
      runDir: root,
      run: () => ({
        status: 0, stderr: "",
        stdout: [
          JSON.stringify({ role: "meta", type: "system.version", version: "0.34.0" }),
          JSON.stringify({ role: "assistant", tool_calls: [{ name: "Shell" }] }),
          JSON.stringify({ role: "tool", name: "Shell", content: "no permitido" }),
        ].join("\n"),
      }),
    }), /Kimi emitió un evento no permitido: tool/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("base_sha agrega diff.patch al paquete y al fingerprint; ausente conserva el paquete previo", () => {
  const root = mkdtempSync(join(tmpdir(), "handoff-base-sha-test-"));
  const calls = [];
  const run = (_command, args) => {
    calls.push(args);
    if (args.includes("show")) return { status: 0, stdout: `contenido congelado de ${args.at(-1)}\n`, stderr: "" };
    if (args.includes("diff")) return { status: 0, stdout: "diff --git a/a.txt b/a.txt\n+línea\n", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  const noBaseDir = join(root, "sin-base");
  const withBaseDir = join(root, "con-base");
  try {
    const current = validateContract(contract(), BASE_CONFIG);
    const noBase = prepareInput({ repo: ROOT, contract: current, runDir: noBaseDir, previousResult: null, run });
    assert.equal(existsSync(join(noBase.inputDir, "diff.patch")), false);
    assert.equal(calls.some((args) => args.includes("diff")), false);
    assert.deepEqual(noBase.manifest.files.map((entry) => entry.path), [
      "context/AGENTS.md",
      "context/decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md",
      "context/decisiones/0013-delegar-cierre-operativo-y-merge-rutinario.md",
      "context/decisiones/README.md",
      "context/equipo.md",
      "context/pendientes.md",
      "context/reglas.md",
      "contract.json",
      "handoff-result.schema.json",
      "handoff.schema.json",
      "prompt.md",
    ]);
    assert.equal(noBase.prompt.includes("## Diff congelado base → HEAD"), false);
    assert.equal(
      extractPromptJsonBlock(noBase.prompt, "Schema del contrato de salida"),
      RESULT_SCHEMA_RAW.trim().replaceAll("\r\n", "\n"),
    );

    calls.length = 0;
    const withBaseContract = validateContract(contract({ base_sha: "b".repeat(40) }), BASE_CONFIG);
    const withBase = prepareInput({ repo: ROOT, contract: withBaseContract, runDir: withBaseDir, previousResult: null, run });
    const diff = readFileSync(join(withBase.inputDir, "diff.patch"), "utf8");
    const diffEntry = withBase.manifest.files.find((entry) => entry.path === "diff.patch");
    assert.equal(diff, "diff --git a/a.txt b/a.txt\n+línea\n");
    assert(withBase.prompt.includes(diff), "el prompt no contiene el diff congelado");
    assert.match(withBase.prompt, /## Diff congelado base → HEAD/);
    assert.match(withBase.prompt, /No lo incluyas en\n`archivos_leidos`/);
    assert.equal(diffEntry.sha256, sha256(Buffer.from(diff)));
    assert.notEqual(withBase.manifest.input_fingerprint, noBase.manifest.input_fingerprint);
    assert.equal(calls.filter((args) => args.includes("diff")).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("diff.patch no es un path válido de archivos_leidos", () => {
  const current = validateContract(contract({ base_sha: "b".repeat(40) }), BASE_CONFIG);
  const result = validResult(current);
  result.archivos_leidos = [...result.archivos_leidos, "diff.patch"];
  assertResultFailed(result, current);
});

test("base_sha inválido termina blocked antes de inferencia", async () => {
  let invocations = 0;
  const backend = new FakeBackend([{
    number: 1, title: "bad-base", body: issueBody(contract({ base_sha: "main" })),
    createdAt: "2026-08-11T00:00:00Z",
  }]);
  const fx = fixture(backend, { invoke: () => { invocations += 1; throw new Error("No debe inferir"); } });
  try {
    const result = await poll(fx.options);
    assert.equal(result.processed[0].status, "blocked");
    assert.match(result.processed[0].error, /base_sha inválido/);
    assert.equal(invocations, 0);
  } finally { clean(fx); }
});

test("vía Kimi no demostrable termina blocked-via sin invocar el modelo", async () => {
  let invocations = 0;
  const kimiContract = contract({
    destinatario: "kimi",
    contexto_autorizado: [...GOVERNING_CONTEXT.common, GOVERNING_CONTEXT.kimi],
  });
  const backend = new FakeBackend([{
    number: 1, title: "Kimi", body: issueBody(kimiContract), createdAt: "2026-08-11T00:00:00Z",
  }]);
  const fx = fixture(backend, {
    authObserver: () => ({
      authorized_via: "kimi_membership_oauth", observed_via: "unverified", evidence: {}, valid: false,
    }),
    invoke: () => { invocations += 1; throw new Error("No debe inferir"); },
  });
  try {
    const result = await poll(fx.options);
    assert.equal(result.processed[0].status, "blocked-via");
    assert.equal(invocations, 0);
  } finally { clean(fx); }
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
  for (const recipient of ["codex", "claude", "kimi"]) {
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

test("un relevo dirigido a Kimi conserva el rol reviewer y agrega su adaptador", async () => {
  const backend = new FakeBackend([{ number: 1, title: "A", body: issueBody(contract()), createdAt: "2026-08-11T00:00:00Z" }]);
  const fx = fixture(backend, {
    invoke: ({ contract: current }) => ({
      result: validResult(current, current.profundidad_cadena === 1 ? "kimi" : null),
      telemetry: {}, duration_ms: 1,
    }),
  });
  try {
    const result = await poll(fx.options);
    assert.deepEqual(result.processed.map((item) => item.status), ["done", "done"]);
    const child = validateContract(parseContractBody(backend.issues[1].body), BASE_CONFIG);
    assert.equal(child.destinatario, "kimi");
    assert.match(child.tarea, /Reviewer independiente/);
    assert(child.contexto_autorizado.includes(GOVERNING_CONTEXT.kimi));
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

test("tick sin waiting ni ready termina limpio sin poll ni agente", async () => {
  let polls = 0;
  let invocations = 0;
  const fx = fixture(new FakeBackend(), {
    pollFn: async () => { polls += 1; return { status: "unexpected" }; },
    invoke: () => { invocations += 1; throw new Error("No debe inferir"); },
  });
  try {
    const result = await tick(fx.options);
    assert.deepEqual(result, { status: "complete", promovidas: [], poll: null });
    assert.equal(polls, 0);
    assert.equal(invocations, 0);
  } finally { clean(fx); }
});

test("tick con next_check_at futuro no promueve, no llama poll ni notifica", async () => {
  let polls = 0;
  const notifications = [];
  const backend = new FakeBackend([waitingIssue()]);
  const fx = fixture(backend, {
    now: () => new Date("2026-08-13T10:00:30.000Z"),
    pollFn: async () => { polls += 1; },
    notify: async (payload) => { notifications.push(payload); },
  });
  try {
    const result = await tick(fx.options);
    assert.deepEqual(result, { status: "complete", promovidas: [], poll: null });
    assert.equal(polls, 0);
    assert.equal(notifications.length, 0);
    assert(backend.issues[0].labels.has("handoff:waiting"));
    assert.equal(getWaitState(fx, 1).next_check_at, "2026-08-13T10:01:00.000Z");
  } finally { clean(fx); }
});

test("tick tiempo cumplido promueve, registra transición y llama poll una vez", async () => {
  let polls = 0;
  const notifications = [];
  const backend = new FakeBackend([waitingIssue()]);
  const fx = fixture(backend, {
    now: () => new Date("2026-08-13T10:02:00.000Z"),
    pollFn: async () => { polls += 1; return { status: "complete", processed: [{ issue: 1, status: "done" }] }; },
    notify: async (payload) => { notifications.push(payload); return { sent: true }; },
  });
  try {
    const result = await tick(fx.options);
    assert.deepEqual(result, {
      status: "complete", promovidas: [1], poll: { status: "complete", processed: [{ issue: 1, status: "done" }] },
    });
    assert.equal(polls, 1);
    assert(backend.issues[0].labels.has("handoff:ready"));
    assert.match(readFileSync(join(fx.options.artifactsDir, "transitions.log"), "utf8"), /"from":"waiting","to":"ready"/);
    assert.deepEqual(notifications.map(({ event, priority }) => ({ event, priority })), [{ event: "resumed", priority: 3 }]);
  } finally { clean(fx); }
});

test("tick posterior rescata una promoción que el primer poll no vio", async () => {
  const backend = new FakeBackend([waitingIssue()]);
  const originalList = backend.listByLabel.bind(backend);
  let ocultarPrimeraAlta = true;
  backend.listByLabel = (label) => {
    const issues = originalList(label);
    if (label === "handoff:ready" && issues.length && ocultarPrimeraAlta) {
      ocultarPrimeraAlta = false;
      return [];
    }
    return issues;
  };
  let invocations = 0;
  const fx = fixture(backend, {
    now: () => new Date("2026-08-13T10:02:00.000Z"),
    warn: () => {},
    invoke: ({ contract: current }) => {
      invocations += 1;
      return { result: validResult(current, null), telemetry: {}, duration_ms: 1 };
    },
  });
  try {
    const first = await tick(fx.options);
    assert.deepEqual(first.promovidas, [1]);
    assert.deepEqual(first.poll.processed, []);
    assert(backend.issues[0].labels.has("handoff:ready"));
    assert.equal(getWaitState(fx, 1).phase, "ready");

    const second = await tick(fx.options);
    assert.deepEqual(second.promovidas, []);
    assert.deepEqual(second.poll.processed.map(({ issue, status }) => ({ issue, status })), [{ issue: 1, status: "done" }]);
    assert.equal(invocations, 1);
    assert(backend.issues[0].labels.has("handoff:done"));
  } finally { clean(fx); }
});

test("tick despacha ready cuando state.json demuestra promoción del scheduler", async () => {
  const backend = new FakeBackend([{
    number: 1, title: "ready-promovida", body: issueBody(contract()),
    createdAt: "2026-08-13T01:00:00Z", labels: ["handoff:ready"], comments: [],
  }]);
  let invocations = 0;
  const fx = fixture(backend, {
    invoke: ({ contract: current }) => {
      invocations += 1;
      return { result: validResult(current, null), telemetry: {}, duration_ms: 1 };
    },
  });
  setWaitState(fx, 1, { phase: "ready", intentos: 0, next_check_at: null, ultimo_error: null });
  try {
    const result = await tick(fx.options);
    assert.deepEqual(result.promovidas, []);
    assert.deepEqual(result.poll.processed.map(({ issue, status }) => ({ issue, status })), [{ issue: 1, status: "done" }]);
    assert.equal(invocations, 1);
  } finally { clean(fx); }
});

test("tick no despacha ready sin procedencia local del scheduler", async () => {
  const backend = new FakeBackend([{
    number: 1, title: "ready-manual", body: issueBody(contract()),
    createdAt: "2026-08-13T01:00:00Z", labels: ["handoff:ready"], comments: [],
  }]);
  let polls = 0;
  let invocations = 0;
  const fx = fixture(backend, {
    pollFn: async () => { polls += 1; return { status: "complete", processed: [] }; },
    invoke: () => { invocations += 1; throw new Error("No debe inferir"); },
  });
  try {
    const result = await tick(fx.options);
    assert.deepEqual(result, { status: "complete", promovidas: [], poll: null });
    assert.equal(polls, 0);
    assert.equal(invocations, 0);
    assert(backend.issues[0].labels.has("handoff:ready"));
  } finally { clean(fx); }
});

test("poll no procesa dos veces una unidad repetida por el índice de labels", async () => {
  const backend = new FakeBackend([{
    number: 1, title: "ready-repetida", body: issueBody(contract()),
    createdAt: "2026-08-13T01:00:00Z", labels: ["handoff:ready"], comments: [],
  }]);
  const staleIssue = backend.issues[0];
  const originalList = backend.listByLabel.bind(backend);
  backend.listByLabel = (label) => label === "handoff:ready" ? [staleIssue] : originalList(label);
  let invocations = 0;
  const fx = fixture(backend, {
    invoke: ({ contract: current }) => {
      invocations += 1;
      return { result: validResult(current, null), telemetry: {}, duration_ms: 1 };
    },
  });
  try {
    const result = await poll(fx.options);
    assert.equal(result.processed.length, 1);
    assert.deepEqual(result.processed[0], { issue: 1, status: "done", child_issue: null });
    assert.equal(invocations, 1);
    assert.equal(backend.issues[0].comments.length, 1);
  } finally { clean(fx); }
});

test("tick señala una promoción que poll no cubrió", async () => {
  const notifications = [];
  const warnings = [];
  const backend = new FakeBackend([waitingIssue()]);
  const fx = fixture(backend, {
    now: () => new Date("2026-08-13T10:02:00.000Z"),
    pollFn: async () => ({ status: "complete", processed: [] }),
    notify: async (payload) => { notifications.push(payload); },
    warn: (message) => { warnings.push(message); },
  });
  try {
    const result = await tick(fx.options);
    assert.deepEqual(result.promovidas, [1]);
    assert.deepEqual(result.poll.processed, []);
    assert.deepEqual(notifications.map(({ event }) => event), ["resumed", "dispatch_gap"]);
    assert.deepEqual(warnings, ["handoff: poll no procesó unidades promovidas por tick: 1"]);
    assert.match(readFileSync(join(fx.options.artifactsDir, "transitions.log"), "utf8"), /"reason":"poll_no_proceso_promocion"/);
  } finally { clean(fx); }
});

test("tick aísla un fallo por unidad, evalúa las posteriores y despacha promociones previas", async () => {
  let polls = 0;
  const notifications = [];
  const backend = new FakeBackend([
    waitingIssue(1),
    waitingIssue(2, { condicion: "check_run", parametros: { pr: 49, nombre: "review" } }),
    waitingIssue(3),
  ]);
  backend.checkRun = () => { throw new Error("GitHub temporalmente inaccesible"); };
  const fx = fixture(backend, {
    now: () => new Date("2026-08-13T10:02:00.000Z"),
    pollFn: async () => {
      polls += 1;
      assert(backend.issues[0].labels.has("handoff:ready"));
      assert(backend.issues[2].labels.has("handoff:ready"));
      return { status: "complete", processed: [{ issue: 1 }, { issue: 3 }] };
    },
    notify: async (payload) => { notifications.push(payload); },
  });
  try {
    const result = await tick(fx.options);
    assert.deepEqual(result.promovidas, [1, 3]);
    assert.equal(polls, 1);
    assert(backend.issues[1].labels.has("handoff:waiting"));
    assert.equal(getWaitState(fx, 2).intentos, 1);
    assert.match(getWaitState(fx, 2).ultimo_error, /GitHub temporalmente inaccesible/);
    assert.deepEqual(notifications.map(({ event }) => event), ["resumed", "wait_check_error", "resumed"]);
  } finally { clean(fx); }
});

test("tick agota el presupuesto de errores inesperados y termina needs_human", async () => {
  let nowValue = new Date("2026-08-13T10:02:00.000Z");
  const notifications = [];
  const backend = new FakeBackend([
    waitingIssue(1, {
      condicion: "check_run", parametros: { pr: 49, nombre: "review" }, max_intentos: 1,
    }),
  ]);
  backend.checkRun = () => { throw new Error("fallo persistente del checker"); };
  const fx = fixture(backend, {
    now: () => nowValue,
    pollFn: async () => assert.fail("No debe llamar poll"),
    notify: async (payload) => { notifications.push(payload); },
  });
  try {
    await tick(fx.options);
    const retryState = getWaitState(fx, 1);
    assert.equal(retryState.intentos, 1);
    assert(backend.issues[0].labels.has("handoff:waiting"));
    nowValue = new Date(retryState.next_check_at);
    await tick(fx.options);
    assert(backend.issues[0].labels.has("handoff:blocked"));
    assert.equal(getWaitState(fx, 1).intentos, 2);
    assert.deepEqual(notifications.map(({ event }) => event), [
      "wait_check_error", "terminal_error", "needs_human",
    ]);
  } finally { clean(fx); }
});

test("tick admite el descriptor congelado con finales CRLF de Windows", async () => {
  const issue = waitingIssue();
  issue.comments[0].body = issue.comments[0].body.replaceAll("\n", "\r\n");
  const backend = new FakeBackend([issue]);
  const fx = fixture(backend, {
    now: () => new Date("2026-08-13T10:02:00.000Z"),
    pollFn: async () => ({ status: "complete", processed: [] }),
  });
  try {
    assert.deepEqual((await tick(fx.options)).promovidas, [1]);
  } finally { clean(fx); }
});

test("tick check_run FAILURE permanece waiting y registra el error", async () => {
  const backend = new FakeBackend([
    waitingIssue(1, { condicion: "check_run", parametros: { pr: 46, nombre: "review / review" } }),
  ], { checkRuns: { "46:review / review": { conclusion: "FAILURE", status: "COMPLETED" } } });
  const fx = fixture(backend, { now: () => new Date("2026-08-13T10:02:00.000Z"), pollFn: async () => assert.fail("No debe llamar poll") });
  try {
    const result = await tick(fx.options);
    assert.deepEqual(result.promovidas, []);
    assert(backend.issues[0].labels.has("handoff:waiting"));
    const state = getWaitState(fx, 1);
    assert.equal(state.intentos, 1);
    assert.equal(state.ultimo_error, "check_run review / review: FAILURE");
  } finally { clean(fx); }
});

test("tick aplica backoff exponencial creciente con techo de una hora", async () => {
  let nowValue = new Date("2026-08-13T10:40:00.000Z");
  const backend = new FakeBackend([
    waitingIssue(1, {
      condicion: "check_run", parametros: { pr: 46, nombre: "review" }, intervalo_segundos: 2000,
    }),
  ], { checkRuns: { "46:review": { conclusion: "FAILURE" } } });
  const fx = fixture(backend, { now: () => nowValue, pollFn: async () => assert.fail("No debe llamar poll") });
  try {
    await tick(fx.options);
    let state = getWaitState(fx, 1);
    assert.equal(state.intentos, 1);
    assert.equal(Date.parse(state.next_check_at) - nowValue.getTime(), 2_000_000);
    nowValue = new Date(state.next_check_at);
    await tick(fx.options);
    state = getWaitState(fx, 1);
    assert.equal(state.intentos, 2);
    assert.equal(Date.parse(state.next_check_at) - nowValue.getTime(), 3_600_000);
  } finally { clean(fx); }
});

test("tick bloquea al superar max_intentos y emite terminal_error más needs_human", async () => {
  const notifications = [];
  const backend = new FakeBackend([
    waitingIssue(1, { condicion: "check_run", parametros: { pr: 46, nombre: "review" }, max_intentos: 3 }),
  ], { checkRuns: { "46:review": { conclusion: "FAILURE" } } });
  const fx = fixture(backend, {
    now: () => new Date("2026-08-13T10:02:00.000Z"),
    notify: async (payload) => { notifications.push(payload); },
    pollFn: async () => assert.fail("No debe llamar poll"),
  });
  setWaitState(fx, 1, { phase: "waiting", intentos: 3, next_check_at: "2026-08-13T10:01:00.000Z", ultimo_error: "previo" });
  try {
    const result = await tick(fx.options);
    assert.deepEqual(result.promovidas, []);
    assert(backend.issues[0].labels.has("handoff:blocked"));
    assert.equal(getWaitState(fx, 1).intentos, 4);
    assert.deepEqual(notifications.map(({ event, priority }) => ({ event, priority })), [
      { event: "terminal_error", priority: 4 }, { event: "needs_human", priority: 5 },
    ]);
  } finally { clean(fx); }
});

test("tick bloquea por descriptor ausente, JSON inválido y condición desconocida", async (t) => {
  const cases = [
    ["ausente", []],
    ["JSON inválido", [{ body: `<!-- handoff-wait:1:${HEAD} -->\n\n\`\`\`json\n{\n\`\`\`` }]],
    ["condición desconocida", [{ body: waitDescriptor(1, { condicion: "cuota", parametros: {} }) }]],
  ];
  for (const [name, comments] of cases) await t.test(name, async () => {
    const notifications = [];
    const backend = new FakeBackend([waitingIssue(1, {}, { comments })]);
    const fx = fixture(backend, { notify: async (payload) => { notifications.push(payload); }, pollFn: async () => assert.fail("No debe llamar poll") });
    try {
      const result = await tick(fx.options);
      assert.deepEqual(result.promovidas, []);
      assert(backend.issues[0].labels.has("handoff:blocked"));
      assert.deepEqual(notifications.map(({ event }) => event), ["needs_human"]);
    } finally { clean(fx); }
  });
});

test("tick bloquea un descriptor ambiguo con múltiples marcadores", async () => {
  const comments = [{ body: waitDescriptor(1) }, { body: waitDescriptor(1) }];
  const backend = new FakeBackend([waitingIssue(1, {}, { comments })]);
  const fx = fixture(backend, { pollFn: async () => assert.fail("No debe llamar poll") });
  try {
    await tick(fx.options);
    assert(backend.issues[0].labels.has("handoff:blocked"));
    assert.equal(getWaitState(fx, 1).ultimo_error, "Descriptor de espera ambiguo");
  } finally { clean(fx); }
});

test("tick bloquea si el HEAD del marcador no coincide con el contrato", async () => {
  const comments = [{ body: waitDescriptor(1, {}, "a".repeat(40)) }];
  const backend = new FakeBackend([waitingIssue(1, {}, { comments })]);
  const fx = fixture(backend, { pollFn: async () => assert.fail("No debe llamar poll") });
  try {
    await tick(fx.options);
    assert(backend.issues[0].labels.has("handoff:blocked"));
    assert.equal(getWaitState(fx, 1).ultimo_error, "HEAD del descriptor de espera no coincide con el contrato");
  } finally { clean(fx); }
});

test("tick bloquea un descriptor incompleto", async () => {
  const backend = new FakeBackend([waitingIssue(1, { max_intentos: undefined })]);
  const fx = fixture(backend, { pollFn: async () => assert.fail("No debe llamar poll") });
  try {
    await tick(fx.options);
    assert(backend.issues[0].labels.has("handoff:blocked"));
    assert.equal(getWaitState(fx, 1).ultimo_error, "Descriptor de espera incompleto");
  } finally { clean(fx); }
});

test("tick bloquea un descriptor con campos extra", async () => {
  const backend = new FakeBackend([waitingIssue(1, { campo_inesperado: true })]);
  const fx = fixture(backend, { pollFn: async () => assert.fail("No debe llamar poll") });
  try {
    await tick(fx.options);
    assert(backend.issues[0].labels.has("handoff:blocked"));
    assert.match(getWaitState(fx, 1).ultimo_error, /campos incompatibles: campo_inesperado/);
  } finally { clean(fx); }
});

test("tick conserva waiting ante un fallo transitorio al leer comentarios", async () => {
  const backend = new FakeBackend([waitingIssue()]);
  const notifications = [];
  backend.comments = () => { throw new Error("GitHub inaccesible"); };
  const fx = fixture(backend, {
    now: () => new Date("2026-08-13T10:02:00.000Z"),
    notify: async (payload) => { notifications.push(payload); },
  });
  try {
    await tick(fx.options);
    assert(backend.issues[0].labels.has("handoff:waiting"));
    assert.equal(backend.issues[0].labels.has("handoff:blocked"), false);
    assert.equal(getWaitState(fx, 1).intentos, 1);
    assert.deepEqual(notifications.map(({ event }) => event), ["wait_check_error"]);
  } finally { clean(fx); }
});

test("tick falla globalmente si no puede listar handoff:waiting", async () => {
  let polls = 0;
  const backend = new FakeBackend();
  backend.listByLabel = () => { throw new Error("No se pudo listar waiting"); };
  const fx = fixture(backend, { pollFn: async () => { polls += 1; } });
  try {
    await assert.rejects(() => tick(fx.options), /No se pudo listar waiting/);
    assert.equal(polls, 0);
  } finally { clean(fx); }
});

test("tick bloquea fail-closed si el contador local está corrupto", async () => {
  const backend = new FakeBackend([waitingIssue()]);
  const fx = fixture(backend, { now: () => new Date("2026-08-13T10:02:00.000Z"), pollFn: async () => assert.fail("No debe llamar poll") });
  setWaitState(fx, 1, { intentos: "dos", next_check_at: "2026-08-13T10:01:00.000Z" });
  try {
    await tick(fx.options);
    assert(backend.issues[0].labels.has("handoff:blocked"));
    assert.equal(getWaitState(fx, 1).ultimo_error, "intentos local inválido");
  } finally { clean(fx); }
});

test("tick no toca una unidad que también tiene label terminal", async () => {
  const backend = new FakeBackend([waitingIssue(1, {}, { labels: ["handoff:waiting", "handoff:done"] })]);
  const fx = fixture(backend, { now: () => new Date("2026-08-13T10:02:00.000Z"), pollFn: async () => assert.fail("No debe llamar poll") });
  try {
    const result = await tick(fx.options);
    assert.deepEqual(result.promovidas, []);
    assert(backend.issues[0].labels.has("handoff:waiting"));
    assert(backend.issues[0].labels.has("handoff:done"));
    assert.equal(existsSync(waitStatePath(fx, 1)), false);
  } finally { clean(fx); }
});

test("tick respeta lock vivo y recupera lock de proceso muerto", async () => {
  const lockedFx = fixture(new FakeBackend());
  const liveLock = join(lockedFx.options.runtimeDir, "poll.lock");
  assert.equal(acquireLock(liveLock), true);
  try {
    assert.deepEqual(await tick(lockedFx.options), { status: "locked", promovidas: [], poll: null });
  } finally { clean(lockedFx); }

  const recoveredFx = fixture(new FakeBackend());
  const deadLock = join(recoveredFx.options.runtimeDir, "poll.lock");
  assert.equal(acquireLock(deadLock, { pid: 999999, created_at: "2026-08-13T00:00:00.000Z" }), true);
  try {
    assert.deepEqual(await tick(recoveredFx.options), { status: "complete", promovidas: [], poll: null });
    assert.equal(existsSync(deadLock), false);
  } finally { clean(recoveredFx); }
});

test("dos tick seguidos no duplican promoción ni notificación", async () => {
  let polls = 0;
  const notifications = [];
  const backend = new FakeBackend([waitingIssue()]);
  const fx = fixture(backend, {
    now: () => new Date("2026-08-13T10:02:00.000Z"),
    pollFn: async () => {
      polls += 1;
      backend.setState(1, "handoff:ready", "handoff:done");
      return { status: "complete", processed: [{ issue: 1, status: "done" }] };
    },
    notify: async (payload) => { notifications.push(payload); },
  });
  try {
    assert.deepEqual((await tick(fx.options)).promovidas, [1]);
    assert.deepEqual((await tick(fx.options)).promovidas, []);
    assert.equal(polls, 1);
    assert.deepEqual(notifications.map(({ event }) => event), ["resumed"]);
  } finally { clean(fx); }
});

test("la promoción resetea contadores y flags de una espera anterior", async () => {
  const backend = new FakeBackend([waitingIssue()]);
  const fx = fixture(backend, {
    now: () => new Date("2026-08-13T10:02:00.000Z"),
    pollFn: async () => ({ status: "complete", processed: [{ issue: 1, status: "done" }] }),
  });
  setWaitState(fx, 1, {
    phase: "waiting", intentos: 2, blocked_long_notified: true,
    retry_policy: { intervalo_segundos: 60, max_intentos: 3 },
    next_check_at: "2026-08-13T10:01:00.000Z", ultimo_error: "previo",
  });
  try {
    await tick(fx.options);
    const state = getWaitState(fx, 1);
    assert.equal(state.intentos, 0);
    assert.equal(state.blocked_long_notified, false);
    assert.equal(state.next_check_at, null);
    assert.equal(state.ultimo_error, null);
    assert.equal(Object.hasOwn(state, "retry_policy"), false);
  } finally { clean(fx); }
});

test("check_run ambiguo es HandoffError permanente y tick bloquea sin reintentar", async () => {
  const rollup = {
    statusCheckRollup: [
      { __typename: "CheckRun", name: "review", conclusion: "SUCCESS" },
      { __typename: "CheckRun", name: "review", conclusion: "FAILURE" },
    ],
  };
  const github = new GithubBackend("example/repo", {
    run: () => ({ status: 0, stdout: JSON.stringify(rollup), stderr: "" }),
  });
  assert.throws(
    () => github.checkRun(49, "review"),
    (error) => error instanceof HandoffError && error.label === "handoff:blocked" && /ambiguo/.test(error.message),
  );

  const notifications = [];
  const backend = new FakeBackend([
    waitingIssue(1, { condicion: "check_run", parametros: { pr: 49, nombre: "review" } }),
  ]);
  backend.checkRun = () => { throw new HandoffError("Check run ambiguo en PR #49: review", "handoff:blocked"); };
  const fx = fixture(backend, {
    now: () => new Date("2026-08-13T10:02:00.000Z"),
    notify: async (payload) => { notifications.push(payload); },
    pollFn: async () => assert.fail("No debe llamar poll"),
  });
  try {
    await tick(fx.options);
    assert(backend.issues[0].labels.has("handoff:blocked"));
    assert.equal(getWaitState(fx, 1).intentos ?? 0, 0);
    assert.deepEqual(notifications.map(({ event }) => event), ["needs_human"]);
  } finally { clean(fx); }
});

test("tick check_run sólo cumple con SUCCESS exacto", async () => {
  for (const [conclusion, expected] of [["SUCCESS", true], [null, false]]) {
    let polls = 0;
    const checks = conclusion === null ? {} : { "46:review": { conclusion } };
    const backend = new FakeBackend([
      waitingIssue(1, { condicion: "check_run", parametros: { pr: 46, nombre: "review" } }),
    ], { checkRuns: checks });
    const fx = fixture(backend, {
      now: () => new Date("2026-08-13T10:02:00.000Z"),
      pollFn: async () => { polls += 1; return { status: "complete", processed: [{ issue: 1, status: "done" }] }; },
    });
    try {
      const result = await tick(fx.options);
      assert.equal(result.promovidas.length === 1, expected, String(conclusion));
      assert.equal(polls, expected ? 1 : 0);
    } finally { clean(fx); }
  }
});

test("blocked_long se notifica una sola vez mediante state.json", async () => {
  const notifications = [];
  const backend = new FakeBackend([waitingIssue()]);
  const fx = fixture(backend, {
    now: () => new Date("2026-08-15T10:00:00.000Z"),
    notify: async (payload) => { notifications.push(payload); },
    pollFn: async () => assert.fail("No debe llamar poll"),
  });
  setWaitState(fx, 1, { intentos: 0, next_check_at: "2026-08-16T10:00:00.000Z", ultimo_error: null });
  try {
    await tick(fx.options);
    await tick(fx.options);
    assert.deepEqual(notifications.map(({ event, priority }) => ({ event, priority })), [{ event: "blocked_long", priority: 3 }]);
    assert.equal(getWaitState(fx, 1).blocked_long_notified, true);
  } finally { clean(fx); }
});

test("un fallo de ntfy no altera el resultado de tick", async () => {
  const backend = new FakeBackend([waitingIssue()]);
  const fx = fixture(backend, {
    now: () => new Date("2026-08-13T10:02:00.000Z"),
    notify: async () => { throw new Error("ntfy caído"); },
    pollFn: async () => ({ status: "complete", processed: [{ issue: 1, status: "done" }] }),
  });
  try {
    const result = await tick(fx.options);
    assert.deepEqual(result.promovidas, [1]);
    assert.equal(result.status, "complete");
  } finally { clean(fx); }
});

test("ntfy sin topic no emite, no falla y registra una sola vez", async () => {
  let fetches = 0;
  const logs = [];
  const root = mkdtempSync(join(tmpdir(), "ntfy-test-"));
  const notify = createNotifier({
    env: {},
    localConfigPath: join(root, "ausente.json"),
    fetchImpl: async () => { fetches += 1; return { ok: true, status: 200 }; },
    logger: { info: (message) => logs.push(message), warn: (message) => logs.push(message) },
  });
  try {
    const event = { event: "chain_complete", title: "T", message: "M", priority: 3, tags: [] };
    assert.deepEqual(await notify(event), { sent: false, reason: "not_configured" });
    assert.deepEqual(await notify(event), { sent: false, reason: "not_configured" });
    assert.equal(fetches, 0);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /sin topic configurado/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("ntfy usa el archivo local, la base por defecto y admite prioridad 5", async () => {
  const root = mkdtempSync(join(tmpdir(), "ntfy-test-"));
  const localConfigPath = join(root, "notify.local.json");
  writeFileSync(localConfigPath, `${JSON.stringify({ topic: "topic-ficticio-archivo" })}\n`, "utf8");
  const calls = [];
  const notify = createNotifier({
    env: {},
    localConfigPath,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200 }; },
    logger: { info() {}, warn() {} },
  });
  try {
    assert.deepEqual(await notify({
      event: "director_required", title: "Atención", message: "Intervención requerida",
      priority: 5, tags: ["rotating_light"],
    }), { sent: true });
    assert.equal(calls[0].url, "https://ntfy.sh/topic-ficticio-archivo");
    assert.equal(calls[0].options.headers.Priority, "5");
    assert.equal(calls[0].options.headers.Tags, "rotating_light");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("poll notifica una unidad ready pendiente con prioridad 4", async () => {
  const calls = [];
  const backend = new FakeBackend([{ number: 1, title: "A", body: issueBody(contract()), createdAt: "2026-08-11T00:00:00Z" }]);
  const fx = fixture(backend, {
    config: { ...BASE_CONFIG, max_unidades_por_corrida: 1 },
    notify: ntfyFixture(async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200 }; }),
  });
  try {
    const result = await poll(fx.options);
    assert.deepEqual(result.processed.map((item) => item.status), ["done"], JSON.stringify(result, null, 2));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://notify.invalid/topic-ficticio-pruebas");
    assert.equal(calls[0].options.headers.Priority, "4");
    assert.equal(calls[0].options.headers.Title, "Handoff pendiente");
    assert.equal(calls[0].options.body, "Issue #2 quedó en handoff:ready. Volvé a ejecutar poll.");
  } finally { clean(fx); }
});

test("poll notifica un terminal no done con prioridad 4 y motivo", async () => {
  const calls = [];
  const invalid = contract();
  delete invalid.head_sha;
  const backend = new FakeBackend([{ number: 7, title: "bad", body: issueBody(invalid), createdAt: "2026-08-11T00:00:00Z" }]);
  const fx = fixture(backend, {
    notify: ntfyFixture(async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200 }; }),
  });
  try {
    const result = await poll(fx.options);
    assert.equal(result.processed[0].status, "blocked");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://notify.invalid/topic-ficticio-pruebas");
    assert.equal(calls[0].options.headers.Priority, "4");
    assert.equal(calls[0].options.headers.Title, "Handoff requiere atención");
    assert.match(calls[0].options.body, /^Issue #7 terminó en handoff:blocked: head_sha inválido$/);
  } finally { clean(fx); }
});

test("poll notifica el fin de cadena con prioridad 3", async () => {
  const calls = [];
  const backend = new FakeBackend([{ number: 9, title: "A", body: issueBody(contract()), createdAt: "2026-08-11T00:00:00Z" }]);
  const fx = fixture(backend, {
    invoke: ({ contract: current }) => ({ result: validResult(current, null), telemetry: {}, duration_ms: 1 }),
    notify: ntfyFixture(async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200 }; }),
  });
  try {
    const result = await poll(fx.options);
    assert.equal(result.processed[0].status, "done", JSON.stringify(result, null, 2));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://notify.invalid/topic-ficticio-pruebas");
    assert.equal(calls[0].options.headers.Priority, "3");
    assert.equal(calls[0].options.headers.Title, "Cadena de handoff completada");
    assert.equal(calls[0].options.body, "Issue #9 completó la cadena sin siguiente destinatario.");
  } finally { clean(fx); }
});

test("fallos de ntfy no alteran el resultado de poll", async () => {
  const run = async (notify) => {
    const invalid = contract();
    delete invalid.head_sha;
    const backend = new FakeBackend([{ number: 11, title: "bad", body: issueBody(invalid), createdAt: "2026-08-11T00:00:00Z" }]);
    const fx = fixture(backend, { notify });
    try { return await poll(fx.options); } finally { clean(fx); }
  };
  const baseline = await run(async () => ({ sent: true }));

  const thrownLogs = [];
  const thrown = await run(ntfyFixture(
    async () => { throw new Error("red caída"); },
    { info() {}, warn: (message) => thrownLogs.push(message) },
  ));
  assert.deepEqual(thrown, baseline);
  assert.match(thrownLogs.join("\n"), /red caída/);

  const httpLogs = [];
  const http500 = await run(ntfyFixture(
    async () => ({ ok: false, status: 500 }),
    { info() {}, warn: (message) => httpLogs.push(message) },
  ));
  assert.deepEqual(http500, baseline);
  assert.match(httpLogs.join("\n"), /HTTP 500/);
});
