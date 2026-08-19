export const GOVERNING_CONTEXT_V2 = Object.freeze([
  "reglas.md",
  "decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md",
  "equipo.md",
  "decisiones/README.md",
  "pendientes.md",
]);

export const HANDOFF_V2_DECISIONS = Object.freeze([
  "SIN_OBJECIONES",
  "OBJECION_MATERIAL",
  "REQUIERE_ARBITRAJE",
  "BLOQUEADO_POR_LIMITE",
  "BLOQUEADO_POR_GATE",
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
  "PR_INTEGRADA",
  "COMMIT",
  "ARTEFACTO_CON_HASH",
  "RESULTADO_VALIDADO",
]);

export const CONFINEMENT_EVIDENCE = Object.freeze([
  "NO_PROBADO",
  "PROBADO_LOCALMENTE",
  "VALIDADO_OPERATIVAMENTE",
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

const SIGNATURE_KEYS = Object.freeze([
  "ejecutor_real",
  "entorno",
  "modelo_configurado",
  "modelo_efectivo",
  "esfuerzo_o_modo_configurado",
  "esfuerzo_o_modo_efectivo",
  "sujeto_evaluado",
  "via_evaluada",
  "fecha",
]);

export class HandoffContractV2Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HandoffContractV2Error";
    this.code = code;
  }
}

