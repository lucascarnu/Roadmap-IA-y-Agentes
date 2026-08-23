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

async function raw(path) {
  return readFile(resolve(path), "utf8");
}

async function json(path) {
  return JSON.parse(await raw(path));
}

async function loadInputs(parsed) {
  const bundle = await json(parsed.package); const contractRaw = await raw(parsed.contract); const manifestRaw = await raw(parsed.manifest); const outputContent = await raw(parsed.output); const resolution = await json(parsed.resolution);
  const contract = JSON.parse(contractRaw); const manifest = JSON.parse(manifestRaw);
  const requiredResolution = ["head_sha", "contract_sha256", "manifest_sha256", "git_sources"];
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution) || Object.keys(resolution).sort().join("|") !== requiredResolution.sort().join("|")) throw new DeliveryV2Error("RESOLUCION_INVALIDA", "La resolución externa debe ser cerrada");
  const observedContractHash = sha256(Buffer.from(contractRaw, "utf8")); const observedManifestHash = sha256(Buffer.from(manifestRaw, "utf8"));
  if (resolution.contract_sha256 !== observedContractHash || resolution.manifest_sha256 !== observedManifestHash || manifest.contract_sha256 !== observedContractHash || bundle.attempt?.manifest_sha256 !== observedManifestHash || bundle.result?.binding?.manifest_sha256 !== observedManifestHash || resolution.head_sha !== manifest.head_sha || resolution.head_sha !== bundle.attempt?.head_sha || resolution.head_sha !== bundle.result?.binding?.head_sha) throw new DeliveryV2Error("RESOLUCION_NO_COINCIDE", "Los bytes exactos o HEAD no coinciden con la resolución externa");
  return { deliveryPackage: { attempt: bundle.attempt, result: bundle.result, contract, manifest, output: { ref: bundle.result.binding.output_ref, content: outputContent } }, resolution };
}

async function dependenciesFor(deliveryPackage, resolution) {
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
    resolveCanonicalReference: asyncReference => {
      const path = asyncReference.split("#", 1)[0];
      return path.length > 0;
    },
    resolveEvidence: (evidence, head) => evidence?.head_o_historial === head,
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
  const { deliveryPackage, resolution } = await loadInputs(parsed);
  const dependencies = await dependenciesFor(deliveryPackage, resolution);
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
