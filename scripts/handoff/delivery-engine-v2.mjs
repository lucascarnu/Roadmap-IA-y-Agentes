import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  HandoffContractV2Error,
  validateDeliveryReceiptV2,
  validateResultV2,
} from "./handoff-contract-v2.mjs";

const DELIVERY_SCHEMA_V2 = JSON.parse(await readFile(new URL("./handoff-delivery-v2.schema.json", import.meta.url), "utf8"));
export const DELIVERY_PHASES_V2 = Object.freeze([...DELIVERY_SCHEMA_V2.properties.phase.enum]);

const TERMINAL_PHASES = new Set(["HANDOFF_COMPLETE", "ENTREGA_NO_CONFIRMADA"]);
const LEDGER_KEYS = Object.freeze([...DELIVERY_SCHEMA_V2.required]);
const BINDING_KEYS = Object.freeze([...DELIVERY_SCHEMA_V2.properties.binding.required]);
const CAUSES = new Set(DELIVERY_SCHEMA_V2.properties.cause.oneOf[1].enum);

export class DeliveryV2Error extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "DeliveryV2Error";
    this.code = code;
  }
}

function fail(code, message, cause) {
  throw new DeliveryV2Error(code, message, cause);
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function outputBytesOf(deliveryPackage) {
  if (typeof deliveryPackage?.output?.content !== "string" || typeof deliveryPackage.output.ref !== "string" || !deliveryPackage.output.ref.trim()) {
    fail("SALIDA_CONTRACTUAL_INVALIDA", "output.ref/content son obligatorios");
  }
  return Buffer.from(deliveryPackage.output.content, "utf8");
}

function bindingFromPackage(deliveryPackage) {
  const { attempt, result } = deliveryPackage;
  return {
    attempt_id: attempt.attempt_id,
    transport_real_id: attempt.transport_real_id,
    target_role_id: attempt.target.role_id,
    target_surface_id: attempt.target.surface_id,
    manifest_sha256: attempt.manifest_sha256,
    head_sha: attempt.head_sha,
    output_ref: result.binding.output_ref,
    output_sha256: result.binding.output_sha256,
    output_bytes: result.binding.output_bytes,
  };
}

function sameBinding(left, right) {
  return BINDING_KEYS.every((key) => left[key] === right[key]);
}

function validateLedgerState(state, expectedKey) {
  if (!state || typeof state !== "object" || Array.isArray(state) || Object.keys(state).sort().join("|") !== [...LEDGER_KEYS].sort().join("|")) fail("LEDGER_CORRUPTO", "Shape de ledger no admitida");
  if (state.delivery_version !== "2" || !/^[0-9a-f]{64}$/.test(state.delivery_key) || (expectedKey && state.delivery_key !== expectedKey) || !Number.isInteger(state.sequence) || state.sequence < 1 || !DELIVERY_PHASES_V2.includes(state.phase) || typeof state.updated_at !== "string" || !state.updated_at) fail("LEDGER_CORRUPTO", "Metadatos de ledger inválidos");
  if (!state.binding || typeof state.binding !== "object" || Array.isArray(state.binding) || Object.keys(state.binding).sort().join("|") !== [...BINDING_KEYS].sort().join("|")) fail("LEDGER_CORRUPTO", "Binding de ledger inválido");
  for (const key of ["attempt_id", "transport_real_id", "target_role_id", "target_surface_id", "output_ref"]) if (typeof state.binding[key] !== "string" || !state.binding[key]) fail("LEDGER_CORRUPTO", `binding.${key}`);
  if (!/^[0-9a-f]{64}$/.test(state.binding.manifest_sha256) || !/^[0-9a-f]{40}$/.test(state.binding.head_sha) || !/^[0-9a-f]{64}$/.test(state.binding.output_sha256) || !Number.isInteger(state.binding.output_bytes) || state.binding.output_bytes < 1 || deliveryKeyV2(state.binding.attempt_id, state.binding.transport_real_id) !== state.delivery_key) fail("LEDGER_CORRUPTO", "Hashes/binding de ledger inválidos");
  for (const counter of ["invocation_intent_count", "invocation_returned_count", "reconciliation_count"]) if (![0, 1].includes(state[counter])) fail("LEDGER_CORRUPTO", counter);
  if (state.invocation_returned_count > state.invocation_intent_count || (state.phase === "ENTREGA_NO_CONFIRMADA" ? !CAUSES.has(state.cause) : state.cause !== null)) fail("LEDGER_CORRUPTO", "Contadores o causa incompatibles");
  const tuple = [state.invocation_intent_count, state.invocation_returned_count, state.reconciliation_count].join("");
  if (state.phase === "PREPARADA" && tuple !== "000") fail("LEDGER_CORRUPTO", "PREPARADA con efectos");
  if (state.phase === "EMISION_CLAIMED" && !["000", "100"].includes(tuple)) fail("LEDGER_CORRUPTO", "EMISION_CLAIMED incompatible");
  if (state.phase === "RECONCILIANDO" && !["110", "001", "101", "111"].includes(tuple)) fail("LEDGER_CORRUPTO", "RECONCILIANDO incompatible");
  if (["ENTREGA_CONFIRMADA", "HANDOFF_COMPLETE"].includes(state.phase) && !["101", "111"].includes(tuple)) fail("LEDGER_CORRUPTO", "Confirmación sin intención/reconciliación");
  if (state.phase === "ENTREGA_NO_CONFIRMADA") {
    if (state.cause === "INVOCACION_FALLIDA" && tuple !== "100") fail("LEDGER_CORRUPTO", "Fallo de invocación incompatible");
    if (["TIMEOUT", "INVOCACION_NO_OBSERVADA", "RECEIPT_INVALIDO"].includes(state.cause) && state.reconciliation_count !== 1) fail("LEDGER_CORRUPTO", "Fallo de reconciliación incompatible");
  }
  return state;
}

function validateTransition(previous, current) {
  const allowed = {
    PREPARADA: new Set(["EMISION_CLAIMED"]),
    EMISION_CLAIMED: new Set(["EMISION_CLAIMED", "RECONCILIANDO", "ENTREGA_NO_CONFIRMADA"]),
    RECONCILIANDO: new Set(["RECONCILIANDO", "ENTREGA_CONFIRMADA", "ENTREGA_NO_CONFIRMADA"]),
    ENTREGA_CONFIRMADA: new Set(["HANDOFF_COMPLETE"]),
    HANDOFF_COMPLETE: new Set(),
    ENTREGA_NO_CONFIRMADA: new Set(),
  };
  if (!allowed[previous.phase]?.has(current.phase) || current.sequence !== previous.sequence + 1 || current.delivery_key !== previous.delivery_key || !sameBinding(current.binding, previous.binding)) fail("LEDGER_CORRUPTO", `Transición ${previous.phase}->${current.phase}`);
  for (const counter of ["invocation_intent_count", "invocation_returned_count", "reconciliation_count"]) if (current[counter] < previous[counter]) fail("LEDGER_CORRUPTO", `Contador decreciente: ${counter}`);
}

export function deliveryKeyV2(attemptId, transportRealId) {
  if (typeof attemptId !== "string" || !attemptId.trim() || typeof transportRealId !== "string" || !transportRealId.trim()) {
    fail("DELIVERY_BINDING_INVALIDO", "attempt_id y transport_real_id son obligatorios");
  }
  return sha256Bytes(Buffer.from(JSON.stringify([attemptId, transportRealId]), "utf8"));
}

export function deliveryLedgerPathV2(rootDir, attemptId, transportRealId) {
  return join(resolve(rootDir), deliveryKeyV2(attemptId, transportRealId));
}

async function latestState(deliveryDir) {
  const names = (await readdir(deliveryDir)).filter((name) => /^state-\d{6}\.json$/.test(name)).sort();
  if (!names.length) fail("LEDGER_INCOMPLETO", `No hay estado durable en ${deliveryDir}`);
  try {
    const expectedKey = deliveryDir.split(/[\\/]/).at(-1); let previous;
    for (let index = 0; index < names.length; index += 1) {
      const expectedName = `state-${String(index + 1).padStart(6, "0")}.json`;
      if (names[index] !== expectedName) fail("LEDGER_CORRUPTO", `Secuencia de archivos discontinua: ${names[index]}`);
      const current = validateLedgerState(JSON.parse(await readFile(join(deliveryDir, names[index]), "utf8")), expectedKey);
      if (current.sequence !== index + 1) fail("LEDGER_CORRUPTO", `sequence no coincide con ${names[index]}`);
      if (previous) validateTransition(previous, current);
      previous = current;
    }
    return previous;
  } catch (error) {
    if (error instanceof DeliveryV2Error) throw error;
    fail("LEDGER_CORRUPTO", "El último estado no es JSON válido", error);
  }
}

async function appendState(deliveryDir, prior, update, now) {
  if (prior) {
    validateLedgerState(prior, prior.delivery_key);
    const current = await latestState(deliveryDir);
    if (current.sequence !== prior.sequence) fail("LEDGER_CAS_FALLIDO", `Esperado ${prior.sequence}, actual ${current.sequence}`);
  }
  const sequence = (prior?.sequence ?? 0) + 1;
  const state = {
    delivery_version: "2",
    delivery_key: update.delivery_key ?? prior.delivery_key,
    sequence,
    phase: update.phase,
    binding: prior?.binding ?? update.binding,
    invocation_intent_count: update.invocation_intent_count ?? prior?.invocation_intent_count ?? 0,
    invocation_returned_count: update.invocation_returned_count ?? prior?.invocation_returned_count ?? 0,
    reconciliation_count: update.reconciliation_count ?? prior?.reconciliation_count ?? 0,
    cause: update.cause ?? null,
    updated_at: now(),
  };
  validateLedgerState(state, state.delivery_key);
  const target = join(deliveryDir, `state-${String(sequence).padStart(6, "0")}.json`);
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, target);
  return state;
}

