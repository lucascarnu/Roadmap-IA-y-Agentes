import { createHash } from "node:crypto";

export const COVERAGE_CANONICALIZATION_VERSION = "1";
export const COVERAGE_CATEGORIES = Object.freeze(["canon", "enumerations", "producers", "consumers", "schemas", "validators", "tests", "invariants"]);
export const COVERAGE_CLASSIFICATIONS = Object.freeze(["REQUERIDO_PARA_LA_TAREA", "REFERENCIA_DURABLE_RESOLUBLE", "CONTEXTO_NO_NECESARIO"]);

export class HandoffCoverageV2Error extends Error {
  constructor(code, message) { super(message); this.name = "HandoffCoverageV2Error"; this.code = code; }
}

const VERIFIED_PREFLIGHTS = new WeakSet();

function fail(code, message) { throw new HandoffCoverageV2Error(code, message); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, required, label) {
  if (!object(value) || Object.keys(value).sort().join("|") !== [...required].sort().join("|")) fail("COVERAGE_ESTRUCTURA_INVALIDA", label);
}
function text(value, label) { if (typeof value !== "string" || !value.trim()) fail("COVERAGE_ESTRUCTURA_INVALIDA", label); }
function sha(value, size) { return typeof value === "string" && new RegExp(`^[0-9a-f]{${size}}$`).test(value); }
function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function uniqueStrings(value, label) { if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item) || new Set(value).size !== value.length) fail("COVERAGE_SET_INVALIDO", label); }
function sorted(value) { return [...value].sort((left, right) => left.localeCompare(right)); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function same(left, right) { return stable(left) === stable(right); }
function indexExact(items, key, collisionCode = "COVERAGE_COLISIONADA") {
  if (!Array.isArray(items)) fail("COVERAGE_ESTRUCTURA_INVALIDA", key);
  const map = new Map();
  for (const item of items) { const id = item?.[key]; text(id, key); if (map.has(id)) fail(collisionCode, id); map.set(id, item); }
  return map;
}

function validatePolicyDocument(policy) {
  exact(policy, ["document_version", "policies"], "policy document");
  if (policy.document_version !== "1" || !Array.isArray(policy.policies) || !policy.policies.length) fail("COVERAGE_POLICY_INVALIDA", "document_version/policies");
  const keys = new Set(); const globalIds = new Set();
  for (const entry of policy.policies) {
    exact(entry, ["profile_id", "artifact_type", "version", "requirements", "models"], "policy entry");
    for (const field of ["profile_id", "artifact_type", "version"]) text(entry[field], field);
    const key = `${entry.profile_id}\0${entry.artifact_type}`; if (keys.has(key)) fail("COVERAGE_POLICY_COLISIONADA", key); keys.add(key);
    exact(entry.requirements, COVERAGE_CATEGORIES, "policy requirements");
    for (const category of COVERAGE_CATEGORIES) {
      if (!Array.isArray(entry.requirements[category])) fail("COVERAGE_POLICY_INVALIDA", category);
      for (const requirement of entry.requirements[category]) {
        exact(requirement, ["id", "classification", "locator", "search"], `requirement ${category}`);
        text(requirement.id, "requirement.id"); text(requirement.locator, "requirement.locator");
        if (globalIds.has(requirement.id)) fail("COVERAGE_POLICY_COLISIONADA", requirement.id); globalIds.add(requirement.id);
        if (!COVERAGE_CLASSIFICATIONS.includes(requirement.classification)) fail("COVERAGE_POLICY_INVALIDA", requirement.classification);
        exact(requirement.search, ["query", "expected_matches"], "requirement.search"); text(requirement.search.query, "search.query"); uniqueStrings(requirement.search.expected_matches, "search.expected_matches");
      }
    }
    exact(entry.models, ["counts", "facts", "decisions"], "policy models");
    for (const kind of ["counts", "facts", "decisions"]) {
      const models = indexExact(entry.models[kind], "id", "COVERAGE_POLICY_COLISIONADA");
      for (const model of models.values()) {
        const required = kind === "counts" ? ["id", "expected", "evidence_requirement_ids"] : ["id", "evidence_requirement_ids"];
        exact(model, required, `model.${kind}`); uniqueStrings(model.evidence_requirement_ids, `${model.id}.evidence`);
        if (model.evidence_requirement_ids.some((id) => !globalIds.has(id))) fail("COVERAGE_POLICY_INVALIDA", `${model.id}: evidencia desconocida`);
        if (kind === "counts" && (!Number.isInteger(model.expected) || model.expected < 0)) fail("COVERAGE_POLICY_INVALIDA", model.id);
      }
    }
  }
  return policy;
}

function requirementSets(policy) {
  return Object.fromEntries(COVERAGE_CATEGORIES.map((category) => [category, sorted(policy.requirements[category].map((item) => item.id))]));
}

function validateTreeEntry(entry, headSha, treeOid) {
  exact(entry, ["path", "head_sha", "git_tree_oid", "git_blob_oid", "sha256", "bytes", "content"], "tree entry");
  text(entry.path, "tree.path");
  const bytes = Buffer.from(entry.content ?? "", "utf8");
  if (entry.head_sha !== headSha || entry.git_tree_oid !== treeOid || !sha(entry.git_blob_oid, 40) || !sha(entry.sha256, 64)
    || !Number.isInteger(entry.bytes) || entry.bytes < 1 || typeof entry.content !== "string" || !entry.content
    || entry.bytes !== bytes.byteLength || entry.sha256 !== hash(bytes)) fail("COVERAGE_TREE_NO_COINCIDE", entry.path);
  return entry;
}

function validateModels(policy, assessments, requirementIds) {
  exact(assessments, ["counts", "facts", "decisions"], "assessments");
  for (const kind of ["counts", "facts", "decisions"]) {
    const expected = indexExact(policy.models[kind], "id", "COVERAGE_POLICY_COLISIONADA");
    const actual = indexExact(assessments[kind], "id");
    if (actual.size !== expected.size || [...actual.keys()].some((id) => !expected.has(id))) fail("COVERAGE_MODEL_NO_COINCIDE", kind);
    for (const [id, observed] of actual) {
      const model = expected.get(id); const keys = kind === "counts" ? ["id", "observed", "reconciled", "evidence_requirement_ids"] : kind === "decisions" ? ["id", "inferred", "evidence_requirement_ids"] : ["id", "evidence_requirement_ids"];
      exact(observed, keys, `assessment.${kind}.${id}`); uniqueStrings(observed.evidence_requirement_ids, `${id}.evidence`);
      if (!same(sorted(observed.evidence_requirement_ids), sorted(model.evidence_requirement_ids)) || observed.evidence_requirement_ids.some((item) => !requirementIds.has(item))) fail("COVERAGE_MODEL_NO_COINCIDE", `${id}: evidencia`);
      if (kind === "counts" && (observed.reconciled !== true || observed.observed !== model.expected)) fail("COVERAGE_MODEL_NO_COINCIDE", `${id}: conteo no reconciliado`);
      if (kind === "facts" && observed.evidence_requirement_ids.length === 0) fail("COVERAGE_MODEL_NO_COINCIDE", `${id}: hecho sin evidencia`);
      if (kind === "decisions" && observed.inferred !== false) fail("COVERAGE_MODEL_NO_COINCIDE", `${id}: decisión inferida`);
    }
  }
}

export function validateCoveragePreflightV2({ policyBytes, evidence, expected, declaredBinding } = {}) {
  if (typeof policyBytes !== "string" || !policyBytes.length || !object(expected)) fail("COVERAGE_ESTRUCTURA_INVALIDA", "inputs");
  let document; try { document = JSON.parse(policyBytes); } catch { fail("COVERAGE_POLICY_INVALIDA", "JSON inválido"); }
  validatePolicyDocument(document);
  exact(expected, ["profile_id", "artifact_type", "head_sha", "artifact_id", "attempt_id", "transport_real_id"], "expected target");
  const candidates = document.policies.filter((entry) => entry.profile_id === expected.profile_id && entry.artifact_type === expected.artifact_type);
  if (candidates.length !== 1) fail("COVERAGE_POLICY_NO_RESUELTA", `${expected.profile_id}/${expected.artifact_type}`);
  const policy = candidates[0];
  const policyBuffer = Buffer.from(policyBytes, "utf8"); const policySha256 = hash(policyBuffer);

  const evidenceKeys = ["evidence_version", "canonicalization_version", "profile_id", "artifact_type", "head_sha", "git_tree_oid", "policy_sha256", "policy_bytes", "resolution_target", "artifact_inventory", "source_access", "tree_entries", "search_results", "assessments"];
  exact(evidence, evidenceKeys, "coverage evidence");
  if (evidence.evidence_version !== "1" || evidence.canonicalization_version !== COVERAGE_CANONICALIZATION_VERSION || evidence.profile_id !== expected.profile_id || evidence.artifact_type !== expected.artifact_type
    || evidence.head_sha !== expected.head_sha || !sha(evidence.git_tree_oid, 40) || evidence.policy_sha256 !== policySha256 || evidence.policy_bytes !== policyBuffer.byteLength) fail("COVERAGE_RESOLUCION_AJENA", "policy/profile/artifact/HEAD");
  exact(evidence.resolution_target, ["artifact_id", "attempt_id", "transport_real_id"], "resolution target");
  if (!same(evidence.resolution_target, { artifact_id: expected.artifact_id, attempt_id: expected.attempt_id, transport_real_id: expected.transport_real_id })) fail("COVERAGE_RESOLUCION_AJENA", "resolution target");

  const sets = requirementSets(policy); exact(evidence.artifact_inventory, COVERAGE_CATEGORIES, "artifact inventory");
  for (const category of COVERAGE_CATEGORIES) { uniqueStrings(evidence.artifact_inventory[category], `inventory.${category}`); if (!same(sorted(evidence.artifact_inventory[category]), sets[category])) fail("COVERAGE_SET_NO_COINCIDE", category); }
  const requirements = new Map();
  for (const category of COVERAGE_CATEGORIES) for (const item of policy.requirements[category]) requirements.set(item.id, { ...item, category });
  const accessMap = indexExact(evidence.source_access, "requirement_id");
  if (accessMap.size !== requirements.size || [...accessMap.keys()].some((id) => !requirements.has(id))) fail("COVERAGE_SET_NO_COINCIDE", "source_access");
  for (const [id, access] of accessMap) {
    exact(access, ["requirement_id", "classification", "locator", "accessible"], `source_access.${id}`); const requirement = requirements.get(id);
    if (access.classification !== requirement.classification || access.locator !== requirement.locator || typeof access.accessible !== "boolean") fail("COVERAGE_RESOLUCION_AJENA", id);
    if (!access.accessible && access.classification !== "CONTEXTO_NO_NECESARIO") fail("FUENTE_MATERIAL_NO_ACCESIBLE", id);
  }

  const tree = indexExact(evidence.tree_entries, "path");
  for (const entry of tree.values()) validateTreeEntry(entry, evidence.head_sha, evidence.git_tree_oid);
  const searches = indexExact(evidence.search_results, "requirement_id");
  if (searches.size !== requirements.size || [...searches.keys()].some((id) => !requirements.has(id))) fail("COVERAGE_SET_NO_COINCIDE", "search_results");
  const expectedTreePaths = new Set();
  for (const [id, requirement] of requirements) {
    const access = accessMap.get(id); if (access.accessible) expectedTreePaths.add(requirement.locator);
    const search = searches.get(id); exact(search, ["requirement_id", "query", "matches"], `search.${id}`);
    if (search.query !== requirement.search.query || !Array.isArray(search.matches)) fail("COVERAGE_SEARCH_NO_COINCIDE", id);
    const matches = indexExact(search.matches, "path"); const expectedMatches = access.accessible ? new Set(requirement.search.expected_matches) : new Set();
    if (matches.size !== expectedMatches.size || [...matches.keys()].some((path) => !expectedMatches.has(path))) fail("COVERAGE_SEARCH_NO_COINCIDE", id);
    for (const [path, match] of matches) {
      exact(match, ["path", "git_blob_oid", "sha256", "bytes"], `search match ${path}`); expectedTreePaths.add(path); const source = tree.get(path);
      if (!source || match.git_blob_oid !== source.git_blob_oid || match.sha256 !== source.sha256 || match.bytes !== source.bytes || !source.content.includes(search.query)) fail("COVERAGE_SEARCH_NO_COINCIDE", path);
    }
  }
  if (tree.size !== expectedTreePaths.size || [...tree.keys()].some((path) => !expectedTreePaths.has(path)) || [...expectedTreePaths].some((path) => !tree.has(path))) fail("COVERAGE_TREE_NO_COINCIDE", "conjunto exacto");
  validateModels(policy, evidence.assessments, new Set(requirements.keys()));

  const policyId = hash(Buffer.from(["coverage-policy-v2", policy.profile_id, policy.artifact_type, policy.version].join("\0"), "utf8"));
  const resolutionTargetSha256 = hash(Buffer.from(stable(evidence.resolution_target), "utf8"));
  const canonicalPayload = { canonicalization_version: COVERAGE_CANONICALIZATION_VERSION, policy_bytes: policyBytes, evidence: { ...evidence, artifact_inventory: sets } };
  const preflightBytes = Buffer.from(stable(canonicalPayload), "utf8");
  const binding = { canonicalization_version: COVERAGE_CANONICALIZATION_VERSION, profile_id: policy.profile_id, artifact_type: policy.artifact_type, policy_id: policyId, policy_version: policy.version, policy_sha256: policySha256, policy_bytes: policyBuffer.byteLength, preflight_sha256: hash(preflightBytes), preflight_bytes: preflightBytes.byteLength, head_sha: evidence.head_sha, git_tree_oid: evidence.git_tree_oid, resolution_target_sha256: resolutionTargetSha256, requirement_sets: sets };
  if (declaredBinding !== undefined && !same(declaredBinding, binding)) fail("COVERAGE_BINDING_NO_COINCIDE", "binding declarado");
  const verification = Object.freeze({ binding: Object.freeze(structuredClone(binding)), policy: Object.freeze(structuredClone(policy)) }); VERIFIED_PREFLIGHTS.add(verification); return verification;
}

export function coverageBindingFromVerificationV2(verification) {
  if (!object(verification) || !VERIFIED_PREFLIGHTS.has(verification)) fail("COVERAGE_VERIFICACION_REQUERIDA", "El engine exige el resultado vivo del validador puro");
  return verification.binding;
}
