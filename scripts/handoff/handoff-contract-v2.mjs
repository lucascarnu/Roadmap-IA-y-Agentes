export const GOVERNING_CONTEXT_V2 = Object.freeze(["reglas.md", "decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md", "equipo.md", "decisiones/README.md", "pendientes.md"]);
export const HANDOFF_V2_DECISIONS = Object.freeze(["SIN_OBJECIONES", "OBJECION_MATERIAL", "REQUIERE_ARBITRAJE", "BLOQUEADO_POR_LIMITE", "BLOQUEADO_POR_GATE"]);
export const HANDOFF_V2_ROLE_IDS = Object.freeze(["DIRECTOR_PRODUCT_OWNER", "ARQUITECTO_LEAD", "EJECUTOR_PRINCIPAL", "REVIEWER_INDEPENDIENTE", "QA_VALIDACION", "CONSULTOR_AUDITOR", "ESPECIALISTAS_BAJO_DEMANDA"]);
export const HANDOFF_V2_HUMAN_CATEGORIES = Object.freeze(["CAMBIO_DE_PRODUCTO_ALCANCE_O_INTENCION", "COSTO_RELEVANTE_O_PAYG", "PRIVACIDAD_O_SEGURIDAD_ACEPTADA", "ACCION_IRREVERSIBLE_O_IMPACTO_EXTERNO", "ALTERNATIVAS_MATERIALES_NO_RESUELTAS_POR_EVIDENCIA", "CONTRADICCION_CON_INSTRUCCION_DEL_DIRECTOR", "EVIDENCIA_INSUFICIENTE_PARA_GATE_OBLIGATORIO", "ACCION_FISICA_O_AUTORIZACION_NO_AUTOMATIZABLE"]);
export const HANDOFF_V2_EVIDENCE_TYPES = Object.freeze(["PR_INTEGRADA", "COMMIT", "ARTEFACTO_CON_HASH", "RESULTADO_VALIDADO"]);
export const CONFINEMENT_EVIDENCE = Object.freeze(["NO_PROBADO", "PROBADO_LOCALMENTE", "VALIDADO_OPERATIVAMENTE"]);
export const PROFILE_MODES = Object.freeze({ manual: ["solo_lectura", "ejecucion"], github_close: ["solo_lectura", "ejecucion"], puente: ["solo_lectura"], review: ["solo_lectura"] });

const DECISION_STATE = Object.freeze({ SIN_OBJECIONES: "COMPLETADO", OBJECION_MATERIAL: "COMPLETADO", REQUIERE_ARBITRAJE: "COMPLETADO", BLOQUEADO_POR_LIMITE: "BLOQUEADO", BLOQUEADO_POR_GATE: "BLOQUEADO" });
const HUMAN_REFERENCE = "decisiones/0013-delegar-cierre-operativo-y-merge-rutinario.md#cuando-si-se-escala-al-director";
const PHYSICAL_REFERENCE = "pendientes.md#calibracion-experimental-de-profundidad-modelos-y-costo";
const SIGNATURE_KEYS = Object.freeze(["ejecutor_real", "entorno", "modelo_configurado", "modelo_efectivo", "esfuerzo_o_modo_configurado", "esfuerzo_o_modo_efectivo", "sujeto_evaluado", "via_evaluada", "fecha"]);
const EXACT_ALIASES = Object.freeze({
  "Codex Arquitecto": { role_id: "ARQUITECTO_LEAD", surface_id: "codex-arquitecto" },
  "Codex": { role_id: "EJECUTOR_PRINCIPAL", surface_id: "codex-ejecutor" },
  "Codex Consultor": { role_id: "CONSULTOR_AUDITOR", surface_id: "codex-consultor" },
  "Claude": { role_id: "ESPECIALISTAS_BAJO_DEMANDA", surface_id: "claude-especialista" },
  "Kimi": { role_id: "REVIEWER_INDEPENDIENTE", surface_id: "kimi-reviewer" },
});