async function withTransitionLock(deliveryDir, action) {
  const lock = join(deliveryDir, "transition.lock");
  const ownerPath = join(lock, "owner.json");
  try {
    await mkdir(lock);
  } catch (error) {
    if (error?.code === "EEXIST") {
      let owner;
      try { owner = JSON.parse(await readFile(ownerPath, "utf8")); } catch { fail("TRANSICION_EN_CURSO", "Lock sin propietario verificable", error); }
      let alive = true;
      try { process.kill(owner.pid, 0); } catch (probeError) { alive = probeError?.code === "EPERM"; }
      if (alive) fail("TRANSICION_EN_CURSO", `Otra transición conserva el lock (pid ${owner.pid})`, error);
      const stale = `${lock}.stale-${owner.pid}-${randomUUID()}`;
      try { await rename(lock, stale); await mkdir(lock); } catch (recoveryError) { fail("TRANSICION_EN_CURSO", "Otro proceso resolvió el lock huérfano", recoveryError); }
    } else throw error;
  }
  await writeFile(ownerPath, `${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`, { encoding: "utf8", flag: "wx" });
  try {
    return await action();
  } finally {
    await unlink(ownerPath).catch(() => {});
    await rmdir(lock).catch(() => {});
  }
}

function validatePackage(deliveryPackage, dependencies) {
  const outputBytes = outputBytesOf(deliveryPackage);
  try {
    validateResultV2(deliveryPackage.result, deliveryPackage.contract, dependencies, deliveryPackage.attempt, deliveryPackage.manifest);
  } catch (error) {
    if (error instanceof HandoffContractV2Error) fail("SALIDA_CONTRACTUAL_INVALIDA", `${error.code}: ${error.message}`, error);
    throw error;
  }
  const expectedHash = sha256Bytes(outputBytes);
  const binding = deliveryPackage.result.binding;
  if (binding.output_ref !== deliveryPackage.output.ref || binding.output_sha256 !== expectedHash || binding.output_bytes !== outputBytes.byteLength) {
    fail("SALIDA_CONTRACTUAL_INVALIDA", "El binding del resultado no coincide con los bytes de salida");
  }
  return outputBytes;
}

