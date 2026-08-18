#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
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
const CONTRACT_V2_SCHEMA = join(HERE, "handoff-v2.schema.json");
const RESULT_V2_SCHEMA = join(HERE, "handoff-result-v2.schema.json");
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
  "handoff:waiting", "handoff:ready", "handoff:running", "handoff:done", "handoff:failed",
  "handoff:stale", "handoff:blocked", "handoff:blocked-via",
];

const TERMINAL_LABELS = new Set([
  "handoff:done", "handoff:failed", "handoff:stale", "handoff:blocked", "handoff:blocked-via",
]);

export class HandoffError extends Error {
  constructor(message, label = "handoff:failed", code = "HANDOFF_ERROR") {
    super(message);
    this.name = "HandoffError";
    this.label = label;
    this.code = code;
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

function failV2(code, message, label = "handoff:blocked") {
  throw new HandoffError(message, label, code);
}

export const HANDOFF_V2_DECISIONS = Object.freeze([
  "SIN_OBJECIONES", "OBJECION_MATERIAL", "REQUIERE_ARBITRAJE",
  "BLOQUEADO_POR_LIMITE", "BLOQUEADO_POR_GATE",
]);

export const HANDOFF_V2_HUMAN_CATEGORIES = Object.freeze([
  "CAMBIO_DE_PRODUCTO_ALCANCE_O_INTENCION",
  "COSTO_RELEVANTE_O_PAYG",
  "PRIVACIDAD_O_SEGURIDAD_ACEPTADA",
  "ACCION_IRREVERSIBLE_O_IMPACTO_EXTERNO",
  "ALTERNATIVAS_MATERIALES_NO_RESUELTAS_POR_EVIDENCIA",
  "CONTRADICCION_CON_INSTRUCCION_DEL_DIRECTOR",
  "EVIDENCIA_INSUFICIENTE_PARA_GATE_OBLIGATORIO",
  "ACCION_FISICA_O_AUTORIZACION_NO_AUTOMATIZABLE",
]);

export const HANDOFF_V2_EVIDENCE_TYPES = Object.freeze([
  "PR_INTEGRADA", "COMMIT", "ARTEFACTO_CON_HASH", "RESULTADO_VALIDADO",
]);

export const HANDOFF_V2_RUNTIME_OPERATIONS = Object.freeze([
  Object.freeze({ tipo: "filesystem", objetivo: "runtime-state" }),
  Object.freeze({ tipo: "filesystem", objetivo: "artifacts" }),
  Object.freeze({ tipo: "filesystem", objetivo: "economic-ledger" }),
  Object.freeze({ tipo: "github", objetivo: "state" }),
  Object.freeze({ tipo: "github", objetivo: "read" }),
  Object.freeze({ tipo: "github", objetivo: "publish" }),
  Object.freeze({ tipo: "red", objetivo: "auth-observation" }),
  Object.freeze({ tipo: "red", objetivo: "invoke-agent" }),
  Object.freeze({ tipo: "git", objetivo: "read" }),
]);

const DECISION_STATE = Object.freeze({
  SIN_OBJECIONES: "COMPLETADO",
  OBJECION_MATERIAL: "COMPLETADO",
  REQUIERE_ARBITRAJE: "COMPLETADO",
  BLOQUEADO_POR_LIMITE: "BLOQUEADO",
  BLOQUEADO_POR_GATE: "BLOQUEADO",
});

const HUMAN_CATEGORY_NATURE = Object.freeze(Object.fromEntries(
  HANDOFF_V2_HUMAN_CATEGORIES.map((category) => [
    category,
    category === "ACCION_FISICA_O_AUTORIZACION_NO_AUTOMATIZABLE" ? "ACCION_FISICA" : "DECISION_MATERIAL",
  ]),
));

const HUMAN_CATEGORY_REFERENCE = Object.freeze(Object.fromEntries(
  HANDOFF_V2_HUMAN_CATEGORIES.map((category) => [
    category,
    category === "ACCION_FISICA_O_AUTORIZACION_NO_AUTOMATIZABLE"
      ? "pendientes.md#calibracion-experimental-de-profundidad-modelos-y-costo"
      : "decisiones/0013-delegar-cierre-operativo-y-merge-rutinario.md#cuando-si-se-escala-al-director",
  ]),
));

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function requireKeys(value, keys, label) {
  if (!object(value)) failV2("ESTRUCTURA_INVALIDA", `${label} debe ser objeto`);
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (missing.length) failV2("CAMPO_REQUERIDO_AUSENTE", `${label} omite: ${missing.join(", ")}`);
}

function rejectExtras(value, keys, label) {
  const extras = Object.keys(value).filter((key) => !keys.includes(key));
  if (extras.length) failV2("CAMPO_NO_ADMITIDO", `${label} contiene: ${extras.join(", ")}`);
}

function defaultActorsPath() {
  return join(HERE, "actores.json");
}

function actorRegistry(context = {}) {
  const registry = context.actors ?? readJson(context.actorsPath ?? defaultActorsPath());
  if (!object(registry) || !object(registry.roles)) failV2("ACTORES_INVALIDOS", "actores.json no define roles");
  return registry;
}

function resolveRole(role, requiredCapabilities, context = {}) {
  const entry = actorRegistry(context).roles[role];
  if (!entry) failV2("ROL_NO_RESUELTO", `Rol no configurado: ${role}`);
  const capabilities = new Set(entry.capacidades ?? []);
  const missing = requiredCapabilities.filter((capability) => !capabilities.has(capability));
  if (missing.length) failV2("CAPACIDAD_ESTATICA_AUSENTE", `${role} carece de: ${missing.join(", ")}`);
  return entry;
}

function agentKeyForContract(contract, context = {}) {
  if (typeof contract.destinatario === "string") return contract.destinatario;
  const actor = resolveRole(contract.destinatario.rol, contract.destinatario.capacidades_requeridas ?? [], context);
  if (!actor.agent) failV2("ACTOR_SIN_ADAPTER_EJECUTABLE", contract.destinatario.rol);
  return actor.agent;
}

function githubAnchor(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
}

export function canonicalReferenceResolves(reference, context = {}) {
  if (typeof reference !== "string" || !reference.includes("#")) return false;
  if (context.resolveCanonicalReference) return context.resolveCanonicalReference(reference) === true;
  const [path, anchor] = reference.split("#", 2);
  if (!safeRelativePath(path) || !anchor) return false;
  const absolute = resolve(context.repoRoot ?? ROOT, path);
  if (!existsSync(absolute)) return false;
  const headings = readFileSync(absolute, "utf8").split(/\r?\n/)
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => githubAnchor(line.replace(/^#{1,6}\s+/, "")));
  return headings.includes(anchor.toLowerCase());
}

function validateActorDescriptor(descriptor, authorizedContext, context, label) {
  requireKeys(descriptor, ["rol", "capacidades_requeridas"], label);
  rejectExtras(descriptor, ["rol", "capacidades_requeridas"], label);
  if (!Array.isArray(descriptor.capacidades_requeridas)) failV2("ESTRUCTURA_INVALIDA", `${label}.capacidades_requeridas inválido`);
  const actor = resolveRole(descriptor.rol, descriptor.capacidades_requeridas, context);
  if (!authorizedContext.includes(actor.adapter)) failV2("ADAPTER_FUERA_DE_CONTEXTO", `${actor.adapter} no está en contexto_autorizado`);
  return actor;
}

function validateEconomicImpact(impact) {
  requireKeys(impact, ["tipo"], "impacto_economico");
  if (impact.tipo === "no_aplica") {
    rejectExtras(impact, ["tipo"], "impacto_economico");
    return;
  }
  if (impact.tipo !== "aplica") failV2("IMPACTO_ECONOMICO_INVALIDO", "impacto_economico.tipo inválido");
  const keys = ["tipo", "objetivo_economico", "moneda", "cap_acumulado", "maximo_intento", "acumulado_observable", "remanente", "politica_costo_indeterminado"];
  requireKeys(impact, keys, "impacto_economico");
  rejectExtras(impact, keys, "impacto_economico");
  for (const key of ["cap_acumulado", "maximo_intento", "acumulado_observable", "remanente"]) {
    if (typeof impact[key] !== "number" || impact[key] < 0) failV2("IMPACTO_ECONOMICO_INVALIDO", `${key} inválido`);
  }
  if (impact.politica_costo_indeterminado !== "DETENER_SIN_REINTENTO") failV2("REINTENTO_ECONOMICO_INVALIDO", "Costo indeterminado debe detener sin reintento");
  const expected = impact.cap_acumulado - impact.acumulado_observable;
  if (Math.abs(expected - impact.remanente) > 1e-9) failV2("REMANENTE_INCONSISTENTE", "remanente no corresponde al acumulado por objetivo");
  if (impact.maximo_intento > impact.remanente) failV2("CAP_ECONOMICO_EXCEDIDO", "El máximo del intento excede el remanente");
}

function validateHumanDelegations(entries, context) {
  if (!Array.isArray(entries)) failV2("ESTRUCTURA_INVALIDA", "operaciones_delegadas_a_humanos debe ser array");
  for (const entry of entries) {
    const keys = ["categoria", "referencia_canonica", "condicion_observable", "actor_o_capacidad_requerida", "naturaleza", "explicacion"];
    requireKeys(entry, keys.slice(0, 5), "operación delegada");
    rejectExtras(entry, keys, "operación delegada");
    if (!HANDOFF_V2_HUMAN_CATEGORIES.includes(entry.categoria)) failV2("CATEGORIA_ESCALAMIENTO_INVALIDA", entry.categoria);
    if (!canonicalReferenceResolves(entry.referencia_canonica, context)) failV2("REFERENCIA_CANONICA_NO_RESUELTA", entry.referencia_canonica);
    if (entry.referencia_canonica !== HUMAN_CATEGORY_REFERENCE[entry.categoria]) failV2("REFERENCIA_CANONICA_INCOMPATIBLE", entry.categoria);
    if (entry.naturaleza === "OPERACION_RUTINARIA") {
      const available = Object.values(actorRegistry(context).roles).some((actor) => (actor.capacidades ?? []).includes(entry.actor_o_capacidad_requerida));
      if (available) failV2("DELEGACION_RUTINARIA_PROHIBIDA", "Existe un actor estático con la capacidad rutinaria");
      failV2("DISPONIBILIDAD_DINAMICA_NO_OBSERVABLE", "La falta de disponibilidad dinámica no autoriza delegar al Director");
    }
    if (HUMAN_CATEGORY_NATURE[entry.categoria] !== entry.naturaleza) failV2("CATEGORIA_INCOMPATIBLE_CON_OPERACION", entry.categoria);
  }
}

function validateCanonicalState(state, context) {
  requireKeys(state, ["accion_anterior", "evidencia_cierre", "proxima_accion", "head_reconciliacion"], "estado_canonico");
  rejectExtras(state, ["accion_anterior", "evidencia_cierre", "proxima_accion", "head_reconciliacion", "paths_senal"], "estado_canonico");
  for (const key of ["accion_anterior", "proxima_accion"]) {
    requireKeys(state[key], ["id", "descripcion"], `estado_canonico.${key}`);
    if (!state[key].id || !state[key].descripcion) failV2("ESTADO_CANONICO_INVALIDO", key);
  }
  if (state.accion_anterior.id === state.proxima_accion.id) failV2("ESTADO_CANONICO_DIVERGENTE", "La próxima acción ya está cerrada");
  requireKeys(state.evidencia_cierre, ["tipo", "referencia", "head_o_historial"], "evidencia_cierre");
  if (!HANDOFF_V2_EVIDENCE_TYPES.includes(state.evidencia_cierre.tipo)) failV2("EVIDENCIA_CIERRE_INVALIDA", "tipo inválido");
  if (typeof context.resolveEvidence !== "function") failV2("RESOLVER_EVIDENCIA_REQUERIDO", "resolveEvidence es obligatorio");
  const resolver = context.resolveEvidence;
  if (!resolver(state.evidencia_cierre, state.head_reconciliacion)) failV2("EVIDENCIA_CIERRE_NO_RESUELTA", state.evidencia_cierre.referencia);
  if (!/^[0-9a-f]{40}$/.test(state.head_reconciliacion ?? "")) failV2("HEAD_RECONCILIACION_INVALIDO", "HEAD inválido");
  return state.paths_senal?.length ? { warning: "ESTADO_CANONICO_POTENCIALMENTE_DIVERGENTE" } : { warning: null };
}

export function validateContractV2(contract, context = {}) {
  if (!object(contract)) failV2("ESTRUCTURA_INVALIDA", "Contrato no es objeto");
  if (contract.handoff_version !== "2") failV2("CONTRATO_VERSION_NO_SOPORTADA", `handoff_version ${contract.handoff_version ?? "ausente"} no se migra ni reinterpreta`);
  const keys = ["handoff_version", "tarea", "head_sha", "contexto_autorizado", "resultado_previo", "origen", "destinatario", "modo", "mutaciones_permitidas", "operaciones_permitidas", "impacto_economico", "reintentos", "transiciones_permitidas", "estado_canonico", "operaciones_delegadas_a_humanos", "profundidad_cadena"];
  requireKeys(contract, keys, "contrato v2");
  rejectExtras(contract, keys, "contrato v2");
  if (!/^[0-9a-f]{40}$/.test(contract.head_sha ?? "")) failV2("HEAD_INVALIDO", "head_sha inválido");
  if (!Array.isArray(contract.contexto_autorizado) || contract.contexto_autorizado.some((path) => !safeRelativePath(path))) failV2("CONTEXTO_INVALIDO", "contexto_autorizado inválido");
  if (contract.resultado_previo !== null) {
    requireKeys(contract.resultado_previo, ["issue", "marker", "result_sha256"], "resultado_previo");
    rejectExtras(contract.resultado_previo, ["issue", "marker", "result_sha256"], "resultado_previo");
    if (!Number.isInteger(contract.resultado_previo.issue) || !/^[0-9a-f]{64}$/.test(contract.resultado_previo.result_sha256 ?? "")) failV2("RESULTADO_PREVIO_INVALIDO", "puntero inválido");
  }
  const missingCommonContext = GOVERNING_CONTEXT.common.filter((path) => !contract.contexto_autorizado.includes(path));
  if (missingCommonContext.length) failV2("CANON_GOBERNANTE_AUSENTE", `Falta canon gobernante: ${missingCommonContext.join(", ")}`);
  requireKeys(contract.origen, ["ejecutor", "rol"], "origen");
  const originActor = resolveRole(contract.origen.rol, [], context);
  if (originActor.actor !== contract.origen.ejecutor) failV2("ORIGEN_NO_RESUELTO", "ejecutor y rol no corresponden");
  if (!contract.contexto_autorizado.includes(originActor.adapter)) failV2("ADAPTER_FUERA_DE_CONTEXTO", originActor.adapter);
  validateActorDescriptor(contract.destinatario, contract.contexto_autorizado, context, "destinatario");
  if (!["solo_lectura", "ejecucion"].includes(contract.modo)) failV2("MODO_INVALIDO", contract.modo);
  if (!Array.isArray(contract.mutaciones_permitidas) || !Array.isArray(contract.operaciones_permitidas)) failV2("MUTACIONES_INVALIDAS", "listas requeridas");
  if (contract.mutaciones_permitidas.some((path) => !safeRelativePath(path))) failV2("MUTACIONES_INVALIDAS", "path de mutación inseguro");
  for (const operation of contract.operaciones_permitidas) {
    requireKeys(operation, ["tipo", "objetivo"], "operación permitida");
    rejectExtras(operation, ["tipo", "objetivo"], "operación permitida");
    if (!["git", "github", "red", "filesystem"].includes(operation.tipo) || typeof operation.objetivo !== "string" || !operation.objetivo) failV2("OPERACION_INVALIDA", "operación permitida inválida");
  }
  const missingRuntimeOperations = HANDOFF_V2_RUNTIME_OPERATIONS.filter((required) => !contract.operaciones_permitidas.some(
    (operation) => operation.tipo === required.tipo && operation.objetivo === required.objetivo,
  ));
  if (missingRuntimeOperations.length) failV2("OPERACION_RUNTIME_NO_DECLARADA", missingRuntimeOperations.map((item) => `${item.tipo}:${item.objetivo}`).join(", "));
  if (contract.modo === "solo_lectura" && contract.mutaciones_permitidas.length) failV2("SOLO_LECTURA_CON_MUTACIONES", "solo_lectura no admite mutaciones");
  validateEconomicImpact(contract.impacto_economico);
  requireKeys(contract.reintentos, ["maximos", "politica_costo_indeterminado"], "reintentos");
  if (!Number.isInteger(contract.reintentos.maximos) || contract.reintentos.maximos < 0 || contract.reintentos.politica_costo_indeterminado !== "DETENER_SIN_REINTENTO") failV2("REINTENTOS_INVALIDOS", "política inválida");
  if (!Array.isArray(contract.transiciones_permitidas)) failV2("TRANSICIONES_INVALIDAS", "tabla requerida");
  if (!Number.isInteger(contract.profundidad_cadena) || contract.profundidad_cadena < 1) failV2("PROFUNDIDAD_INVALIDA", "profundidad_cadena inválida");
  validateHumanDelegations(contract.operaciones_delegadas_a_humanos, context);
  const canonical = validateCanonicalState(contract.estado_canonico, context);
  return { ...contract, advertencia_estado_canonico: canonical.warning };
}

export function validateResultV2(result, contract, context = {}) {
  if (!object(result)) failV2("RESULTADO_INVALIDO", "Resultado no es objeto", "handoff:failed");
  if (result.handoff_version !== "2") failV2("CONTRATO_VERSION_NO_SOPORTADA", "Resultado no es v2", "handoff:failed");
  const keys = ["handoff_version", "estado", "decision", "resumen", "evidencia", "archivos_leidos", "siguiente", "firma"];
  requireKeys(result, keys, "resultado v2");
  rejectExtras(result, keys, "resultado v2");
  if (!HANDOFF_V2_DECISIONS.includes(result.decision)) failV2("DECISION_INVALIDA", result.decision, "handoff:failed");
  if (typeof result.resumen !== "string" || !result.resumen.trim()) failV2("RESUMEN_INVALIDO", "resumen vacío", "handoff:failed");
  if (!Array.isArray(result.evidencia)) failV2("EVIDENCIA_INVALIDA", "evidencia debe ser array", "handoff:failed");
  for (const item of result.evidencia) {
    requireKeys(item, ["archivo", "detalle"], "evidencia");
    rejectExtras(item, ["archivo", "detalle"], "evidencia");
    if (typeof item.archivo !== "string" || typeof item.detalle !== "string") failV2("EVIDENCIA_INVALIDA", "ítem inválido", "handoff:failed");
  }
  if (!Array.isArray(result.archivos_leidos) || result.archivos_leidos.some((path) => !contract.contexto_autorizado.includes(path))) failV2("ARCHIVOS_LEIDOS_FUERA_DE_CONTEXTO", "archivos_leidos inválido", "handoff:failed");
  if (DECISION_STATE[result.decision] !== result.estado) failV2("DECISION_ESTADO_INCOMPATIBLE", "decision y estado no corresponden", "handoff:failed");
  if (result.decision !== "SIN_OBJECIONES" && result.siguiente === null) failV2("SIGUIENTE_REQUERIDO", "La decisión exige siguiente", "handoff:failed");
  if (result.siguiente !== null) {
    const actor = validateActorDescriptor(result.siguiente, contract.contexto_autorizado, context, "siguiente");
    if (result.decision === "REQUIERE_ARBITRAJE" && !(actor.capacidades ?? []).includes("arbitraje")) failV2("SIGUIENTE_SIN_AUTORIDAD", "El siguiente no arbitra", "handoff:failed");
    const transition = `${result.estado}->${result.siguiente.rol}`;
    if (!contract.transiciones_permitidas.includes(transition)) failV2("TRANSICION_NO_PERMITIDA", transition, "handoff:failed");
  }
  const signatureKeys = ["ejecutor_real", "entorno", "modelo_configurado", "modelo_efectivo", "esfuerzo_o_modo_configurado", "esfuerzo_o_modo_efectivo", "sujeto_evaluado", "via_evaluada", "fecha"];
  requireKeys(result.firma, signatureKeys, "firma");
  rejectExtras(result.firma, signatureKeys, "firma");
  for (const key of signatureKeys) if (typeof result.firma[key] !== "string" || !result.firma[key]) failV2("FIRMA_INCOMPLETA", key, "handoff:failed");
  return result;
}

export function assertEconomicAuthorization(contract, operation) {
  if (operation.paga && contract.impacto_economico.tipo === "no_aplica") failV2("OPERACION_PAGA_NO_AUTORIZADA", "Bloqueada antes de red o gasto");
  if (operation.paga && contract.impacto_economico.maximo_intento > contract.impacto_economico.remanente) failV2("CAP_ECONOMICO_EXCEDIDO", "Bloqueada antes de red o gasto");
  return true;
}

export function assertDeclaredOperationAllowed(contract, operation) {
  const declared = contract.operaciones_permitidas.some((item) => item.tipo === operation.tipo && item.objetivo === operation.objetivo);
  if (!declared) failV2("MUTACION_BLOQUEADA_PREVENTIVAMENTE", `${operation.tipo}:${operation.objetivo}`);
  assertEconomicAuthorization(contract, operation);
  if (operation.paga && contract.impacto_economico.tipo === "aplica" && !operation.reserva_economica_id) {
    failV2("RESERVA_ECONOMICA_AUSENTE", "La operación paga no tiene reserva durable");
  }
  return true;
}

export async function executeDeclaredOperation(contract, operation, handlers = {}) {
  assertDeclaredOperationAllowed(contract, operation);
  const handler = handlers[operation.tipo];
  if (typeof handler !== "function") failV2("CAPACIDAD_NO_IMPLEMENTADA", operation.tipo);
  return handler(operation);
}

export async function executeV2Unit(contract, options = {}) {
  if (typeof options.validationContext?.resolveEvidence !== "function") failV2("RESOLVER_EVIDENCIA_REQUERIDO", "resolveEvidence es obligatorio");
  if (typeof options.snapshotVersioned !== "function") failV2("SNAPSHOT_VERSIONADO_REQUERIDO", "snapshotVersioned es obligatorio");
  const validated = validateContractV2(contract, options.validationContext);
  const snapshot = options.snapshotVersioned;
  const before = snapshotVersionedPaths(await snapshot());
  let result;
  let invocationError;
  let mutationError;
  try {
    result = await options.invoke(validated);
  } catch (error) {
    invocationError = error;
  } finally {
    const after = snapshotVersionedPaths(await snapshot());
    const mutations = detectPostMutations(before, after, validated);
    if (!mutations.valid) mutationError = new HandoffError(`Paths fuera del sobre: ${mutations.paths.join(", ")}`, "handoff:failed", mutations.code);
  }
  if (mutationError) throw mutationError;
  if (invocationError) throw invocationError;
  const validatedResult = validateResultV2(result, validated, options.validationContext);
  for (const operation of options.operations ?? []) {
    await executeDeclaredOperation(validated, operation, options.handlers);
  }
  return validatedResult;
}

export function snapshotVersionedPaths(entries) {
  return new Map(Object.entries(entries));
}

export function detectPostMutations(before, after, contract) {
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((path) => before.get(path) !== after.get(path));
  const allowed = contract.modo === "solo_lectura" ? [] : contract.mutaciones_permitidas;
  const outside = changed.filter((path) => !allowed.includes(path));
  if (outside.length) return { valid: false, code: "MUTACION_FUERA_DE_SOBRE_DETECTADA_POSTERIORMENTE", paths: outside };
  return { valid: true, code: null, paths: changed };
}

export function snapshotTrackedPaths(repo, run = runProcess) {
  const raw = run("git", ["-c", `safe.directory=${repo}`, "-C", repo, "ls-files", "-z"], {
    env: buildChildEnv(), timeout: 60_000,
  }).stdout;
  const entries = {};
  for (const path of raw.split("\0").filter(Boolean)) {
    const absolute = resolve(repo, path);
    entries[path.replaceAll("\\", "/")] = existsSync(absolute) ? sha256(readFileSync(absolute)) : "MISSING";
  }
  return entries;
}

export function resolveEvidenceFromGit(repo, evidence, _headReconciliation, run = runProcess) {
  try {
    if (["COMMIT", "PR_INTEGRADA"].includes(evidence.tipo)) {
      const commit = run("git", ["-c", `safe.directory=${repo}`, "-C", repo, "rev-parse", "--verify", `${evidence.head_o_historial}^{commit}`], {
        env: buildChildEnv(), timeout: 30_000,
      }).stdout.trim();
      if (!/^[0-9a-f]{40}$/.test(commit)) return false;
      if (evidence.tipo === "PR_INTEGRADA") {
        const issue = evidence.referencia.match(/PR\s+#(\d+)/i)?.[1];
        if (!issue) return false;
        const message = run("git", ["-c", `safe.directory=${repo}`, "-C", repo, "show", "-s", "--format=%B", commit], {
          env: buildChildEnv(), timeout: 30_000,
        }).stdout;
        return message.includes(`#${issue}`);
      }
      return true;
    }
    const match = evidence.referencia.match(/^(.+?)#sha256=([0-9a-f]{64})$/);
    if (!match || !safeRelativePath(match[1])) return false;
    const path = resolve(repo, match[1]);
    return existsSync(path) && sha256(readFileSync(path)) === match[2];
  } catch {
    return false;
  }
}

function economicLedgerPath(runtimeDir) {
  return join(runtimeDir, "economy", "ledger.json");
}

function withEconomicLedger(runtimeDir, update, options = {}) {
  const lockPath = join(runtimeDir, "economy", "ledger.lock");
  const lease = acquireLeaseLock(lockPath, {
    now: options.now ?? Date.now(), leaseMs: options.leaseMs ?? 30_000,
    candidateId: options.candidateId, leaseId: options.leaseId, ownerInstanceId: options.ownerInstanceId,
  });
  if (!lease.acquired) failV2("LEDGER_ECONOMICO_BLOQUEADO", lease.reason);
  try {
    const path = economicLedgerPath(runtimeDir);
    const ledger = existsSync(path) ? readJson(path) : { version: 1, objetivos: {} };
    const result = update(ledger);
    writeJson(path, ledger);
    return result;
  } finally {
    releaseLeaseLock(lockPath, lease.owner);
  }
}

export function reserveEconomicBudget(contract, runtimeDir, options = {}) {
  if (contract.impacto_economico.tipo !== "aplica") return null;
  const impact = contract.impacto_economico;
  return withEconomicLedger(runtimeDir, (ledger) => {
    const objective = ledger.objetivos[impact.objetivo_economico] ?? {
      moneda: impact.moneda, cap_acumulado: impact.cap_acumulado, intentos: [],
    };
    if (objective.moneda !== impact.moneda || objective.cap_acumulado !== impact.cap_acumulado) {
      failV2("CAP_OBJETIVO_DIVERGENTE", "El objetivo ya existe con moneda o cap diferente");
    }
    const comprometido = objective.intentos.reduce((sum, attempt) => sum + attempt.comprometido, 0);
    const remanente = objective.cap_acumulado - comprometido;
    if (impact.maximo_intento > remanente + 1e-9) failV2("CAP_ECONOMICO_ACUMULADO_EXCEDIDO", "El ledger durable no admite el intento");
    const reservation = {
      attempt_id: options.attemptId ?? randomUUID(),
      objetivo_economico: impact.objetivo_economico,
      maximo: impact.maximo_intento,
      comprometido: impact.maximo_intento,
      costo_observado: null,
      estado_costo: "RESERVADO",
      reservado_en: options.timestamp ?? new Date().toISOString(),
    };
    objective.intentos.push(reservation);
    ledger.objetivos[impact.objetivo_economico] = objective;
    return { ...reservation, remanente_despues: remanente - impact.maximo_intento };
  }, options);
}

export function reconcileEconomicBudget(runtimeDir, reservation, outcome, options = {}) {
  if (!reservation) return null;
  return withEconomicLedger(runtimeDir, (ledger) => {
    const objective = ledger.objetivos[reservation.objetivo_economico];
    const attempt = objective?.intentos.find((item) => item.attempt_id === reservation.attempt_id);
    if (!attempt) failV2("RESERVA_ECONOMICA_NO_ENCONTRADA", reservation.attempt_id);
    if (attempt.estado_costo !== "RESERVADO") return { ...attempt, conciliacion_reutilizada: true };
    if (outcome.atribuible === true && typeof outcome.costo === "number" && outcome.costo >= 0) {
      attempt.costo_observado = outcome.costo;
      attempt.comprometido = outcome.costo;
      attempt.estado_costo = "CONCILIADO_ATRIBUIBLE";
    } else {
      attempt.costo_observado = null;
      attempt.estado_costo = "COSTO_INDETERMINADO";
    }
    attempt.cerrado_en = options.timestamp ?? new Date().toISOString();
    return { ...attempt };
  }, options);
}

export function acquireLeaseLock(path, options = {}) {
  const now = options.now ?? Date.now();
  const leaseMs = options.leaseMs ?? 60_000;
  const candidateId = options.candidateId ?? randomUUID();
  const owner = {
    lease_id: options.leaseId ?? randomUUID(),
    owner_instance_id: options.ownerInstanceId ?? randomUUID(),
    acquired_at_ms: now,
    heartbeat_at_ms: now,
    expires_at_ms: now + leaseMs,
  };
  const acquire = options.acquire ?? acquireLock;
  const rename = options.rename ?? renameSync;
  const remove = options.remove ?? rmSync;
  if (acquire(path, owner)) return { acquired: true, owner, recovered: false };

  let current;
  try { current = readJson(join(path, "owner.json")); } catch { return { acquired: false, reason: "LOCK_IDENTITY_UNREADABLE" }; }
  if (current.expires_at_ms > now) return { acquired: false, reason: "LEASE_ACTIVE", owner: current };

  const quarantine = `${path}.stale.${candidateId}`;
  try {
    rename(path, quarantine);
  } catch (error) {
    return { acquired: false, reason: "LEASE_RECOVERY_RACE", observed_error: error.code ?? error.name };
  }

  const acquired = acquire(path, owner);
  try { remove(quarantine, { recursive: true, force: true }); } catch { /* sólo limpia la cuarentena propia */ }
  if (!acquired) return { acquired: false, reason: "LEASE_CREATE_RACE" };
  return { acquired: true, owner, recovered: true };
}

export function heartbeatLeaseLock(path, owner, options = {}) {
  const current = readJson(join(path, "owner.json"));
  if (current.lease_id !== owner.lease_id || current.owner_instance_id !== owner.owner_instance_id) return false;
  const now = options.now ?? Date.now();
  const updated = { ...current, heartbeat_at_ms: now, expires_at_ms: now + (options.leaseMs ?? 60_000) };
  writeJson(join(path, "owner.json"), updated);
  return updated;
}

export function releaseLeaseLock(path, owner) {
  if (!existsSync(path)) return false;
  const current = readJson(join(path, "owner.json"));
  if (current.lease_id !== owner.lease_id || current.owner_instance_id !== owner.owner_instance_id) return false;
  releaseLock(path);
  return true;
}

export function startLeaseHeartbeat(path, owner, options = {}) {
  const leaseMs = options.leaseMs ?? 60_000;
  const intervalMs = options.intervalMs ?? Math.max(100, Math.floor(leaseMs / 3));
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped) return;
    try {
      const renewed = heartbeatLeaseLock(path, owner, { leaseMs, now: options.now?.() ?? Date.now() });
      if (!renewed) {
        stopped = true;
        clearInterval(timer);
        options.onLost?.();
      }
    } catch (error) {
      stopped = true;
      clearInterval(timer);
      options.onError?.(error);
    }
  }, intervalMs);
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
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
  return !/^[A-Za-z]:\//.test(normalized) && !normalized.split("/").includes("..") && !normalized.includes("\0");
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
  if (contract.handoff_version === "2") {
    return {
      handoff_version: "2",
      estado: "COMPLETADO",
      decision: "SIN_OBJECIONES",
      resumen: "Resultado breve.",
      evidencia: [{ archivo: examplePath, detalle: "Evidencia breve." }],
      archivos_leidos: [examplePath],
      siguiente: null,
      firma: {
        ejecutor_real: "ACTOR_REAL",
        entorno: "ENTORNO_OBSERVADO",
        modelo_configurado: "MODELO_CONFIGURADO",
        modelo_efectivo: "NO_VERIFICADO",
        esfuerzo_o_modo_configurado: "MODO_CONFIGURADO",
        esfuerzo_o_modo_efectivo: "NO_OBSERVABLE",
        sujeto_evaluado: contract.tarea,
        via_evaluada: "VIA_OBSERVADA",
        fecha: "AAAA-MM-DD",
      },
    };
  }
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

function promptTemplateV2() {
  return `DESTINATARIO: {{DESTINATARIO_MAYUSCULAS}}

Actuá exclusivamente sobre el paquete congelado incluido abajo. Es una sesión nueva y sin memoria. No agregues información externa. El canon incluido prevalece sobre restricciones ad hoc.

Devolvé exclusivamente JSON válido conforme al schema de salida. No incluyas razonamiento interno ni texto fuera del JSON.

## Contrato

{{CONTRATO}}

## Resultado previo

{{RESULTADO_PREVIO}}

## Contexto autorizado reconstruido desde objetos Git

{{CONTEXTO}}

## Schema del contrato de salida

\`\`\`json
{{SCHEMA_SALIDA}}
\`\`\`

## Reglas de salida

- Emití un único objeto JSON crudo.
- Incluí exactamente las claves del schema v2; no uses \`veredicto\`.
- \`decision\`, \`estado\` y \`siguiente\` deben respetar sus correspondencias mecánicas.
- Cada evidencia contiene exactamente \`archivo\` y \`detalle\`.
- \`archivos_leidos\` sólo contiene paths de \`contexto_autorizado\`.
- No inventes disponibilidad, modelo, esfuerzo, costo ni evidencia.
{{DIFF_CONGELADO}}

## Ejemplo canónico mínimo

\`\`\`json
{{EJEMPLO_SALIDA}}
\`\`\`
`;
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
    DESTINATARIO_MAYUSCULAS: (typeof contract.destinatario === "string" ? contract.destinatario : contract.destinatario.rol).toUpperCase(),
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
  const contractSchemaPath = contract.handoff_version === "2" ? CONTRACT_V2_SCHEMA : CONTRACT_SCHEMA;
  const resultSchemaPath = contract.handoff_version === "2" ? RESULT_V2_SCHEMA : RESULT_SCHEMA;
  writeJson(join(inputDir, "handoff.schema.json"), readJson(contractSchemaPath));
  const resultSchema = readFileSync(resultSchemaPath, "utf8");
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
    contract.handoff_version === "2" ? promptTemplateV2() : readFileSync(PROMPT_TEMPLATE, "utf8"),
    contract, previousResult, contexts, resultSchema, frozenDiff,
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

export function invokeAgent({ contract, adapter, prompt, runDir, run = runProcess, env = buildChildEnv(), agentKey = null }) {
  const started = Date.now();
  let parsed;
  let raw;
  const target = agentKey ?? contract.destinatario;
  const outputSchema = contract.handoff_version === "2" ? RESULT_V2_SCHEMA : RESULT_SCHEMA;
  if (target === "claude") {
    const emptyMcp = join(runDir, "empty-mcp.json");
    writeJson(emptyMcp, { mcpServers: {} });
    const response = run(adapter.executable, [
      "--print", "--safe-mode", "--tools", "", "--strict-mcp-config", "--mcp-config", emptyMcp,
      "--disable-slash-commands", "--no-chrome", "--no-session-persistence", "--output-format", "json",
      "--json-schema", readFileSync(outputSchema, "utf8"), "--model", adapter.model, "--effort", adapter.effort,
    ], { cwd: runDir, env, input: Buffer.from(prompt, "utf8"), timeout: adapter.timeout_ms });
    raw = response.stdout;
    parsed = parseClaude(raw);
  } else if (target === "codex") {
    const finalPath = join(runDir, "final.json");
    const response = run(adapter.executable, [
      "exec", "--strict-config", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check",
      "--sandbox", "read-only", "--cd", runDir, "--model", adapter.model,
      "--config", `model_reasoning_effort=\"${adapter.effort}\"`, "--config", "approval_policy=\"never\"",
      "--config", "web_search=\"disabled\"", "--config", "features.shell_tool=false",
      "--config", "features.apps=false", "--config", "features.code_mode.enabled=false",
      "--output-schema", outputSchema, "--output-last-message", finalPath, "--json", "--color", "never", "-",
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
    if (state.handoff_version === "2" && !["result_persisted", "published"].includes(state.phase)) {
      backend.setState(issue.number, "handoff:running", "handoff:blocked");
      saveState(runtimeDir, issue.number, {
        ...state, phase: "blocked", blocked_reason: "v2 at-most-once: resultado no persistido; costo o efecto indeterminado",
      });
      transitionLog(transitions, {
        issue: issue.number, from: "running", to: "blocked", reason: "v2 at-most-once sin resultado persistido",
      });
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

function childContractV2(parentContract, result, pointer) {
  return {
    ...parentContract,
    tarea: `Continuar el handoff v2 después del resultado validado de Issue #${pointer.issue}: ${parentContract.tarea}`,
    contexto_autorizado: [...new Set([...parentContract.contexto_autorizado, "scripts/handoff/README.md"])],
    resultado_previo: pointer,
    origen: { ejecutor: "handoff.mjs", rol: "ORQUESTADOR_HANDOFF" },
    destinatario: result.siguiente,
    profundidad_cadena: parentContract.profundidad_cadena + 1,
  };
}

function observedInvocationCost(invocation) {
  const candidates = [
    invocation?.cost_calculated_usd,
    invocation?.cost_usd,
    invocation?.telemetry?.cost_calculated_usd,
    invocation?.telemetry?.cost_usd,
  ];
  return candidates.find((value) => typeof value === "number" && value >= 0) ?? null;
}

async function processIssueV2(context, issue, parsedContract) {
  const { backend, config, repo, runtimeDir, artifactsDir, transitions, invoke, authObserver, hooks } = context;
  const guardedGitRun = (...args) => {
    assertDeclaredOperationAllowed(parsedContract, { tipo: "git", objetivo: "read", paga: false });
    return (context.run ?? runProcess)(...args);
  };
  const validationContext = {
    actors: context.actors ?? readJson(defaultActorsPath()),
    repoRoot: repo,
    resolveEvidence: (evidence, head) => resolveEvidenceFromGit(repo, evidence, head, guardedGitRun),
  };
  let contract;
  let agentKey;
  try {
    contract = validateContractV2(parsedContract, validationContext);
    if (contract.profundidad_cadena > config.max_relevos) failV2("PROFUNDIDAD_INVALIDA", "Profundidad de cadena excedida");
    agentKey = agentKeyForContract(contract, validationContext);
  } catch (error) {
    if (!(error instanceof HandoffError) || !TERMINAL_LABELS.has(error.label)) throw error;
    const provisionalOperation = (tipo, objetivo, handler) => executeDeclaredOperation(
      parsedContract, { tipo, objetivo, paga: false }, { [tipo]: handler },
    );
    try {
      await provisionalOperation("github", "state", () => backend.setState(issue.number, "handoff:ready", error.label));
      await provisionalOperation("filesystem", "runtime-state", () => saveState(runtimeDir, issue.number, {
        issue: issue.number, handoff_version: "2", phase: error.label.slice(8), owner_lease_id: null,
        error: error.message, error_code: error.code ?? null,
      }));
      await provisionalOperation("filesystem", "runtime-state", () => transitionLog(transitions, {
        issue: issue.number, from: "ready", to: error.label.slice(8), error: error.message, error_code: error.code ?? null,
      }));
    } catch {
      // Un contrato que tampoco declara la operación necesaria falla sin producir efectos.
    }
    return { issue: issue.number, status: error.label.slice(8), error: error.message, error_code: error.code ?? null };
  }
  const headRef = config.default_head_ref;
  const operation = (tipo, objetivo, handler, extras = {}) => executeDeclaredOperation(
    contract, { tipo, objetivo, paga: false, ...extras }, { [tipo]: handler },
  );
  let currentLabel = "handoff:ready";
  let state = stateFor(runtimeDir, issue.number);
  const lockPath = issueLockPath(runtimeDir, issue.number);
  const issueLeaseMs = context.issueLeaseMs ?? config.timeout_ms + 60_000;
  const lease = await operation("filesystem", "runtime-state", () => acquireLeaseLock(lockPath, { leaseMs: issueLeaseMs }));
  if (!lease.acquired) return { issue: issue.number, status: "locked" };
  let leaseLost = false;
  const stopHeartbeat = startLeaseHeartbeat(lockPath, lease.owner, {
    leaseMs: issueLeaseMs,
    intervalMs: context.issueHeartbeatMs ?? Math.max(1_000, Math.floor(issueLeaseMs / 3)),
    onLost: () => { leaseLost = true; },
    onError: () => { leaseLost = true; },
  });
  try {
    try {
      const remoteHead = await operation("github", "read", () => backend.currentHead(headRef));
      if (remoteHead !== contract.head_sha) fail(`HEAD movido: esperado ${contract.head_sha}; actual ${remoteHead}`, "handoff:stale");
      await operation("github", "state", () => backend.setState(issue.number, "handoff:ready", "handoff:running"));
      currentLabel = "handoff:running";
      state = {
        ...(state ?? {}), issue: issue.number, handoff_version: "2", owner_lease_id: lease.owner.lease_id,
        phase: state?.phase === "recovered" ? (state.previous_phase ?? "running") : (state?.phase ?? "running"),
        recovery_count: state?.recovery_count ?? 0, head_sha: contract.head_sha,
      };
      await operation("filesystem", "runtime-state", () => saveState(runtimeDir, issue.number, state));
      await operation("filesystem", "runtime-state", () => transitionLog(transitions, { issue: issue.number, from: "ready", to: "running", handoff_version: "2" }));
      if (hooks?.afterClaim) await hooks.afterClaim({ issue, contract, state });

      const runDir = state.run_dir ?? join(artifactsDir, `issue-${issue.number}-${contract.head_sha.slice(0, 12)}`);
      const previousResult = contract.resultado_previo
        ? await operation("github", "read", () => loadPreviousResult(backend, contract.resultado_previo))
        : null;
      const prepared = await operation("filesystem", "artifacts", () => prepareInput({ repo, contract, runDir, previousResult, run: guardedGitRun }));
      const marker = markerFor(issue.number, contract.head_sha, prepared.manifest.input_fingerprint);
      const resultPath = join(runDir, "result.validated.json");
      let result;
      let invocation = null;
      let viaBefore;
      let viaAfter;

      if (existsSync(resultPath) && ["result_persisted", "published"].includes(state.phase)) {
        result = validateResultV2(readJson(resultPath), contract, validationContext);
      } else {
        const adapter = { ...config.agents[agentKey], timeout_ms: config.timeout_ms };
        viaBefore = await operation("red", "auth-observation", () => observeVia(authObserver, agentKey, adapter));
        await operation("filesystem", "artifacts", () => writeJson(join(runDir, "via-before.json"), viaBefore));
        if (!viaBefore.valid) fail("La vía preflight no coincide o no es demostrable", "handoff:blocked-via");

        let reservation = null;
        if (contract.impacto_economico.tipo === "aplica") {
          reservation = await operation("filesystem", "economic-ledger", () => reserveEconomicBudget(contract, runtimeDir));
        }
        const snapshotVersioned = context.snapshotVersioned ?? (() => snapshotTrackedPaths(repo, guardedGitRun));
        const before = snapshotVersionedPaths(await snapshotVersioned());
        let invocationError;
        let mutationError;
        try {
          invocation = await executeDeclaredOperation(contract, {
            tipo: "red", objetivo: "invoke-agent", paga: contract.impacto_economico.tipo === "aplica",
            reserva_economica_id: reservation?.attempt_id,
          }, {
            red: () => invoke({ contract, adapter, prompt: prepared.prompt, runDir, run: context.run, env: buildChildEnv(), agentKey }),
          });
        } catch (error) {
          invocationError = error;
        } finally {
          const after = snapshotVersionedPaths(await snapshotVersioned());
          const mutations = detectPostMutations(before, after, contract);
          if (!mutations.valid) mutationError = new HandoffError(
            `Paths fuera del sobre: ${mutations.paths.join(", ")}`, "handoff:failed", mutations.code,
          );
          if (reservation) {
            const cost = observedInvocationCost(invocation);
            await operation("filesystem", "economic-ledger", () => reconcileEconomicBudget(
              runtimeDir, reservation, { atribuible: cost !== null, costo: cost },
            ));
          }
        }
        if (mutationError) throw mutationError;
        if (invocationError) throw invocationError;
        result = validateResultV2(invocation.result, contract, validationContext);
        await operation("filesystem", "artifacts", () => writeJson(resultPath, result));
        state = { ...state, phase: "result_persisted", previous_phase: "result_persisted", run_dir: runDir, marker };
        await operation("filesystem", "runtime-state", () => saveState(runtimeDir, issue.number, state));
        if (hooks?.afterPersist) await hooks.afterPersist({ issue, contract, state, result });
      }

      if (leaseLost) failV2("LEASE_PERDIDO", "El heartbeat perdió la identidad del lease");
      const remoteHeadAfter = await operation("github", "read", () => backend.currentHead(headRef));
      if (remoteHeadAfter !== contract.head_sha) fail(`HEAD movido durante la corrida: ${remoteHeadAfter}`, "handoff:stale");
      const adapter = { ...config.agents[agentKey], timeout_ms: config.timeout_ms };
      viaAfter = await operation("red", "auth-observation", () => observeVia(authObserver, agentKey, adapter));
      await operation("filesystem", "artifacts", () => writeJson(join(runDir, "via-observada.json"), viaAfter));
      if (!viaAfter.valid) fail("La vía observada no coincide o no es demostrable", "handoff:blocked-via");

      const { raw, body } = resultComment(marker, result);
      const comments = await operation("github", "read", () => backend.comments(issue.number));
      if (!comments.find((comment) => (comment.body ?? "").includes(marker))) {
        const bodyFile = join(runDir, "result-comment.md");
        await operation("filesystem", "artifacts", () => writeText(bodyFile, body));
        await operation("github", "publish", () => backend.publish(issue.number, bodyFile));
      }
      state = { ...state, phase: "published", previous_phase: "published", marker, result_sha256: sha256(Buffer.from(raw)) };
      await operation("filesystem", "runtime-state", () => saveState(runtimeDir, issue.number, state));

      let child = null;
      if (result.siguiente) {
        if (contract.profundidad_cadena >= config.max_relevos) fail("Siguiente relevo excede max_relevos", "handoff:blocked");
        const pointer = { issue: issue.number, marker, result_sha256: state.result_sha256 };
        const nextContract = childContractV2(contract, result, pointer);
        validateContractV2(nextContract, validationContext);
        const childId = childMarker(issue.number, contract.head_sha, prepared.manifest.input_fingerprint);
        child = await operation("github", "read", () => backend.findChild(childId));
        if (!child) {
          const childBody = `${childId}\n\n\`\`\`json\n${JSON.stringify(nextContract, null, 2)}\n\`\`\`\n`;
          const bodyFile = join(runDir, "child-issue.md");
          await operation("filesystem", "artifacts", () => writeText(bodyFile, childBody));
          child = await operation("github", "publish", () => backend.createIssue(
            `handoff v2: ${nextContract.destinatario.rol} / ${nextContract.head_sha.slice(0, 12)}`, bodyFile,
          ));
        }
        state = { ...state, child_issue: child.number };
        await operation("filesystem", "runtime-state", () => saveState(runtimeDir, issue.number, state));
      }

      await operation("github", "state", () => backend.setState(issue.number, "handoff:running", "handoff:done"));
      currentLabel = "handoff:done";
      await operation("filesystem", "runtime-state", () => saveState(runtimeDir, issue.number, { ...state, phase: "done", owner_lease_id: null }));
      await operation("filesystem", "runtime-state", () => transitionLog(transitions, { issue: issue.number, from: "running", to: "done", child_issue: child?.number ?? null, handoff_version: "2" }));
      await operation("filesystem", "artifacts", () => writeJson(join(runDir, "telemetry.json"), {
        issue: issue.number, handoff_version: "2", head_sha: contract.head_sha,
        input_fingerprint: prepared.manifest.input_fingerprint,
        prompt_sha256: prepared.manifest.files.find((entry) => entry.path === "prompt.md")?.sha256,
        via_before: viaBefore ?? "reused_result", via_after: viaAfter,
        duration_ms: invocation?.duration_ms ?? 0, invocation: invocation?.telemetry ?? null,
        result_sha256: state.result_sha256, child_issue: child?.number ?? null,
      }));
      return { issue: issue.number, status: "done", child_issue: child?.number ?? null };
    } catch (error) {
      if (error instanceof CrashSimulation) throw error;
      const label = error instanceof HandoffError ? error.label : "handoff:failed";
      if (!TERMINAL_LABELS.has(label)) throw error;
      if (currentLabel === "handoff:running" || currentLabel === "handoff:ready") {
        await operation("github", "state", () => backend.setState(issue.number, currentLabel, label));
        currentLabel = label;
      }
      const current = stateFor(runtimeDir, issue.number) ?? state ?? {};
      await operation("filesystem", "runtime-state", () => saveState(runtimeDir, issue.number, {
        ...current, phase: label.slice(8), owner_lease_id: null, error: error.message, error_code: error.code ?? null,
      }));
      await operation("filesystem", "runtime-state", () => transitionLog(transitions, {
        issue: issue.number, from: "running", to: label.slice(8), error: error.message, error_code: error.code ?? null,
      }));
      const adapter = config.agents[agentKey];
      return {
        issue: issue.number, status: label.slice(8), error: error.message, error_code: error.code ?? null,
        ...(label === "handoff:blocked-via" ? {
          failed_via: adapter?.authorized_via ?? null,
          authorized_fallback_via: adapter?.authorized_fallback_via ?? null,
        } : {}),
      };
    }
  } finally {
    stopHeartbeat();
    await operation("filesystem", "runtime-state", () => releaseLeaseLock(lockPath, lease.owner));
  }
}

async function processIssueV1(context, issue) {
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

export async function processIssue(context, issue) {
  const parsed = parseContractBody(issue.body);
  return parsed.handoff_version === "2"
    ? processIssueV2(context, issue, parsed)
    : processIssueV1(context, issue);
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
  const globalLease = acquireLeaseLock(globalLock, {
    leaseMs: options.lockLeaseMs ?? config.timeout_ms + 60_000,
    now: options.lockNow ?? Date.now(),
  });
  if (!globalLease.acquired) return { status: "locked", promovidas: [], poll: null };
  const stopGlobalHeartbeat = startLeaseHeartbeat(globalLock, globalLease.owner, {
    leaseMs: options.lockLeaseMs ?? config.timeout_ms + 60_000,
    intervalMs: options.lockHeartbeatMs,
  });
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
    stopGlobalHeartbeat();
    releaseLeaseLock(globalLock, globalLease.owner);
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
  const globalLease = acquireLeaseLock(globalLock, {
    leaseMs: options.lockLeaseMs ?? config.timeout_ms + 60_000,
    now: options.lockNow ?? Date.now(),
    ownerInstanceId: options.hooks?.crash_owner_instance_id,
  });
  if (!globalLease.acquired) return { status: "locked", processed: [] };
  const stopGlobalHeartbeat = startLeaseHeartbeat(globalLock, globalLease.owner, {
    leaseMs: options.lockLeaseMs ?? config.timeout_ms + 60_000,
    intervalMs: options.lockHeartbeatMs,
  });
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
    stopGlobalHeartbeat();
    if (!options.preserveGlobalLock) releaseLeaseLock(globalLock, globalLease.owner);
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