export class HandoffContractV2Error extends Error { constructor(code, message) { super(message); this.name = "HandoffContractV2Error"; this.code = code; } }
function fail(code, message) { throw new HandoffContractV2Error(code, message); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function keys(value, required, allowed, label) { if (!object(value)) fail("ESTRUCTURA_INVALIDA", `${label} debe ser objeto`); const missing = required.filter((key) => !Object.hasOwn(value, key)); if (missing.length) fail("CAMPO_REQUERIDO_AUSENTE", `${label} omite: ${missing.join(", ")}`); const extras = Object.keys(value).filter((key) => !allowed.includes(key)); if (extras.length) fail("CAMPO_NO_ADMITIDO", `${label} contiene: ${extras.join(", ")}`); }
function text(value, code, label) { if (typeof value !== "string" || !value.trim()) fail(code, `${label} debe ser texto no vacío`); }
function relative(path) { if (typeof path !== "string" || !path || path.startsWith("/") || path.startsWith("\\")) return false; const normalized = path.replaceAll("\\", "/"); return !/^[A-Za-z]:\//.test(normalized) && !normalized.split("/").includes("..") && !normalized.includes("\0"); }
function sha40(value) { return typeof value === "string" && /^[0-9a-f]{40}$/.test(value); }
function sha256(value) { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); }
function utf8Bytes(value) { return new TextEncoder().encode(value).byteLength; }
function deps(input) { if (!object(input?.catalog) || !object(input.catalog.roles)) fail("CATALOGO_INVALIDO", "El catálogo durable debe inyectarse"); if (!object(input?.registry) || input.registry.version !== "2" || !object(input.registry.surfaces)) fail("REGISTRO_INVALIDO", "El registro operacional v2 debe inyectarse"); return input; }

export function validateRoleCatalog(catalog) {
  if (!object(catalog) || catalog.version !== "1" || !object(catalog.roles)) fail("CATALOGO_INVALIDO", "Catálogo inválido");
  const actual = Object.keys(catalog.roles).sort(); const expected = [...HANDOFF_V2_ROLE_IDS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail("CATALOGO_DERIVA", "El catálogo debe proyectar exactamente los siete roles de 0016");
  for (const [role, entry] of Object.entries(catalog.roles)) { keys(entry, ["canonical_name", "capabilities", "incompatibilities"], ["canonical_name", "capabilities", "incompatibilities"], role); if (!Array.isArray(entry.capabilities) || !Array.isArray(entry.incompatibilities)) fail("CATALOGO_INVALIDO", role); for (const forbidden of ["actor", "occupant", "provider", "model", "cwd", "adapter", "evidence"]) if (Object.hasOwn(entry, forbidden)) fail("CATALOGO_CONTAMINADO", `${role}.${forbidden}`); }
  return catalog;
}

export function validateOperationalRegistry(registry, catalog) {
  validateRoleCatalog(catalog); if (!object(registry) || registry.version !== "2" || !object(registry.surfaces)) fail("REGISTRO_INVALIDO", "Registro v2 inválido");
  for (const [surfaceId, surface] of Object.entries(registry.surfaces)) {
    const required = ["role_id", "assignment_ref", "adapter", "cwd", "surface_type", "invocable", "observed_capabilities", "authorization", "authentication", "compatibility", "operational_profile", "confinement", "provenance"];
    keys(surface, required, required, surfaceId); if (!catalog.roles[surface.role_id]) fail("ROL_NO_RESUELTO", surface.role_id); if (surface.assignment_ref !== "equipo.md") fail("ASIGNACION_NO_CANONICA", surfaceId);
    if (!Array.isArray(surface.observed_capabilities)) fail("REGISTRO_INVALIDO", `${surfaceId}.observed_capabilities`); if (surface.confinement?.evidence !== "NO_PROBADO" || surface.confinement?.mechanism !== "NO_CONFIGURADO") fail("CONFINAMIENTO_INVALIDO", surfaceId);
  }
  return registry;
}

function surfacesFor(roleId, registry) { return Object.entries(registry.surfaces).filter(([, surface]) => surface.role_id === roleId); }
export function resolveCanonicalIdentity(identity, dependencies = {}, options = {}) {
  const d = deps(dependencies); validateRoleCatalog(d.catalog); validateOperationalRegistry(d.registry, d.catalog);
  keys(identity, ["role_id", "surface_id"], ["role_id", "surface_id"], "identidad");
  if (!d.catalog.roles[identity.role_id]) fail("ROL_NO_RESUELTO", identity.role_id);
  if (!identity.surface_id) { const matches = surfacesFor(identity.role_id, d.registry); if (matches.length === 0) fail("ROL_NO_CONFIGURADO", identity.role_id); if (matches.length !== 1) fail("ROL_AMBIGUO", identity.role_id); identity = { ...identity, surface_id: matches[0][0] }; }
  const surface = d.registry.surfaces[identity.surface_id]; if (!surface) { if (surfacesFor(identity.role_id, d.registry).length === 0) fail("ROL_NO_CONFIGURADO", identity.role_id); fail("ROL_NO_RESUELTO", identity.surface_id); }
  if (surface.role_id !== identity.role_id) fail("ROL_INCOMPATIBLE", `${identity.role_id}/${identity.surface_id}`);
  if (options.requireInvocable && !surface.invocable) fail("OPERACION_NO_AUTORIZADA", `${identity.surface_id} no es invocable`);
  return surface;
}

export function resolveBoundaryIdentity(input, effective = {}, dependencies = {}) {
  if (object(input) && input.role_id) return { role_id: input.role_id, surface_id: input.surface_id };
  let alias = typeof input === "string" ? input : input?.literal; const declaredRole = object(input) ? input.DESTINATARIO_ROLE_ID : undefined;
  if (typeof alias !== "string" || !alias.trim()) fail("ROL_NO_RESUELTO", "Alias ausente"); alias = alias.replace(/^CODEX — /, "Codex ").replace(/^CLAUDE — /, "Claude ").replace(/^KIMI — /, "Kimi ");
  const literalProfiles = { "Codex ARQUITECTO / LEAD": "Codex Arquitecto", "Codex EJECUTOR PRINCIPAL": "Codex", "Codex CONSULTOR / AUDITOR DE CONTINUIDAD Y COHERENCIA": "Codex Consultor", "Claude ESPECIALISTAS BAJO DEMANDA": "Claude", "Kimi REVIEWER INDEPENDIENTE": "Kimi" };
  alias = literalProfiles[alias] ?? alias;
  if (alias.toLowerCase() === "codex") {
    const candidates = Object.entries(dependencies.registry?.surfaces ?? {}).filter(([, surface]) => surface.surface_type === "CODEX_DESKTOP" && surface.adapter === effective.adapter && surface.cwd === effective.cwd);
    if (candidates.length !== 1) fail("ROL_AMBIGUO", "codex exige adapter y cwd efectivos únicos"); const [surface_id, surface] = candidates[0]; if (declaredRole && declaredRole !== surface.role_id) fail("ROL_INCOMPATIBLE", declaredRole); return { role_id: surface.role_id, surface_id };
  }
  const normalized = Object.entries(EXACT_ALIASES).find(([key]) => alias === key || alias.startsWith(`${key} `))?.[1]; if (!normalized) fail("ROL_NO_RESUELTO", alias); if (declaredRole && declaredRole !== normalized.role_id) fail("ROL_INCOMPATIBLE", declaredRole); return { ...normalized };
}
export function projectV1Alias(identity) { const entry = Object.entries(EXACT_ALIASES).find(([, value]) => value.role_id === identity.role_id && value.surface_id === identity.surface_id); if (!entry) fail("ROL_NO_RESUELTO", `${identity.role_id}/${identity.surface_id}`); return entry[0]; }

function validateTarget(target, context, dependencies, options = {}) {
  keys(target, ["role_id", "surface_id", "required_capabilities"], ["role_id", "surface_id", "required_capabilities"], "destinatario"); if (!Array.isArray(target.required_capabilities)) fail("ESTRUCTURA_INVALIDA", "required_capabilities");
  const surface = resolveCanonicalIdentity({ role_id: target.role_id, surface_id: target.surface_id }, dependencies, options); const missing = target.required_capabilities.filter((capability) => !surface.observed_capabilities.includes(capability)); if (missing.length) fail("CAPACIDAD_NO_DISPONIBLE", missing.join(", ")); if (!context.includes(surface.adapter)) fail("ADAPTER_FUERA_DE_CONTEXTO", surface.adapter); return surface;
}
function validateOperationReadiness(contract, surface) {
  const modes = PROFILE_MODES[contract.profile_id]; if (!modes || !modes.includes(contract.modo) || surface.operational_profile.profile_id !== contract.profile_id) fail("ROL_INCOMPATIBLE", `${contract.profile_id}/${surface.operational_profile.profile_id}`);
  if (contract.modo === "ejecucion" && (!surface.operational_profile.evidence || surface.operational_profile.evidence.startsWith("NO_"))) fail("CAPACIDAD_NO_DISPONIBLE", `baseline ${contract.profile_id}`);
  const requiredOps = [...new Set([contract.modo, ...contract.operaciones_permitidas.map((item) => item.tipo)])];
  for (const operation of requiredOps) {
    if (!surface.authorization.operations.includes(operation) || surface.authorization.status !== "AUTORIZADO") fail("OPERACION_NO_AUTORIZADA", operation);
    if (!surface.compatibility.operations.includes(operation) || surface.compatibility.status !== "COMPATIBLE") fail("ROL_INCOMPATIBLE", operation);
    if (surface.authentication.status === "NO_AUTENTICADA" || (surface.authentication.routes.includes(operation) && surface.authentication.status !== "AUTENTICADA")) fail("VIA_NO_AUTENTICADA", operation);
  }
  if (contract.modo === "ejecucion") { if (!surface.invocable) fail("OPERACION_NO_AUTORIZADA", "superficie no invocable"); if (!contract.mutaciones_permitidas.length && !contract.operaciones_permitidas.length) fail("OPERACION_NO_AUTORIZADA", "ejecución sin efectos declarados"); if (contract.rollback.strategy === "NO_APLICA" || !contract.postcondiciones.length) fail("OPERACION_NO_AUTORIZADA", "ejecución sin rollback/postcondición"); }
}
function descriptor(value, label) { keys(value, ["id", "descripcion"], ["id", "descripcion"], label); text(value.id, "OBJETO_INVALIDO", `${label}.id`); text(value.descripcion, "OBJETO_INVALIDO", `${label}.descripcion`); }
function economic(value) { keys(value, ["tipo"], value?.tipo === "aplica" ? ["tipo", "objetivo_economico", "moneda", "cap_acumulado", "maximo_intento", "politica_costo_indeterminado"] : ["tipo"], "impacto_economico"); if (value.tipo === "no_aplica") return; if (value.tipo !== "aplica") fail("IMPACTO_ECONOMICO_INVALIDO", value.tipo); for (const key of ["objetivo_economico", "moneda", "cap_acumulado", "maximo_intento", "politica_costo_indeterminado"]) if (!Object.hasOwn(value, key)) fail("CAMPO_REQUERIDO_AUSENTE", key); if (value.maximo_intento > value.cap_acumulado) fail("MAXIMO_INTENTO_EXCEDE_CAP", "máximo excede cap"); }
function canonicalState(value, dependencies) { keys(value, ["accion_anterior", "evidencia_cierre", "proxima_accion", "head_reconciliacion"], ["accion_anterior", "evidencia_cierre", "proxima_accion", "head_reconciliacion"], "estado_canonico"); descriptor(value.accion_anterior, "accion_anterior"); descriptor(value.proxima_accion, "proxima_accion"); if (value.accion_anterior.id === value.proxima_accion.id) fail("ESTADO_CANONICO_DIVERGENTE", value.accion_anterior.id); if (!HANDOFF_V2_EVIDENCE_TYPES.includes(value.evidencia_cierre?.tipo)) fail("EVIDENCIA_CIERRE_INVALIDA", "tipo"); if (!sha40(value.head_reconciliacion)) fail("HEAD_RECONCILIACION_INVALIDO", "head"); if (typeof dependencies.resolveEvidence !== "function" || dependencies.resolveEvidence(value.evidencia_cierre, value.head_reconciliacion) !== true) fail("EVIDENCIA_CIERRE_NO_RESUELTA", "evidencia"); }
function delegations(entries, dependencies) { if (!Array.isArray(entries)) fail("ESTRUCTURA_INVALIDA", "delegaciones"); for (const entry of entries) { if (!HANDOFF_V2_HUMAN_CATEGORIES.includes(entry.categoria)) fail("CATEGORIA_ESCALAMIENTO_INVALIDA", entry.categoria); if (entry.naturaleza === "OPERACION_RUTINARIA") fail("DELEGACION_RUTINARIA_PROHIBIDA", "rutina"); const expected = entry.categoria === "ACCION_FISICA_O_AUTORIZACION_NO_AUTOMATIZABLE" ? PHYSICAL_REFERENCE : HUMAN_REFERENCE; if (entry.referencia_canonica !== expected || dependencies.resolveCanonicalReference?.(entry.referencia_canonica) !== true) fail("REFERENCIA_CANONICA_NO_RESUELTA", entry.referencia_canonica); const director = resolveCanonicalIdentity({ role_id: "DIRECTOR_PRODUCT_OWNER", surface_id: "director-humano" }, dependencies); if (!director.observed_capabilities.includes(entry.actor_o_capacidad_requerida)) fail("CAPACIDAD_NO_DISPONIBLE", entry.actor_o_capacidad_requerida); } }

export function validateContractV2(contract, dependencies = {}) {
  deps(dependencies); if (!object(contract)) fail("ESTRUCTURA_INVALIDA", "Contrato no es objeto"); if (contract.handoff_version !== "2") fail("CONTRATO_VERSION_NO_SOPORTADA", "v1 no se reinterpreta");
  const required = ["handoff_version", "artifact_id", "tarea", "head_sha", "profile_id", "contexto_autorizado", "origen", "destinatario", "modo", "salida_requerida", "objeto_entrada", "objeto_producido", "mutaciones_permitidas", "operaciones_permitidas", "acciones_prohibidas", "rollback", "postcondiciones", "disparadores_0015", "impacto_economico", "reintentos", "transiciones_permitidas", "estado_canonico", "operaciones_delegadas_a_humanos"];
  keys(contract, required, required, "contrato v2"); text(contract.artifact_id, "OBJETO_INVALIDO", "artifact_id"); text(contract.tarea, "TAREA_INVALIDA", "tarea"); text(contract.salida_requerida, "SALIDA_REQUERIDA_INVALIDA", "salida_requerida"); if (!sha40(contract.head_sha)) fail("HEAD_INVALIDO", "head_sha");
  if (!Array.isArray(contract.contexto_autorizado) || contract.contexto_autorizado.some((path) => !relative(path)) || new Set(contract.contexto_autorizado).size !== contract.contexto_autorizado.length) fail("CONTEXTO_INVALIDO", "contexto"); const missing = GOVERNING_CONTEXT_V2.filter((path) => !contract.contexto_autorizado.includes(path)); if (missing.length) fail("CANON_GOBERNANTE_AUSENTE", missing.join(", "));
  const origin = resolveCanonicalIdentity(contract.origen, dependencies, { requireInvocable: false }); if (!contract.contexto_autorizado.includes(origin.adapter)) fail("ADAPTER_FUERA_DE_CONTEXTO", origin.adapter); const recipient = validateTarget(contract.destinatario, contract.contexto_autorizado, dependencies, { requireInvocable: true });
  if (!Array.isArray(contract.mutaciones_permitidas) || contract.mutaciones_permitidas.some((path) => !relative(path))) fail("MUTACIONES_INVALIDAS", "mutaciones"); if (!Array.isArray(contract.operaciones_permitidas) || !Array.isArray(contract.acciones_prohibidas) || !Array.isArray(contract.postcondiciones) || !Array.isArray(contract.disparadores_0015)) fail("ESTRUCTURA_INVALIDA", "efectos"); if (contract.modo === "solo_lectura" && contract.mutaciones_permitidas.length) fail("SOLO_LECTURA_CON_MUTACIONES", "mutaciones"); if (contract.disparadores_0015.length) fail("DISPARADOR_0015_ACTIVO", contract.disparadores_0015.join(", "));
  for (const item of contract.operaciones_permitidas) { keys(item, ["tipo", "objetivo"], ["tipo", "objetivo"], "operación"); } for (const item of contract.postcondiciones) descriptor(item, "postcondición"); keys(contract.rollback, ["strategy", "reference"], ["strategy", "reference"], "rollback"); validateOperationReadiness(contract, recipient);
  descriptor(contract.objeto_entrada, "objeto_entrada"); descriptor(contract.objeto_producido, "objeto_producido"); economic(contract.impacto_economico); if (contract.reintentos?.maximos !== 0 || contract.reintentos?.politica_costo_indeterminado !== "DETENER_SIN_REINTENTO") fail("REINTENTOS_INVALIDOS", "v2 exige cero"); if (!Array.isArray(contract.transiciones_permitidas)) fail("TRANSICIONES_INVALIDAS", "transiciones"); delegations(contract.operaciones_delegadas_a_humanos, dependencies); canonicalState(contract.estado_canonico, dependencies); return contract;
}

export function validateResultV2(result, contract, dependencies = {}, attempt) {
  if (!object(result) || result.handoff_version !== "2") fail("CONTRATO_VERSION_NO_SOPORTADA", "resultado no v2"); const required = ["handoff_version", "binding", "estado", "decision", "resumen", "evidencia", "archivos_leidos", "siguiente", "firma"]; keys(result, required, required, "resultado v2");
  if (!HANDOFF_V2_DECISIONS.includes(result.decision)) fail("DECISION_INVALIDA", result.decision); if (DECISION_STATE[result.decision] !== result.estado) fail("DECISION_ESTADO_INCOMPATIBLE", "estado"); if (result.decision !== "SIN_OBJECIONES" && result.siguiente === null) fail("SIGUIENTE_REQUERIDO", "siguiente");
  if (attempt) { validateAttemptV2(attempt, dependencies); for (const key of ["attempt_id", "artifact_id", "request_sha256", "manifest_sha256", "head_sha"]) if (result.binding?.[key] !== attempt[key]) fail("RESULTADO_INTENTO_NO_COINCIDE", key); } else keys(result.binding, ["attempt_id", "artifact_id", "request_sha256", "manifest_sha256", "head_sha"], ["attempt_id", "artifact_id", "request_sha256", "manifest_sha256", "head_sha"], "binding");
  if (!sha256(result.binding.request_sha256) || !sha256(result.binding.manifest_sha256) || !sha40(result.binding.head_sha)) fail("RESULTADO_INTENTO_NO_COINCIDE", "hashes de binding");
  if (result.binding.artifact_id !== contract.artifact_id || result.binding.head_sha !== contract.head_sha) fail("RESULTADO_INTENTO_NO_COINCIDE", "contrato"); if (!Array.isArray(result.archivos_leidos) || result.archivos_leidos.some((path) => !contract.contexto_autorizado.includes(path))) fail("ARCHIVOS_LEIDOS_FUERA_DE_CONTEXTO", "archivos");
  if (!Array.isArray(result.evidencia)) fail("EVIDENCIA_INVALIDA", "evidencia"); for (const item of result.evidencia) { keys(item, ["archivo", "detalle"], ["archivo", "detalle"], "evidencia"); text(item.archivo, "EVIDENCIA_INVALIDA", "archivo"); text(item.detalle, "EVIDENCIA_INVALIDA", "detalle"); }
  if (result.siguiente !== null) { const next = validateTarget(result.siguiente, contract.contexto_autorizado, dependencies, { requireInvocable: result.decision !== "REQUIERE_ARBITRAJE" }); if (result.decision === "REQUIERE_ARBITRAJE" && next.role_id !== "DIRECTOR_PRODUCT_OWNER") fail("SIGUIENTE_SIN_AUTORIDAD", "arbitraje"); const transition = `${result.estado}->${result.siguiente.role_id}`; if (!contract.transiciones_permitidas.includes(transition)) fail("TRANSICION_NO_PERMITIDA", transition); }
  keys(result.firma, SIGNATURE_KEYS, SIGNATURE_KEYS, "firma"); for (const key of SIGNATURE_KEYS) text(result.firma[key], "FIRMA_INCOMPLETA", key); return result;
}

export function validateProducerInventoryV2(inventory) { if (!object(inventory) || inventory.version !== "1" || !object(inventory.profiles)) fail("PRODUCTORES_INVALIDOS", "inventario"); if (JSON.stringify(Object.keys(inventory.profiles).sort()) !== JSON.stringify(Object.keys(PROFILE_MODES).sort())) fail("PRODUCTORES_INVALIDOS", "perfiles exactos"); for (const profile of Object.keys(PROFILE_MODES)) { const entries = inventory.profiles[profile]; if (!Array.isArray(entries) || !entries.length) fail("PRODUCTORES_INVALIDOS", profile); const ids = new Set(); for (const entry of entries) { keys(entry, ["producer_id", "kind", "path"], ["producer_id", "kind", "path"], "productor"); if (ids.has(entry.producer_id) || !relative(entry.path)) fail("PRODUCTORES_INVALIDOS", entry.producer_id); ids.add(entry.producer_id); } } return inventory; }
export function validateManifestV2(manifest, dependencies = {}) {
  const d = deps(dependencies); validateProducerInventoryV2(dependencies.producers); const required = ["artifact_id", "head_sha", "contract_sha256", "producer", "request", "sources", "producer_chain"]; keys(manifest, required, required, "manifiesto"); if (!sha40(manifest.head_sha) || dependencies.head_sha !== manifest.head_sha || !sha256(manifest.contract_sha256) || dependencies.contract_sha256 !== manifest.contract_sha256) fail("MANIFIESTO_INVALIDO", "hashes");
  const producerSurface = resolveCanonicalIdentity({ role_id: manifest.producer?.role_id, surface_id: manifest.producer?.surface_id }, d); if (producerSurface.adapter !== manifest.producer.adapter || producerSurface.cwd !== manifest.producer.cwd) fail("ROL_INCOMPATIBLE", "productor"); if (!sha256(manifest.request?.sha256) || manifest.request.bytes !== utf8Bytes(manifest.request.content) || dependencies.sha256?.(manifest.request.content) !== manifest.request.sha256) fail("REQUEST_NO_COINCIDE", "request exacto");
  const expectedChain = dependencies.producers.profiles[producerSurface.operational_profile.profile_id]; if (JSON.stringify(manifest.producer_chain) !== JSON.stringify(expectedChain.map((item) => ({ profile_id: producerSurface.operational_profile.profile_id, ...item })))) fail("PRODUCTORES_NO_COINCIDEN", "cadena");
  for (const source of manifest.sources) { if (!relative(source.path) || !sha256(source.sha256) || !Number.isInteger(source.bytes) || source.bytes < 0) fail("FUENTE_INVALIDA", source.path); if (source.kind === "versioned") { if (source.head_sha !== manifest.head_sha || dependencies.head_sha !== manifest.head_sha || dependencies.git_blob_oids?.[source.path] !== source.git_blob_oid || !sha40(source.git_blob_oid)) fail("BLOB_NO_COINCIDE", source.path); } else if (source.kind === "generated") { if (!expectedChain.some((item) => item.producer_id === source.producer_id)) fail("PRODUCTOR_NO_RESUELTO", source.producer_id); } else fail("FUENTE_INVALIDA", source.kind); }
  return manifest;
}
export function validateAttemptV2(attempt, dependencies = {}, manifest) { const required = ["attempt_id", "artifact_id", "request_sha256", "request_bytes", "role_id", "surface_id", "head_sha", "manifest_sha256"]; keys(attempt, required, required, "intento"); if (!sha256(attempt.request_sha256) || !sha256(attempt.manifest_sha256) || !sha40(attempt.head_sha) || !Number.isInteger(attempt.request_bytes) || attempt.request_bytes < 1) fail("INTENTO_INVALIDO", "hash/bytes"); resolveCanonicalIdentity({ role_id: attempt.role_id, surface_id: attempt.surface_id }, dependencies, { requireInvocable: true }); if (manifest && (attempt.artifact_id !== manifest.artifact_id || attempt.request_sha256 !== manifest.request.sha256 || attempt.request_bytes !== manifest.request.bytes || attempt.head_sha !== manifest.head_sha || attempt.manifest_sha256 !== dependencies.manifest_sha256)) fail("INTENTO_INVALIDO", "binding con manifiesto"); return attempt; }
export function exclusivityPathForRequest(requestSha256) { if (!sha256(requestSha256)) fail("REQUEST_INVALIDO", "sha256"); return `.handoff/v2/requests/${requestSha256}/lock`; }
export function projectContractV2ToV1(contract) { return { tarea: contract.tarea, head_sha: contract.head_sha, contexto_autorizado: [...contract.contexto_autorizado], origen: { ejecutor: projectV1Alias(contract.origen), rol: contract.origen.role_id }, destinatario: projectV1Alias(contract.destinatario), salida_requerida: contract.salida_requerida, modo: contract.modo }; }
