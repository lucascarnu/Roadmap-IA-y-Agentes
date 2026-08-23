import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  createDeliveryEngineV2,
  deliveryKeyV2,
  deliveryLedgerPathV2,
  DeliveryV2Error,
} from "./delivery-engine-v2.mjs";
import { GOVERNING_CONTEXT_V2 } from "./handoff-contract-v2.mjs";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const HEAD = "a".repeat(40);
const REQUEST = "request v2 delivery";
const OUTPUT = "Informe contractual completo";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const REQUEST_HASH = sha256(Buffer.from(REQUEST));
const OUTPUT_HASH = sha256(Buffer.from(OUTPUT));
const HUMAN_REFERENCE = "decisiones/0013-delegar-cierre-operativo-y-merge-rutinario.md#cuando-si-se-escala-al-director";
const CATALOG = JSON.parse(await readFile(join(HERE, "roles.catalog.json"), "utf8"));
const REGISTRY = JSON.parse(await readFile(join(HERE, "actores.json"), "utf8"));
const PRODUCERS = JSON.parse(await readFile(join(HERE, "handoff-v2-producers.json"), "utf8"));
const GIT_SOURCES = {
  "scripts/handoff/handoff-contract-v2.mjs": { git_blob_oid: "1".repeat(40), sha256: "1".repeat(64), bytes: 101 },
  "scripts/handoff/prompt-template.md": { git_blob_oid: "2".repeat(40), sha256: "2".repeat(64), bytes: 202 },
  "reglas.md": { git_blob_oid: "3".repeat(40), sha256: "3".repeat(64), bytes: 303 },
};

function resolvedEntry(kind, identity, content, head = HEAD) {
  const bytes = Buffer.byteLength(content); const hash = sha256(Buffer.from(content));
  const fields = kind === "canonical_reference"
    ? [identity.reference]
    : [identity.tipo, identity.referencia, identity.head_o_historial];
  return { resolution_id: sha256(Buffer.from([kind, ...fields, head, hash, String(bytes)].join("\0"))), ...identity, head_sha: head, sha256: hash, bytes, content };
}

