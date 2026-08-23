#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { access, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createDeliveryEngineV2, DeliveryV2Error } from "./delivery-engine-v2.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

function args(argv) {
  const operation = argv[0];
  const values = {};
  for (let index = 1; index < argv.length; index += 2) values[argv[index]?.replace(/^--/, "")] = argv[index + 1];
  if (!["start", "resume", "late-receipt"].includes(operation) || ["package", "contract", "manifest", "output", "resolution"].some((key) => !values[key])) throw new DeliveryV2Error("USO_INVALIDO", "Uso: delivery-v2-cli.mjs <start|resume|late-receipt> --package <json> --contract <json> --manifest <json> --output <file> --resolution <json> [--receipt <json>] [--root <dir>] [--timeout-ms <ms>]");
  return { operation, ...values };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}

function sha(value, length) {
  return typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
}

function resolutionId(kind, fields) {
  return sha256(Buffer.from([kind, ...fields].join("\0"), "utf8"));
}

function validateResolutionPayload(entry, kind, identityFields, headSha) {
  const required = ["resolution_id", ...identityFields.map(([key]) => key), "head_sha", "sha256", "bytes", "content"];
  if (!exactKeys(entry, required) || entry.head_sha !== headSha || !sha(entry.sha256, 64)
    || !Number.isInteger(entry.bytes) || entry.bytes < 1 || typeof entry.content !== "string") {
    throw new DeliveryV2Error("RESOLUCION_INVALIDA", `${kind}: forma o HEAD inválidos`);
  }
  const contentBytes = Buffer.from(entry.content, "utf8");
  if (entry.bytes !== contentBytes.byteLength || entry.sha256 !== sha256(contentBytes)) {
    throw new DeliveryV2Error("RESOLUCION_NO_COINCIDE", `${kind}: bytes o SHA-256 no coinciden`);
  }
  const fields = identityFields.map(([key]) => entry[key]);
  const expectedId = resolutionId(kind, [...fields, entry.head_sha, entry.sha256, String(entry.bytes)]);
  if (entry.resolution_id !== expectedId) throw new DeliveryV2Error("RESOLUCION_NO_COINCIDE", `${kind}: identificador no coincide`);
  return entry;
}

function evidenceKey(value) {
  return [value.tipo, value.referencia, value.head_o_historial].join("\0");
}

function validateExternalResolution(contract, manifest, resolution) {
  const requiredResolution = ["head_sha", "contract_sha256", "manifest_sha256", "git_sources", "canonical_references", "closure_evidence"];
  if (!exactKeys(resolution, requiredResolution) || !Array.isArray(resolution.canonical_references) || !Array.isArray(resolution.closure_evidence)) {
    throw new DeliveryV2Error("RESOLUCION_INVALIDA", "La resolución externa debe ser cerrada");
  }

  const expectedReferences = new Set(contract.operaciones_delegadas_a_humanos?.map((entry) => entry.referencia_canonica) ?? []);
  const references = new Map(); const resolutionIds = new Set();
  for (const entry of resolution.canonical_references) {
    validateResolutionPayload(entry, "canonical_reference", [["reference"]], resolution.head_sha);
    if (references.has(entry.reference) || resolutionIds.has(entry.resolution_id)) throw new DeliveryV2Error("RESOLUCION_COLISIONADA", entry.reference);
    references.set(entry.reference, entry); resolutionIds.add(entry.resolution_id);
  }
  if (references.size !== expectedReferences.size || [...references.keys()].some((reference) => !expectedReferences.has(reference))) {
    throw new DeliveryV2Error("REFERENCIAS_EXTERNAS_NO_COINCIDEN", "Faltan o sobran referencias canónicas");
  }

  const expectedEvidence = contract.estado_canonico?.evidencia_cierre;
  const expectedEvidenceKeys = new Set(expectedEvidence ? [evidenceKey(expectedEvidence)] : []);
  const evidence = new Map();
  for (const entry of resolution.closure_evidence) {
    validateResolutionPayload(entry, "closure_evidence", [["tipo"], ["referencia"], ["head_o_historial"]], resolution.head_sha);
    const key = evidenceKey(entry);
    if (evidence.has(key) || resolutionIds.has(entry.resolution_id)) throw new DeliveryV2Error("RESOLUCION_COLISIONADA", key);
    evidence.set(key, entry); resolutionIds.add(entry.resolution_id);
  }
  if (evidence.size !== expectedEvidenceKeys.size || [...evidence.keys()].some((key) => !expectedEvidenceKeys.has(key))) {
    throw new DeliveryV2Error("EVIDENCIA_EXTERNA_NO_COINCIDE", "Falta o sobra evidencia de cierre");
  }

  const expectedGitPaths = new Set((manifest.sources ?? []).filter((source) => source.kind === "versioned").map((source) => source.path));
  if (!exactKeys(resolution.git_sources, [...expectedGitPaths])) throw new DeliveryV2Error("RESOLUCION_INVALIDA", "El mapa Git debe contener el conjunto exacto de fuentes versionadas");
  return { references, evidence };
}