function fail(code, message) {
  throw new HandoffContractV2Error(code, message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireKeys(value, keys, label) {
  if (!isObject(value)) fail("ESTRUCTURA_INVALIDA", `${label} debe ser objeto`);
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (missing.length) fail("CAMPO_REQUERIDO_AUSENTE", `${label} omite: ${missing.join(", ")}`);
}

function rejectExtras(value, keys, label) {
  const extras = Object.keys(value).filter((key) => !keys.includes(key));
  if (extras.length) fail("CAMPO_NO_ADMITIDO", `${label} contiene: ${extras.join(", ")}`);
}

function requireNonEmptyString(value, code, label) {
  if (typeof value !== "string" || !value.trim()) fail(code, `${label} debe ser string no vacío`);
}

function safeRelativePath(path) {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.startsWith("\\")) return false;
  const normalized = path.replaceAll("\\", "/");
  return !/^[A-Za-z]:\//.test(normalized) && !normalized.split("/").includes("..") && !normalized.includes("\0");
}

function registry(dependencies) {
  if (!isObject(dependencies?.actors) || !isObject(dependencies.actors.roles)) {
    fail("ACTORES_INVALIDOS", "El registro de actores debe inyectarse explícitamente");
  }
  return dependencies.actors;
}

function validateConfinement(actor, role) {
  requireKeys(actor, ["actor", "adapter", "capacidades", "confinamiento"], `actor ${role}`);
  if (!Array.isArray(actor.capacidades)) fail("ACTORES_INVALIDOS", `${role}.capacidades debe ser array`);
  requireKeys(actor.confinamiento, ["mecanismo", "evidencia"], `${role}.confinamiento`);
  if (!CONFINEMENT_EVIDENCE.includes(actor.confinamiento.evidencia)) {
    fail("CONFINAMIENTO_INVALIDO", `${role} declara evidencia de confinamiento inválida`);
  }
  requireNonEmptyString(actor.confinamiento.mecanismo, "CONFINAMIENTO_INVALIDO", `${role}.confinamiento.mecanismo`);
}

function resolveRole(role, requiredCapabilities, dependencies) {
  const actor = registry(dependencies).roles[role];
  if (!actor) fail("ROL_NO_RESUELTO", `Rol no configurado: ${role}`);
  validateConfinement(actor, role);
  const missing = requiredCapabilities.filter((capability) => !actor.capacidades.includes(capability));
  if (missing.length) fail("CAPACIDAD_ESTATICA_AUSENTE", `${role} carece de: ${missing.join(", ")}`);
  return actor;
}

function validateActorDescriptor(descriptor, authorizedContext, dependencies, label) {
  requireKeys(descriptor, ["rol", "capacidades_requeridas"], label);
  rejectExtras(descriptor, ["rol", "capacidades_requeridas"], label);
  if (!Array.isArray(descriptor.capacidades_requeridas)) {
    fail("ESTRUCTURA_INVALIDA", `${label}.capacidades_requeridas debe ser array`);
  }
  const actor = resolveRole(descriptor.rol, descriptor.capacidades_requeridas, dependencies);
  if (!authorizedContext.includes(actor.adapter)) fail("ADAPTER_FUERA_DE_CONTEXTO", actor.adapter);
  return actor;
}

function validateObjectDescriptor(value, label) {
  requireKeys(value, ["id", "descripcion"], label);
  rejectExtras(value, ["id", "descripcion"], label);
  requireNonEmptyString(value.id, "OBJETO_INVALIDO", `${label}.id`);
  requireNonEmptyString(value.descripcion, "OBJETO_INVALIDO", `${label}.descripcion`);
}

function validateEconomicImpact(impact) {
  requireKeys(impact, ["tipo"], "impacto_economico");
  if (impact.tipo === "no_aplica") {
    rejectExtras(impact, ["tipo"], "impacto_economico");
    return;
  }
  if (impact.tipo !== "aplica") fail("IMPACTO_ECONOMICO_INVALIDO", "tipo inválido");
  const keys = [
    "tipo", "objetivo_economico", "moneda", "cap_acumulado", "maximo_intento",
    "politica_costo_indeterminado",
  ];
  requireKeys(impact, keys, "impacto_economico");
  rejectExtras(impact, keys, "impacto_economico");
  requireNonEmptyString(impact.objetivo_economico, "IMPACTO_ECONOMICO_INVALIDO", "objetivo_economico");
  requireNonEmptyString(impact.moneda, "IMPACTO_ECONOMICO_INVALIDO", "moneda");
  for (const key of ["cap_acumulado", "maximo_intento"]) {
    if (typeof impact[key] !== "number" || !Number.isFinite(impact[key]) || impact[key] < 0) {
      fail("IMPACTO_ECONOMICO_INVALIDO", `${key} inválido`);
    }
  }
  if (impact.maximo_intento > impact.cap_acumulado) {
    fail("MAXIMO_INTENTO_EXCEDE_CAP", "El máximo del intento excede el cap acumulado autorizado");
  }
  if (impact.politica_costo_indeterminado !== "DETENER_SIN_REINTENTO") {
    fail("POLITICA_COSTO_INDETERMINADO_INVALIDA", "Costo indeterminado debe detener sin reintento");
  }
}

function validateDelegations(entries, dependencies) {
  if (!Array.isArray(entries)) fail("ESTRUCTURA_INVALIDA", "operaciones_delegadas_a_humanos debe ser array");
  if (typeof dependencies?.resolveCanonicalReference !== "function") {
    fail("RESOLVER_REFERENCIA_REQUERIDO", "resolveCanonicalReference debe inyectarse explícitamente");
  }
  for (const entry of entries) {
    const keys = [
      "categoria", "referencia_canonica", "condicion_observable",
      "actor_o_capacidad_requerida", "naturaleza", "explicacion",
    ];
    requireKeys(entry, keys.slice(0, 5), "operación delegada");
    rejectExtras(entry, keys, "operación delegada");
    if (!HANDOFF_V2_HUMAN_CATEGORIES.includes(entry.categoria)) {
      fail("CATEGORIA_ESCALAMIENTO_INVALIDA", entry.categoria);
    }
    requireNonEmptyString(entry.condicion_observable, "CONDICION_OBSERVABLE_INVALIDA", "condicion_observable");
    requireNonEmptyString(entry.actor_o_capacidad_requerida, "CAPACIDAD_REQUERIDA_INVALIDA", "actor_o_capacidad_requerida");
    const actors = Object.entries(registry(dependencies).roles);
    const staticallyResolvable = actors.some(([role, actor]) => (
      role === entry.actor_o_capacidad_requerida
      || actor.actor === entry.actor_o_capacidad_requerida
      || actor.capacidades.includes(entry.actor_o_capacidad_requerida)
    ));
    if (!staticallyResolvable) {
      fail("CAPACIDAD_ESTATICA_AUSENTE", entry.actor_o_capacidad_requerida);
    }
    if (dependencies.resolveCanonicalReference(entry.referencia_canonica) !== true) {
      fail("REFERENCIA_CANONICA_NO_RESUELTA", entry.referencia_canonica);
    }
    if (entry.referencia_canonica !== HUMAN_CATEGORY_REFERENCE[entry.categoria]) {
      fail("REFERENCIA_CANONICA_INCOMPATIBLE", entry.categoria);
    }
    if (entry.naturaleza === "OPERACION_RUTINARIA") {
      fail("DELEGACION_RUTINARIA_PROHIBIDA", "Una operación rutinaria no se delega al Director");
    }
    if (HUMAN_CATEGORY_NATURE[entry.categoria] !== entry.naturaleza) {
      fail("CATEGORIA_INCOMPATIBLE_CON_OPERACION", entry.categoria);
    }
  }
}

function validateCanonicalState(state, dependencies) {
  const keys = ["accion_anterior", "evidencia_cierre", "proxima_accion", "head_reconciliacion"];
  requireKeys(state, keys, "estado_canonico");
  rejectExtras(state, keys, "estado_canonico");
  validateObjectDescriptor(state.accion_anterior, "estado_canonico.accion_anterior");
  validateObjectDescriptor(state.proxima_accion, "estado_canonico.proxima_accion");
  if (state.accion_anterior.id === state.proxima_accion.id) {
    fail("ESTADO_CANONICO_DIVERGENTE", "La próxima acción ya fue declarada cerrada");
  }
  requireKeys(state.evidencia_cierre, ["tipo", "referencia", "head_o_historial"], "evidencia_cierre");
  rejectExtras(state.evidencia_cierre, ["tipo", "referencia", "head_o_historial"], "evidencia_cierre");
  if (!HANDOFF_V2_EVIDENCE_TYPES.includes(state.evidencia_cierre.tipo)) {
    fail("EVIDENCIA_CIERRE_INVALIDA", "Tipo de evidencia inválido");
  }
  if (typeof dependencies?.resolveEvidence !== "function") {
    fail("RESOLVER_EVIDENCIA_REQUERIDO", "resolveEvidence debe inyectarse explícitamente");
  }
  if (dependencies.resolveEvidence(state.evidencia_cierre, state.head_reconciliacion) !== true) {
    fail("EVIDENCIA_CIERRE_NO_RESUELTA", state.evidencia_cierre.referencia);
  }
  if (!/^[0-9a-f]{40}$/.test(state.head_reconciliacion ?? "")) {
    fail("HEAD_RECONCILIACION_INVALIDO", "HEAD de reconciliación inválido");
  }
}

function validateExecutionConfinement(contract, recipientActor) {
  if (contract.modo !== "ejecucion") return;
  const evidenceIndex = CONFINEMENT_EVIDENCE.indexOf(recipientActor.confinamiento.evidencia);
  if (evidenceIndex < CONFINEMENT_EVIDENCE.indexOf("PROBADO_LOCALMENTE")) {
    fail("CONFINAMIENTO_NO_PROBADO", `${contract.destinatario.rol} no tiene confinamiento PROBADO_LOCALMENTE`);
  }
}

export function validateContractV2(contract, dependencies = {}) {
  if (!isObject(contract)) fail("ESTRUCTURA_INVALIDA", "Contrato no es objeto");
  if (contract.handoff_version !== "2") {
    fail("CONTRATO_VERSION_NO_SOPORTADA", `handoff_version ${contract.handoff_version ?? "ausente"} no se migra ni reinterpreta`);
  }
  const keys = [
    "handoff_version", "tarea", "head_sha", "contexto_autorizado", "origen", "destinatario",
    "modo", "objeto_entrada", "objeto_producido", "mutaciones_permitidas", "operaciones_permitidas",
    "impacto_economico", "reintentos", "transiciones_permitidas", "estado_canonico",
    "operaciones_delegadas_a_humanos",
  ];
  requireKeys(contract, keys, "contrato v2");
  rejectExtras(contract, keys, "contrato v2");
  requireNonEmptyString(contract.tarea, "TAREA_INVALIDA", "tarea");
  if (!/^[0-9a-f]{40}$/.test(contract.head_sha ?? "")) fail("HEAD_INVALIDO", "head_sha inválido");
  if (!Array.isArray(contract.contexto_autorizado) || contract.contexto_autorizado.some((path) => !safeRelativePath(path))) {
    fail("CONTEXTO_INVALIDO", "contexto_autorizado inválido");
  }
  if (new Set(contract.contexto_autorizado).size !== contract.contexto_autorizado.length) {
    fail("CONTEXTO_INVALIDO", "contexto_autorizado contiene duplicados");
  }
  const missingContext = GOVERNING_CONTEXT_V2.filter((path) => !contract.contexto_autorizado.includes(path));
  if (missingContext.length) fail("CANON_GOBERNANTE_AUSENTE", missingContext.join(", "));
  requireKeys(contract.origen, ["ejecutor", "rol"], "origen");
  rejectExtras(contract.origen, ["ejecutor", "rol"], "origen");
  const origin = resolveRole(contract.origen.rol, [], dependencies);
  if (origin.actor !== contract.origen.ejecutor) fail("ORIGEN_NO_RESUELTO", "Actor y rol de origen no corresponden");
  if (!contract.contexto_autorizado.includes(origin.adapter)) fail("ADAPTER_FUERA_DE_CONTEXTO", origin.adapter);
  const recipient = validateActorDescriptor(contract.destinatario, contract.contexto_autorizado, dependencies, "destinatario");
  if (!["solo_lectura", "ejecucion"].includes(contract.modo)) fail("MODO_INVALIDO", contract.modo);
  validateExecutionConfinement(contract, recipient);
  validateObjectDescriptor(contract.objeto_entrada, "objeto_entrada");
  validateObjectDescriptor(contract.objeto_producido, "objeto_producido");
  if (!Array.isArray(contract.mutaciones_permitidas) || contract.mutaciones_permitidas.some((path) => !safeRelativePath(path))) {
    fail("MUTACIONES_INVALIDAS", "mutaciones_permitidas inválidas");
  }
  if (contract.modo === "solo_lectura" && contract.mutaciones_permitidas.length) {
    fail("SOLO_LECTURA_CON_MUTACIONES", "solo_lectura no admite mutaciones versionadas");
  }
  if (!Array.isArray(contract.operaciones_permitidas)) fail("OPERACIONES_INVALIDAS", "operaciones_permitidas debe ser array");
  for (const operation of contract.operaciones_permitidas) {
    requireKeys(operation, ["tipo", "objetivo"], "operación permitida");
    rejectExtras(operation, ["tipo", "objetivo"], "operación permitida");
    if (!["git", "github", "red", "filesystem"].includes(operation.tipo)) fail("OPERACION_INVALIDA", operation.tipo);
    requireNonEmptyString(operation.objetivo, "OPERACION_INVALIDA", "operación.objetivo");
  }
  validateEconomicImpact(contract.impacto_economico);
  requireKeys(contract.reintentos, ["maximos", "politica_costo_indeterminado"], "reintentos");
  rejectExtras(contract.reintentos, ["maximos", "politica_costo_indeterminado"], "reintentos");
  if (contract.reintentos.maximos !== 0) fail("REINTENTOS_INVALIDOS", "v2 exige máximo cero");
  if (contract.reintentos.politica_costo_indeterminado !== "DETENER_SIN_REINTENTO") {
    fail("REINTENTOS_INVALIDOS", "Costo indeterminado debe detener sin reintento");
  }
  if (!Array.isArray(contract.transiciones_permitidas)) fail("TRANSICIONES_INVALIDAS", "transiciones_permitidas debe ser array");
  validateDelegations(contract.operaciones_delegadas_a_humanos, dependencies);
  validateCanonicalState(contract.estado_canonico, dependencies);
  return contract;
}

export function validateResultV2(result, contract, dependencies = {}) {
  if (!isObject(result)) fail("RESULTADO_INVALIDO", "Resultado no es objeto");
  if (result.handoff_version !== "2") fail("CONTRATO_VERSION_NO_SOPORTADA", "Resultado no es v2");
  const keys = ["handoff_version", "estado", "decision", "resumen", "evidencia", "archivos_leidos", "siguiente", "firma"];
  requireKeys(result, keys, "resultado v2");
  rejectExtras(result, keys, "resultado v2");
  if (!HANDOFF_V2_DECISIONS.includes(result.decision)) fail("DECISION_INVALIDA", result.decision);
  requireNonEmptyString(result.resumen, "RESUMEN_INVALIDO", "resumen");
  if (DECISION_STATE[result.decision] !== result.estado) fail("DECISION_ESTADO_INCOMPATIBLE", "decision y estado no corresponden");
  if (result.decision !== "SIN_OBJECIONES" && result.siguiente === null) fail("SIGUIENTE_REQUERIDO", "La decisión exige siguiente");
  if (!Array.isArray(result.evidencia)) fail("EVIDENCIA_INVALIDA", "evidencia debe ser array");
  for (const item of result.evidencia) {
    requireKeys(item, ["archivo", "detalle"], "evidencia");
    rejectExtras(item, ["archivo", "detalle"], "evidencia");
    requireNonEmptyString(item.archivo, "EVIDENCIA_INVALIDA", "evidencia.archivo");
    requireNonEmptyString(item.detalle, "EVIDENCIA_INVALIDA", "evidencia.detalle");
  }
  if (!Array.isArray(result.archivos_leidos) || result.archivos_leidos.some((path) => !contract.contexto_autorizado.includes(path))) {
    fail("ARCHIVOS_LEIDOS_FUERA_DE_CONTEXTO", "archivos_leidos inválido");
  }
  if (result.siguiente !== null) {
    const next = validateActorDescriptor(result.siguiente, contract.contexto_autorizado, dependencies, "siguiente");
    if (result.decision === "REQUIERE_ARBITRAJE" && !next.capacidades.includes("arbitraje")) {
      fail("SIGUIENTE_SIN_AUTORIDAD", "El siguiente no tiene capacidad de arbitraje");
    }
    const transition = `${result.estado}->${result.siguiente.rol}`;
    if (!contract.transiciones_permitidas.includes(transition)) fail("TRANSICION_NO_PERMITIDA", transition);
  }
  requireKeys(result.firma, SIGNATURE_KEYS, "firma");
  rejectExtras(result.firma, SIGNATURE_KEYS, "firma");
  for (const key of SIGNATURE_KEYS) requireNonEmptyString(result.firma[key], "FIRMA_INCOMPLETA", key);
  return result;
}