function fixture(overrides = {}) {
  const gitSources = structuredClone(GIT_SOURCES);
  const contract = {
    handoff_version: "2", artifact_id: "ARTIFACT-DELIVERY", tarea: "Entregar posta v2", head_sha: HEAD, profile_id: "manual",
    contexto_autorizado: [...GOVERNING_CONTEXT_V2, ".agentes/arquitecto/AGENTS.override.md", "ARQUITECTO.md", "AGENTS.md"],
    origen: { role_id: "ARQUITECTO_LEAD", surface_id: "codex-arquitecto" },
    destinatario: { role_id: "EJECUTOR_PRINCIPAL", surface_id: "codex-ejecutor", required_capabilities: ["filesystem"] },
    modo: "solo_lectura", salida_requerida: "Informe contractual completo", objeto_entrada: { id: "in", descripcion: "Posta" }, objeto_producido: { id: "out", descripcion: "Informe" },
    mutaciones_permitidas: [], operaciones_permitidas: [], acciones_prohibidas: ["integrar"], rollback: { strategy: "NO_APLICA", reference: "sin efectos" }, postcondiciones: [], disparadores_0015: [], impacto_economico: { tipo: "no_aplica" }, reintentos: { maximos: 0, politica_costo_indeterminado: "DETENER_SIN_REINTENTO" },
    transiciones_permitidas: ["COMPLETADO->ARQUITECTO_LEAD"], estado_canonico: { accion_anterior: { id: "a", descripcion: "Anterior" }, evidencia_cierre: { tipo: "COMMIT", referencia: "x", head_o_historial: HEAD }, proxima_accion: { id: "b", descripcion: "Siguiente" }, head_reconciliacion: HEAD },
    operaciones_delegadas_a_humanos: [{ categoria: "CAMBIO_DE_PRODUCTO_ALCANCE_O_INTENCION", referencia_canonica: HUMAN_REFERENCE, condicion_observable: "Arbitraje material", actor_o_capacidad_requerida: "arbitraje_producto", naturaleza: "DECISION_MATERIAL" }],
  };
  const contractHash = sha256(Buffer.from(JSON.stringify(contract)));
  const producerChain = PRODUCERS.profiles.manual.map((item) => ({ profile_id: "manual", ...item, head_sha: HEAD, ...gitSources[item.path] }));
  const manifest = { artifact_id: contract.artifact_id, head_sha: HEAD, contract_sha256: contractHash, producer: { role_id: "EJECUTOR_PRINCIPAL", surface_id: "codex-ejecutor", adapter: "AGENTS.md", cwd: "." }, request: { sha256: REQUEST_HASH, bytes: Buffer.byteLength(REQUEST), content: REQUEST }, producer_chain: producerChain, sources: [...producerChain.map(({ path, head_sha, git_blob_oid, sha256: hash, bytes }) => ({ kind: "versioned", path, head_sha, git_blob_oid, sha256: hash, bytes })), { kind: "versioned", path: "reglas.md", head_sha: HEAD, ...gitSources["reglas.md"] }] };
  const manifestHash = sha256(Buffer.from(JSON.stringify(manifest)));
  const attempt = { attempt_id: "attempt:ARTIFACT-DELIVERY:001", transport_real_id: "TRANSPORT-REAL-001", artifact_id: contract.artifact_id, request_sha256: REQUEST_HASH, request_bytes: Buffer.byteLength(REQUEST), target: { role_id: "EJECUTOR_PRINCIPAL", surface_id: "codex-ejecutor" }, head_sha: HEAD, manifest_sha256: manifestHash, salida_requerida: contract.salida_requerida };
  const binding = { attempt_id: attempt.attempt_id, transport_real_id: attempt.transport_real_id, artifact_id: attempt.artifact_id, request_sha256: attempt.request_sha256, request_bytes: attempt.request_bytes, manifest_sha256: attempt.manifest_sha256, head_sha: attempt.head_sha, target_role_id: attempt.target.role_id, target_surface_id: attempt.target.surface_id, output_ref: "output.txt", output_sha256: OUTPUT_HASH, output_bytes: Buffer.byteLength(OUTPUT) };
  const result = { handoff_version: "2", binding, estado: "COMPLETADO", decision: "SIN_OBJECIONES", resumen: "Válido", evidencia: [], archivos_leidos: ["reglas.md"], siguiente: null, firma: { ejecutor_real: "Codex", entorno: "fixture", modelo_configurado: "fixture", modelo_efectivo: "NO_OBSERVABLE", esfuerzo_o_modo_configurado: "high", esfuerzo_o_modo_efectivo: "NO_VERIFICADO", sujeto_evaluado: "delivery-v2", via_evaluada: "fixture", fecha: "2026-08-23" } };
  const receipt = { attempt_id: attempt.attempt_id, transport_real_id: attempt.transport_real_id, artifact_id: attempt.artifact_id, request_sha256: attempt.request_sha256, request_bytes: attempt.request_bytes, target_role_id: attempt.target.role_id, target_surface_id: attempt.target.surface_id, manifest_sha256: attempt.manifest_sha256, head_sha: attempt.head_sha, output_ref: binding.output_ref, output_sha256: binding.output_sha256, output_bytes: binding.output_bytes };
  const resolution = { head_sha: HEAD, contract_sha256: contractHash, manifest_sha256: manifestHash, git_sources: gitSources,
    canonical_references: [resolvedEntry("canonical_reference", { reference: HUMAN_REFERENCE }, "Canon humano verificado")],
    closure_evidence: [resolvedEntry("closure_evidence", contract.estado_canonico.evidencia_cierre, "Commit de cierre verificado")],
  };
  return { contract, manifest, attempt, result, output: { ref: binding.output_ref, content: OUTPUT }, git_sources: gitSources, resolution, receipt, ...overrides };
}

function dependencies(deliveryPackage) {
  const references = new Set(deliveryPackage.resolution.canonical_references.map((entry) => entry.reference));
  const evidence = new Set(deliveryPackage.resolution.closure_evidence.map((entry) => [entry.tipo, entry.referencia, entry.head_o_historial].join("\0")));
  return { catalog: CATALOG, registry: REGISTRY, producers: PRODUCERS, head_sha: deliveryPackage.attempt.head_sha, contract_sha256: deliveryPackage.manifest.contract_sha256, manifest_sha256: deliveryPackage.attempt.manifest_sha256, git_sources: deliveryPackage.git_sources, sha256: (value) => sha256(Buffer.from(value)), resolveCanonicalReference: (reference) => references.has(reference), resolveEvidence: (item, head) => head === deliveryPackage.resolution.head_sha && evidence.has([item.tipo, item.referencia, item.head_o_historial].join("\0")) };
}