async function raw(path) {
  return readFile(resolve(path), "utf8");
}

async function json(path) {
  return JSON.parse(await raw(path));
}

async function loadInputs(parsed) {
  const bundle = await json(parsed.package); const contractRaw = await raw(parsed.contract); const manifestRaw = await raw(parsed.manifest); const outputContent = await raw(parsed.output); const resolution = await json(parsed.resolution);
  const contract = JSON.parse(contractRaw); const manifest = JSON.parse(manifestRaw);
  const externalResolution = validateExternalResolution(contract, manifest, resolution);
  const observedContractHash = sha256(Buffer.from(contractRaw, "utf8")); const observedManifestHash = sha256(Buffer.from(manifestRaw, "utf8"));
  if (resolution.contract_sha256 !== observedContractHash || resolution.manifest_sha256 !== observedManifestHash || manifest.contract_sha256 !== observedContractHash || bundle.attempt?.manifest_sha256 !== observedManifestHash || bundle.result?.binding?.manifest_sha256 !== observedManifestHash || resolution.head_sha !== manifest.head_sha || resolution.head_sha !== bundle.attempt?.head_sha || resolution.head_sha !== bundle.result?.binding?.head_sha) throw new DeliveryV2Error("RESOLUCION_NO_COINCIDE", "Los bytes exactos o HEAD no coinciden con la resolución externa");
  return { deliveryPackage: { attempt: bundle.attempt, result: bundle.result, contract, manifest, output: { ref: bundle.result.binding.output_ref, content: outputContent } }, resolution, externalResolution };
}

async function dependenciesFor(resolution, externalResolution) {
  const [catalog, registry, producers] = await Promise.all([
    json(join(HERE, "roles.catalog.json")),
    json(join(HERE, "actores.json")),
    json(join(HERE, "handoff-v2-producers.json")),
  ]);
  return {
    catalog,
    registry,
    producers,
    head_sha: resolution.head_sha,
    contract_sha256: resolution.contract_sha256,
    manifest_sha256: resolution.manifest_sha256,
    git_sources: resolution.git_sources,
    sha256: (value) => sha256(Buffer.from(value, "utf8")),
    resolveCanonicalReference: reference => externalResolution.references.has(reference),
    resolveEvidence: (evidence, head) => head === resolution.head_sha && externalResolution.evidence.has(evidenceKey(evidence)),
  };
}

async function finiteReceipt(path, timeoutMs) {
  if (!path) return null;
  const deadline = Date.now() + timeoutMs;
  do {
    try { return await json(path); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.min(50, Math.max(1, deadline - Date.now()))));
  } while (Date.now() < deadline);
  return null;
}

async function main() {
  const parsed = args(process.argv.slice(2));
  const { deliveryPackage, resolution, externalResolution } = await loadInputs(parsed);
  const dependencies = await dependenciesFor(resolution, externalResolution);
  const timeoutMs = Number(parsed["timeout-ms"] ?? 5_000);
  const engine = createDeliveryEngineV2({
    rootDir: parsed.root ?? join(HERE, ".handoff", "v2", "deliveries"),
    timeoutMs,
    invoke: async ({ attempt, manifest, deliveryDir }) => {
      const target = join(deliveryDir, "outbound.json");
      const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
      await writeFile(temporary, `${JSON.stringify({ attempt, manifest }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      await rename(temporary, target);
    },
    reconcile: async () => finiteReceipt(parsed.receipt, timeoutMs),
  });
  let result;
  if (parsed.operation === "start") result = await engine.start(deliveryPackage, dependencies);
  else if (parsed.operation === "resume") result = await engine.resume(deliveryPackage, dependencies);
  else {
    if (!parsed.receipt) throw new DeliveryV2Error("USO_INVALIDO", "late-receipt exige --receipt");
    await access(resolve(parsed.receipt));
    result = await engine.recordLateReceipt(deliveryPackage, dependencies, await json(parsed.receipt));
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: error.code ?? "DELIVERY_ERROR", message: error.message })}\n`);
  process.exitCode = 1;
});