export function createDeliveryEngineV2(options = {}) {
  const rootDir = resolve(options.rootDir ?? join(process.cwd(), "scripts", "handoff", ".handoff", "v2", "deliveries"));
  const now = options.now ?? (() => new Date().toISOString());
  const invoke = options.invoke;
  const reconcile = options.reconcile;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const fault = options.fault ?? (() => {});
  if (typeof invoke !== "function" || typeof reconcile !== "function" || !Number.isFinite(timeoutMs) || timeoutMs < 1) fail("ENGINE_INVALIDO", "invoke, reconcile y timeout finito son obligatorios");

  async function prepare(deliveryPackage) {
    const { attempt } = deliveryPackage;
    const deliveryKey = deliveryKeyV2(attempt.attempt_id, attempt.transport_real_id);
    const deliveryDir = deliveryLedgerPathV2(rootDir, attempt.attempt_id, attempt.transport_real_id);
    await mkdir(rootDir, { recursive: true });
    try {
      await mkdir(deliveryDir);
    } catch (error) {
      if (error?.code === "EEXIST") fail("DELIVERY_REUTILIZADA", "La combinación attempt_id + transport_real_id ya existe", error);
      throw error;
    }
    const state = await appendState(deliveryDir, null, { delivery_key: deliveryKey, phase: "PREPARADA", binding: bindingFromPackage(deliveryPackage), invocation_intent_count: 0, invocation_returned_count: 0 }, now);
    return { deliveryDir, state };
  }

  async function claim(deliveryDir, state) {
    try {
      await mkdir(join(deliveryDir, "claim"));
    } catch (error) {
      if (error?.code === "EEXIST") fail("EMISION_YA_CLAIMED", "El efecto ya fue reclamado", error);
      throw error;
    }
    return appendState(deliveryDir, state, { phase: "EMISION_CLAIMED" }, now);
  }

  async function terminalFailure(deliveryDir, state, cause) {
    return appendState(deliveryDir, state, { phase: "ENTREGA_NO_CONFIRMADA", cause }, now);
  }

  async function reconcileOnce(deliveryDir, state, deliveryPackage, outputBytes) {
    if (state.reconciliation_count >= 1) return terminalFailure(deliveryDir, state, "TIMEOUT");
    state = await appendState(deliveryDir, state, { phase: "RECONCILIANDO", reconciliation_count: 1 }, now);
    await fault("after_reconciliation_claim", { deliveryDir, state });
    let receipt;
    try {
      receipt = await reconcile({ attempt: structuredClone(deliveryPackage.attempt), deliveryDir, timeoutMs });
    } catch (error) {
      if (error instanceof DeliveryV2Error && error.code === "SIMULATED_CRASH") throw error;
      return terminalFailure(deliveryDir, state, "RECEIPT_INVALIDO");
    }
    if (!receipt) return terminalFailure(deliveryDir, state, "TIMEOUT");
    try {
      validateDeliveryReceiptV2(receipt, deliveryPackage.attempt, deliveryPackage.result, outputBytes, sha256Bytes);
    } catch (error) {
      return terminalFailure(deliveryDir, state, error instanceof HandoffContractV2Error ? "RECEIPT_INVALIDO" : "SALIDA_CONTRACTUAL_INVALIDA");
    }
    if (state.invocation_intent_count !== 1) return terminalFailure(deliveryDir, state, "INVOCACION_NO_OBSERVADA");
    state = await appendState(deliveryDir, state, { phase: "ENTREGA_CONFIRMADA" }, now);
    await fault("after_delivery_confirmed", { deliveryDir, state });
    return appendState(deliveryDir, state, { phase: "HANDOFF_COMPLETE" }, now);
  }

  async function invokeAndReconcile(deliveryDir, state, deliveryPackage, outputBytes) {
    state = await appendState(deliveryDir, state, { phase: "EMISION_CLAIMED", invocation_intent_count: 1 }, now);
    await fault("before_invoke", { deliveryDir, state });
    try {
      await invoke({ attempt: structuredClone(deliveryPackage.attempt), manifest: structuredClone(deliveryPackage.manifest), deliveryDir });
    } catch (error) {
      if (error instanceof DeliveryV2Error && error.code === "SIMULATED_CRASH") throw error;
      return terminalFailure(deliveryDir, state, "INVOCACION_FALLIDA");
    }
    state = await appendState(deliveryDir, state, { phase: "RECONCILIANDO", invocation_returned_count: 1 }, now);
    await fault("after_invoke", { deliveryDir, state });
    return reconcileOnce(deliveryDir, state, deliveryPackage, outputBytes);
  }

  async function start(deliveryPackage, dependencies) {
    const outputBytes = validatePackage(deliveryPackage, dependencies);
    const prepared = await prepare(deliveryPackage);
    return withTransitionLock(prepared.deliveryDir, async () => {
      await fault("after_prepare", prepared);
      let state = await claim(prepared.deliveryDir, prepared.state);
      await fault("after_claim", { deliveryDir: prepared.deliveryDir, state });
      return invokeAndReconcile(prepared.deliveryDir, state, deliveryPackage, outputBytes);
    });
  }

  async function resume(deliveryPackage, dependencies) {
    const outputBytes = validatePackage(deliveryPackage, dependencies);
    const deliveryDir = deliveryLedgerPathV2(rootDir, deliveryPackage.attempt.attempt_id, deliveryPackage.attempt.transport_real_id);
    return withTransitionLock(deliveryDir, async () => {
      let state = await latestState(deliveryDir);
      if (!sameBinding(state.binding, bindingFromPackage(deliveryPackage))) fail("DELIVERY_BINDING_NO_COINCIDE", "El intento o la salida no coinciden con el ledger");
      if (TERMINAL_PHASES.has(state.phase)) return state;
      if (state.phase === "PREPARADA") {
        state = await claim(deliveryDir, state);
        return invokeAndReconcile(deliveryDir, state, deliveryPackage, outputBytes);
      }
      if (state.phase === "EMISION_CLAIMED" || state.phase === "RECONCILIANDO" || state.phase === "ENTREGA_CONFIRMADA") {
        if (state.phase === "ENTREGA_CONFIRMADA") return appendState(deliveryDir, state, { phase: "HANDOFF_COMPLETE" }, now);
        return reconcileOnce(deliveryDir, state, deliveryPackage, outputBytes);
      }
      fail("FASE_INVALIDA", state.phase);
    });
  }

  async function recordLateReceipt(deliveryPackage, dependencies, receipt) {
    const outputBytes = validatePackage(deliveryPackage, dependencies);
    const deliveryDir = deliveryLedgerPathV2(rootDir, deliveryPackage.attempt.attempt_id, deliveryPackage.attempt.transport_real_id);
    return withTransitionLock(deliveryDir, async () => {
      const state = await latestState(deliveryDir);
      if (!sameBinding(state.binding, bindingFromPackage(deliveryPackage))) fail("DELIVERY_BINDING_NO_COINCIDE", "El receipt tardío o la salida no coinciden con el ledger");
      if (state.phase !== "ENTREGA_NO_CONFIRMADA") fail("RECEIPT_TARDIO_NO_APLICA", state.phase);
      try {
        validateDeliveryReceiptV2(receipt, deliveryPackage.attempt, deliveryPackage.result, outputBytes, sha256Bytes);
      } catch (error) {
        fail("RECEIPT_INVALIDO", error.message, error);
      }
      const lateDir = join(deliveryDir, "late-receipts");
      await mkdir(lateDir, { recursive: true });
      const evidenceHash = sha256Bytes(Buffer.from(JSON.stringify(receipt), "utf8"));
      const target = join(lateDir, `${evidenceHash}.json`);
      try { await access(target); fail("RECEIPT_TARDIO_DUPLICADO", evidenceHash); } catch (error) { if (error instanceof DeliveryV2Error) throw error; if (error?.code !== "ENOENT") throw error; }
      const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
      await writeFile(temporary, `${JSON.stringify({ classification: "AMBIGUEDAD_POSTERIOR", observed_at: now(), receipt }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      await rename(temporary, target);
      return { classification: "AMBIGUEDAD_POSTERIOR", state };
    });
  }

  return Object.freeze({ start, resume, recordLateReceipt });
}