async function temporaryRoot(t) {
  const root = await mkdtemp(join(tmpdir(), "handoff-v2-delivery-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function engine(root, counters, receipt, options = {}) {
  return createDeliveryEngineV2({ rootDir: root, timeoutMs: 50, invoke: async () => { counters.invocations += 1; }, reconcile: async () => { counters.reconciliations += 1; return receipt; }, ...options });
}

async function phases(root, deliveryPackage) {
  const deliveryDir = deliveryLedgerPathV2(root, deliveryPackage.attempt.attempt_id, deliveryPackage.attempt.transport_real_id);
  const files = (await readdir(deliveryDir)).filter((name) => /^state-/.test(name)).sort();
  return Promise.all(files.map(async (name) => JSON.parse(await readFile(join(deliveryDir, name), "utf8")).phase));
}

async function writeCliInputs(root, data) {
  const paths = { package: join(root, "package.json"), contract: join(root, "contract.json"), manifest: join(root, "manifest.json"), output: join(root, "output.txt"), resolution: join(root, "resolution.json"), receipt: join(root, "receipt.json") };
  await writeFile(paths.package, JSON.stringify({ attempt: data.attempt, result: data.result })); await writeFile(paths.contract, JSON.stringify(data.contract)); await writeFile(paths.manifest, JSON.stringify(data.manifest)); await writeFile(paths.output, data.output.content);
  await writeFile(paths.resolution, JSON.stringify(data.resolution)); await writeFile(paths.receipt, JSON.stringify(data.receipt));
  return ["--package", paths.package, "--contract", paths.contract, "--manifest", paths.manifest, "--output", paths.output, "--resolution", paths.resolution, "--receipt", paths.receipt];
}

test("U2B positivo invoca una vez y completa durablemente con receipt y salida válidos", async (t) => {
  const root = await temporaryRoot(t); const data = fixture(); const counters = { invocations: 0, reconciliations: 0 };
  const state = await engine(root, counters, data.receipt).start(data, dependencies(data));
  assert.equal(state.phase, "HANDOFF_COMPLETE"); assert.equal(state.invocation_intent_count, 1); assert.equal(state.invocation_returned_count, 1); assert.equal(state.reconciliation_count, 1); assert.deepEqual(counters, { invocations: 1, reconciliations: 1 });
  assert.deepEqual(await phases(root, data), ["PREPARADA", "EMISION_CLAIMED", "EMISION_CLAIMED", "RECONCILIANDO", "RECONCILIANDO", "ENTREGA_CONFIRMADA", "HANDOFF_COMPLETE"]);
  assert.equal(deliveryKeyV2(data.attempt.attempt_id, data.attempt.transport_real_id).length, 64);
});

test("U2B final local o ENVIADO_A sin invocación real no crea confirmación", async (t) => {
  const root = await temporaryRoot(t); const data = fixture();
  const path = deliveryLedgerPathV2(root, data.attempt.attempt_id, data.attempt.transport_real_id);
  await assert.rejects(access(path), { code: "ENOENT" });
  assert.equal("ENVIADO_A: ARQUITECTO_LEAD".includes(data.attempt.transport_real_id), false);
});

test("U2B rechaza cada mismatch de receipt y nunca reemite", async (t) => {
  const root = await temporaryRoot(t); const base = fixture();
  const cases = {
    attempt_id: "otro", transport_real_id: "otro", artifact_id: "otro", request_sha256: "9".repeat(64), request_bytes: 999, target_role_id: "ARQUITECTO_LEAD", target_surface_id: "codex-arquitecto",
    manifest_sha256: "d".repeat(64), head_sha: "e".repeat(40), output_ref: "otro.txt", output_sha256: "f".repeat(64), output_bytes: 999,
  };
  for (const [field, value] of Object.entries(cases)) {
    const data = fixture({ attempt: { ...base.attempt, attempt_id: `${base.attempt.attempt_id}:${field}` } });
    data.result = structuredClone(base.result); data.result.binding.attempt_id = data.attempt.attempt_id;
    data.receipt = { ...base.receipt, attempt_id: data.attempt.attempt_id, [field]: value };
    const counters = { invocations: 0, reconciliations: 0 };
    const state = await engine(join(root, field), counters, data.receipt).start(data, dependencies(data));
    assert.equal(state.phase, "ENTREGA_NO_CONFIRMADA", field); assert.equal(state.cause, "RECEIPT_INVALIDO", field); assert.equal(counters.invocations, 1, field);
  }
});

test("U2B receipt sin salida y timeout terminan sin confirmación y sin segunda invocación", async (t) => {
  const root = await temporaryRoot(t);
  for (const [name, receipt, cause] of [["sin-salida", { ...fixture().receipt, output_ref: "" }, "RECEIPT_INVALIDO"], ["timeout", null, "TIMEOUT"]]) {
    const data = fixture({ attempt: { ...fixture().attempt, attempt_id: `attempt:${name}` } }); data.result = structuredClone(fixture().result); data.result.binding.attempt_id = data.attempt.attempt_id; if (receipt) receipt.attempt_id = data.attempt.attempt_id;
    const counters = { invocations: 0, reconciliations: 0 }; const state = await engine(join(root, name), counters, receipt).start(data, dependencies(data));
    assert.equal(state.phase, "ENTREGA_NO_CONFIRMADA"); assert.equal(state.cause, cause); assert.deepEqual(counters, { invocations: 1, reconciliations: 1 });
    const resumed = await engine(join(root, name), counters, receipt).resume(data, dependencies(data)); assert.equal(resumed.phase, "ENTREGA_NO_CONFIRMADA"); assert.equal(counters.invocations, 1);
  }
});

test("U2B crash y reinicio son conservadores por fase y no repiten efecto o reconciliación", async (t) => {
  const root = await temporaryRoot(t);
  for (const point of ["after_prepare", "after_claim", "before_invoke", "after_invoke", "after_reconciliation_claim", "after_delivery_confirmed"]) {
    const data = fixture({ attempt: { ...fixture().attempt, attempt_id: `attempt:${point}` } }); data.result = structuredClone(fixture().result); data.result.binding.attempt_id = data.attempt.attempt_id; data.receipt = { ...fixture().receipt, attempt_id: data.attempt.attempt_id };
    const counters = { invocations: 0, reconciliations: 0 };
    const receiptAfterCrash = ["after_claim", "before_invoke", "after_reconciliation_claim"].includes(point) ? null : data.receipt;
    const crashing = engine(join(root, point), counters, receiptAfterCrash, { fault: async (observed) => { if (observed === point) throw new DeliveryV2Error("SIMULATED_CRASH", point); } });
    await assert.rejects(crashing.start(data, dependencies(data)), (error) => error.code === "SIMULATED_CRASH");
    const resumed = await engine(join(root, point), counters, receiptAfterCrash).resume(data, dependencies(data));
    if (["after_claim", "before_invoke", "after_reconciliation_claim"].includes(point)) { assert.equal(resumed.phase, "ENTREGA_NO_CONFIRMADA"); assert.equal(resumed.cause, "TIMEOUT"); }
    else assert.equal(resumed.phase, "HANDOFF_COMPLETE", point);
    assert.ok(counters.invocations <= 1, point); assert.ok(counters.reconciliations <= 1, point);
  }
});

test("U2B receipt tardío queda append-only como AMBIGUEDAD_POSTERIOR sin reapertura", async (t) => {
  const root = await temporaryRoot(t); const data = fixture(); const counters = { invocations: 0, reconciliations: 0 };
  const timedOut = await engine(root, counters, null).start(data, dependencies(data)); assert.equal(timedOut.phase, "ENTREGA_NO_CONFIRMADA");
  const late = await engine(root, counters, null).recordLateReceipt(data, dependencies(data), data.receipt); assert.equal(late.classification, "AMBIGUEDAD_POSTERIOR"); assert.equal(late.state.phase, "ENTREGA_NO_CONFIRMADA");
  await assert.rejects(engine(root, counters, null).recordLateReceipt(data, dependencies(data), data.receipt), (error) => error.code === "RECEIPT_TARDIO_DUPLICADO");
  const finalState = await engine(root, counters, null).resume(data, dependencies(data)); assert.equal(finalState.phase, "ENTREGA_NO_CONFIRMADA"); assert.equal(counters.invocations, 1);
});

test("U2B receipt tardío exige el mismo binding durable del ledger", async (t) => {
  const root = await temporaryRoot(t); const data = fixture(); const counters = { invocations: 0, reconciliations: 0 }; await engine(root, counters, null).start(data, dependencies(data));
  const alternate = structuredClone(data); const otherHead = "d".repeat(40); alternate.contract.head_sha = otherHead; alternate.contract.estado_canonico.head_reconciliacion = otherHead; alternate.contract.estado_canonico.evidencia_cierre.head_o_historial = otherHead;
  alternate.manifest.head_sha = otherHead; alternate.manifest.contract_sha256 = sha256(Buffer.from(JSON.stringify(alternate.contract))); for (const entry of alternate.manifest.producer_chain) entry.head_sha = otherHead; for (const source of alternate.manifest.sources) if (source.kind === "versioned") source.head_sha = otherHead;
  const alternateManifestHash = sha256(Buffer.from(JSON.stringify(alternate.manifest))); alternate.attempt.head_sha = otherHead; alternate.attempt.manifest_sha256 = alternateManifestHash; alternate.result.binding.head_sha = otherHead; alternate.result.binding.manifest_sha256 = alternateManifestHash; alternate.receipt.head_sha = otherHead; alternate.receipt.manifest_sha256 = alternateManifestHash;
  alternate.resolution = { ...alternate.resolution, head_sha: otherHead, contract_sha256: alternate.manifest.contract_sha256, manifest_sha256: alternateManifestHash,
    canonical_references: [resolvedEntry("canonical_reference", { reference: HUMAN_REFERENCE }, "Canon humano verificado", otherHead)],
    closure_evidence: [resolvedEntry("closure_evidence", alternate.contract.estado_canonico.evidencia_cierre, "Commit de cierre verificado", otherHead)],
  };
  await assert.rejects(engine(root, counters, null).recordLateReceipt(alternate, dependencies(alternate), alternate.receipt), (error) => error.code === "DELIVERY_BINDING_NO_COINCIDE");
});

test("U2B resume y late-receipt rechazan sustitución durable de ref/hash/bytes de salida", async (t) => {
  const root = await temporaryRoot(t);
  for (const variant of ["ref", "hash", "bytes"]) {
    const data = fixture({ attempt: { ...fixture().attempt, attempt_id: `attempt:output-${variant}` } }); data.result = structuredClone(fixture().result); data.result.binding.attempt_id = data.attempt.attempt_id; data.receipt = { ...fixture().receipt, attempt_id: data.attempt.attempt_id }; const counters = { invocations: 0, reconciliations: 0 }; const variantRoot = join(root, variant); await engine(variantRoot, counters, null).start(data, dependencies(data));
    const alternate = structuredClone(data);
    if (variant === "ref") { alternate.output.ref = "alternate.txt"; alternate.result.binding.output_ref = "alternate.txt"; alternate.receipt.output_ref = "alternate.txt"; }
    else { alternate.output.content = variant === "hash" ? [...OUTPUT].reverse().join("") : `${OUTPUT}+`; const bytes = Buffer.from(alternate.output.content); alternate.result.binding.output_sha256 = sha256(bytes); alternate.result.binding.output_bytes = bytes.byteLength; alternate.receipt.output_sha256 = sha256(bytes); alternate.receipt.output_bytes = bytes.byteLength; }
    await assert.rejects(engine(variantRoot, counters, null).resume(alternate, dependencies(alternate)), (error) => error.code === "DELIVERY_BINDING_NO_COINCIDE", variant);
    await assert.rejects(engine(variantRoot, counters, null).recordLateReceipt(alternate, dependencies(alternate), alternate.receipt), (error) => error.code === "DELIVERY_BINDING_NO_COINCIDE", variant);
    assert.deepEqual(counters, { invocations: 1, reconciliations: 1 });
  }
});

test("U2B dos procesos compiten por un único ledger y sólo uno invoca", async (t) => {
  const root = await temporaryRoot(t); const data = fixture(); const inputArgs = await writeCliInputs(root, data);
  const cli = join(HERE, "delivery-v2-cli.mjs"); const ledgerRoot = join(root, "ledger"); const argv = [cli, "start", ...inputArgs, "--root", ledgerRoot, "--timeout-ms", "100"];
  const outcomes = await Promise.allSettled([execFileAsync(process.execPath, argv), execFileAsync(process.execPath, argv)]);
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
  const rejected = outcomes.find((item) => item.status === "rejected"); assert.match(`${rejected.reason.stderr}`, /DELIVERY_REUTILIZADA/);
  const deliveryDir = deliveryLedgerPathV2(ledgerRoot, data.attempt.attempt_id, data.attempt.transport_real_id);
  assert.equal((await readdir(deliveryDir)).filter((name) => name === "outbound.json").length, 1);
});

test("U2B CLI compara bytes exactos con resolución externa antes de crear ledger", async (t) => {
  const root = await temporaryRoot(t); const data = fixture(); const inputArgs = await writeCliInputs(root, data); const manifestIndex = inputArgs.indexOf("--manifest") + 1; await writeFile(inputArgs[manifestIndex], `${JSON.stringify(data.manifest)} `);
  const ledgerRoot = join(root, "ledger"); const argv = [join(HERE, "delivery-v2-cli.mjs"), "start", ...inputArgs, "--root", ledgerRoot, "--timeout-ms", "100"];
  await assert.rejects(execFileAsync(process.execPath, argv), (error) => /RESOLUCION_NO_COINCIDE/.test(`${error.stderr}`)); await assert.rejects(access(ledgerRoot), { code: "ENOENT" });
});

test("U2B CLI resuelve referencia canónica y evidencia de cierre sólo desde evidencia externa exacta", async (t) => {
  const root = await temporaryRoot(t); const cli = join(HERE, "delivery-v2-cli.mjs");
  const positive = fixture(); const positiveDir = join(root, "positive"); await mkdir(positiveDir);
  const positiveArgs = await writeCliInputs(positiveDir, positive);
  const completed = await execFileAsync(process.execPath, [cli, "start", ...positiveArgs, "--root", join(positiveDir, "ledger"), "--timeout-ms", "100"]);
  assert.equal(JSON.parse(completed.stdout).phase, "HANDOFF_COMPLETE");

  const cases = {
    "referencia-ausente": (resolution) => { resolution.canonical_references = []; },
    "referencia-distinta": (resolution) => { resolution.canonical_references = [resolvedEntry("canonical_reference", { reference: `${HUMAN_REFERENCE}-otra` }, "Canon humano verificado")]; },
    "referencia-extra": (resolution) => { resolution.canonical_references.push(resolvedEntry("canonical_reference", { reference: "decisiones/extra.md#extra" }, "Canon extra")); },
    "referencia-duplicada": (resolution) => { resolution.canonical_references.push(structuredClone(resolution.canonical_references[0])); },
    "evidencia-ausente": (resolution) => { resolution.closure_evidence = []; },
    "evidencia-referencia-distinta": (resolution) => { resolution.closure_evidence = [resolvedEntry("closure_evidence", { tipo: "COMMIT", referencia: "otro", head_o_historial: HEAD }, "Commit de cierre verificado")]; },
    "evidencia-head-historial-distinto": (resolution) => { resolution.closure_evidence = [resolvedEntry("closure_evidence", { tipo: "COMMIT", referencia: "x", head_o_historial: "b".repeat(40) }, "Commit de cierre verificado")]; },
    "bytes-discrepantes": (resolution) => { resolution.canonical_references[0].bytes += 1; },
    "head-discrepante": (resolution) => { resolution.canonical_references = [resolvedEntry("canonical_reference", { reference: HUMAN_REFERENCE }, "Canon humano verificado", "b".repeat(40))]; },
    "identificador-discrepante": (resolution) => { resolution.closure_evidence[0].resolution_id = "f".repeat(64); },
    "git-source-extra": (resolution) => { resolution.git_sources["extra.md"] = { git_blob_oid: "4".repeat(40), sha256: "4".repeat(64), bytes: 404 }; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const caseDir = join(root, name); await mkdir(caseDir); const data = fixture(); mutate(data.resolution);
    const argv = await writeCliInputs(caseDir, data); const ledgerRoot = join(caseDir, "ledger");
    await assert.rejects(execFileAsync(process.execPath, [cli, "start", ...argv, "--root", ledgerRoot, "--timeout-ms", "100"]), (error) => /RESOLUCION|REFERENCIAS_EXTERNAS|EVIDENCIA_EXTERNA/.test(`${error.stderr}`), name);
    await assert.rejects(access(ledgerRoot), { code: "ENOENT" });
  }
});

test("U2B dos resume cross-process serializan la reconciliación efectiva a uno", async (t) => {
  const root = await temporaryRoot(t); const data = fixture(); const ledgerRoot = join(root, "ledger"); const counters = { invocations: 0, reconciliations: 0 };
  const crashing = engine(ledgerRoot, counters, data.receipt, { fault: async (point) => { if (point === "after_invoke") throw new DeliveryV2Error("SIMULATED_CRASH", point); } });
  await assert.rejects(crashing.start(data, dependencies(data)), (error) => error.code === "SIMULATED_CRASH"); assert.equal(counters.invocations, 1); assert.equal(counters.reconciliations, 0);
  const inputArgs = await writeCliInputs(root, data);
  const argv = [join(HERE, "delivery-v2-cli.mjs"), "resume", ...inputArgs, "--root", ledgerRoot, "--timeout-ms", "100"];
  const outcomes = await Promise.allSettled([execFileAsync(process.execPath, argv), execFileAsync(process.execPath, argv)]);
  assert.ok(outcomes.some((item) => item.status === "fulfilled"), outcomes.map((item) => item.status === "fulfilled" ? item.value.stdout : item.reason.stderr).join("\n"));
  const deliveryDir = deliveryLedgerPathV2(ledgerRoot, data.attempt.attempt_id, data.attempt.transport_real_id);
  const names = (await readdir(deliveryDir)).filter((name) => /^state-/.test(name)).sort(); const state = JSON.parse(await readFile(join(deliveryDir, names.at(-1)), "utf8"));
  assert.equal(state.phase, "HANDOFF_COMPLETE"); assert.equal(state.reconciliation_count, 1); assert.equal(state.invocation_returned_count, 1);
});

test("U2B ledger corrupto o parcial falla cerrado antes de cualquier efecto", async (t) => {
  const root = await temporaryRoot(t); const data = fixture(); const counters = { invocations: 0, reconciliations: 0 };
  const crashing = engine(root, counters, data.receipt, { fault: async (point) => { if (point === "after_prepare") throw new DeliveryV2Error("SIMULATED_CRASH", point); } });
  await assert.rejects(crashing.start(data, dependencies(data)), (error) => error.code === "SIMULATED_CRASH");
  const deliveryDir = deliveryLedgerPathV2(root, data.attempt.attempt_id, data.attempt.transport_real_id); await writeFile(join(deliveryDir, "state-999999.json"), "{ parcial");
  await assert.rejects(engine(root, counters, data.receipt).resume(data, dependencies(data)), (error) => error.code === "LEDGER_CORRUPTO"); assert.deepEqual(counters, { invocations: 0, reconciliations: 0 });
});

test("U2B valida toda la cadena, continuidad e invariantes semánticas por fase", async (t) => {
  const root = await temporaryRoot(t); const data = fixture(); const counters = { invocations: 0, reconciliations: 0 };
  await engine(root, counters, data.receipt).start(data, dependencies(data));
  const deliveryDir = deliveryLedgerPathV2(root, data.attempt.attempt_id, data.attempt.transport_real_id); const earlierPath = join(deliveryDir, "state-000002.json"); const earlier = JSON.parse(await readFile(earlierPath, "utf8")); earlier.invocation_returned_count = 1; await writeFile(earlierPath, JSON.stringify(earlier));
  await assert.rejects(engine(root, counters, data.receipt).resume(data, dependencies(data)), (error) => error.code === "LEDGER_CORRUPTO"); assert.deepEqual(counters, { invocations: 1, reconciliations: 1 });

  const other = fixture({ attempt: { ...fixture().attempt, attempt_id: "attempt:semantic-phase" } }); other.result = structuredClone(fixture().result); other.result.binding.attempt_id = other.attempt.attempt_id; other.receipt = { ...fixture().receipt, attempt_id: other.attempt.attempt_id }; const otherRoot = join(root, "other"); const otherCounters = { invocations: 0, reconciliations: 0 };
  const crashing = engine(otherRoot, otherCounters, other.receipt, { fault: async (point) => { if (point === "after_prepare") throw new DeliveryV2Error("SIMULATED_CRASH", point); } }); await assert.rejects(crashing.start(other, dependencies(other)), (error) => error.code === "SIMULATED_CRASH");
  const otherDir = deliveryLedgerPathV2(otherRoot, other.attempt.attempt_id, other.attempt.transport_real_id); const preparedPath = join(otherDir, "state-000001.json"); const prepared = JSON.parse(await readFile(preparedPath, "utf8")); prepared.invocation_intent_count = 1; prepared.invocation_returned_count = 1; await writeFile(preparedPath, JSON.stringify(prepared));
  await assert.rejects(engine(otherRoot, otherCounters, other.receipt).resume(other, dependencies(other)), (error) => error.code === "LEDGER_CORRUPTO"); assert.deepEqual(otherCounters, { invocations: 0, reconciliations: 0 });

  const gap = fixture({ attempt: { ...fixture().attempt, attempt_id: "attempt:sequence-gap" } }); gap.result = structuredClone(fixture().result); gap.result.binding.attempt_id = gap.attempt.attempt_id; gap.receipt = { ...fixture().receipt, attempt_id: gap.attempt.attempt_id }; const gapRoot = join(root, "gap"); const gapCounters = { invocations: 0, reconciliations: 0 }; const gapCrash = engine(gapRoot, gapCounters, gap.receipt, { fault: async (point) => { if (point === "after_prepare") throw new DeliveryV2Error("SIMULATED_CRASH", point); } }); await assert.rejects(gapCrash.start(gap, dependencies(gap)), (error) => error.code === "SIMULATED_CRASH");
  const gapDir = deliveryLedgerPathV2(gapRoot, gap.attempt.attempt_id, gap.attempt.transport_real_id); const gapState = JSON.parse(await readFile(join(gapDir, "state-000001.json"), "utf8")); gapState.sequence = 3; gapState.phase = "EMISION_CLAIMED"; await writeFile(join(gapDir, "state-000003.json"), JSON.stringify(gapState)); await assert.rejects(engine(gapRoot, gapCounters, gap.receipt).resume(gap, dependencies(gap)), (error) => error.code === "LEDGER_CORRUPTO"); assert.deepEqual(gapCounters, { invocations: 0, reconciliations: 0 });
});

test("U2B recupera un lock de transición huérfano sin borrar su evidencia", async (t) => {
  const root = await temporaryRoot(t); const data = fixture(); const counters = { invocations: 0, reconciliations: 0 };
  const crashing = engine(root, counters, data.receipt, { fault: async (point) => { if (point === "after_invoke") throw new DeliveryV2Error("SIMULATED_CRASH", point); } });
  await assert.rejects(crashing.start(data, dependencies(data)), (error) => error.code === "SIMULATED_CRASH");
  const deliveryDir = deliveryLedgerPathV2(root, data.attempt.attempt_id, data.attempt.transport_real_id); const lock = join(deliveryDir, "transition.lock"); await mkdir(lock); await writeFile(join(lock, "owner.json"), JSON.stringify({ pid: 999999, acquired_at: "fixture" }));
  const resumed = await engine(root, counters, data.receipt).resume(data, dependencies(data)); assert.equal(resumed.phase, "HANDOFF_COMPLETE");
  assert.equal((await readdir(deliveryDir)).some((name) => name.startsWith("transition.lock.stale-999999-")), true); assert.equal(counters.invocations, 1);
});

test("U2B schemas y grafo mantienen v1 desconectado y API pública mínima", async () => {
  for (const file of ["handoff-attempt-v2.schema.json", "handoff-result-v2.schema.json", "handoff-delivery-v2.schema.json", "handoff-resolution-v2.schema.json"]) {
    const raw = await readFile(join(HERE, file), "utf8");
    assert.doesNotThrow(() => JSON.parse(raw), file);
  }
  const deliverySchema = JSON.parse(await readFile(join(HERE, "handoff-delivery-v2.schema.json"), "utf8"));
  const resolutionSchema = JSON.parse(await readFile(join(HERE, "handoff-resolution-v2.schema.json"), "utf8"));
  assert.deepEqual(new Set(deliverySchema.required), new Set(["delivery_version", "delivery_key", "sequence", "phase", "binding", "invocation_intent_count", "invocation_returned_count", "reconciliation_count", "cause", "updated_at"]));
  assert.deepEqual(new Set(resolutionSchema.required), new Set(["head_sha", "contract_sha256", "manifest_sha256", "git_sources", "canonical_references", "closure_evidence"]));
  assert.deepEqual(new Set(deliverySchema.properties.binding.required), new Set(["attempt_id", "transport_real_id", "target_role_id", "target_surface_id", "manifest_sha256", "head_sha", "output_ref", "output_sha256", "output_bytes"]));
  const engineSource = await readFile(join(HERE, "delivery-engine-v2.mjs"), "utf8"); const cliSource = await readFile(join(HERE, "delivery-v2-cli.mjs"), "utf8"); const v1Source = await readFile(join(HERE, "handoff.mjs"), "utf8");
  assert.match(cliSource, /delivery-engine-v2/); assert.match(engineSource, /handoff-contract-v2/); assert.doesNotMatch(v1Source, /delivery-engine-v2|delivery-v2-cli|deliveries/);
  assert.doesNotMatch(cliSource, /path\.length\s*>\s*0|head_o_historial\s*===\s*head|resolveCanonicalReference:\s*\(?.*\)?\s*=>\s*true|resolveEvidence:\s*\(?.*\)?\s*=>\s*true/);
  for (const name of ["poll", "tick", "processIssue", "invokeAgent"]) assert.doesNotMatch(v1Source, new RegExp(`${name}[\\s\\S]{0,300}delivery`, "i"));
  const moduleNames = (await readdir(HERE)).filter((name) => name.endsWith(".mjs")); const importers = [];
  for (const name of moduleNames) if ((await readFile(join(HERE, name), "utf8")).includes('from "./delivery-engine-v2.mjs"')) importers.push(name);
  assert.deepEqual(importers.sort(), ["delivery-v2-cli.mjs", "delivery-v2.test.mjs"]); assert.doesNotMatch(cliSource, /state-\d|HANDOFF_COMPLETE|ENTREGA_NO_CONFIRMADA/);
  const api = await import("./delivery-engine-v2.mjs"); assert.deepEqual(Object.keys(api).sort(), ["DELIVERY_PHASES_V2", "DeliveryV2Error", "createDeliveryEngineV2", "deliveryKeyV2", "deliveryLedgerPathV2"].sort());
});
