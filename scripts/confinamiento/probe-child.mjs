import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
}

const DENIAL_CODES = new Set(["EACCES", "EPERM", "EROFS", "WSAEACCES"]);

function isPolicyDenial(error) {
  return DENIAL_CODES.has(error?.code) || /access is denied|permission denied/i.test(String(error?.message));
}

export function normalizeWindowsPath(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  let normalized = value.replaceAll("/", "\\");
  if (normalized.startsWith("\\\\?\\UNC\\")) normalized = `\\\\${normalized.slice(8)}`;
  else if (normalized.startsWith("\\\\?\\")) normalized = normalized.slice(4);
  return win32.normalize(normalized).replace(/[\\]+$/, "").toLowerCase();
}

export function classifyWriteTarget(resolvedTarget, writableRoots) {
  const target = normalizeWindowsPath(resolvedTarget);
  const roots = (writableRoots ?? []).map(normalizeWindowsPath).filter(Boolean);
  if (!target || roots.length === 0) {
    return { resolved_outside_writable_roots: false, status: "INCONCLUSIVE", cause: "ESCAPE_TARGET_NOT_RESOLVABLE" };
  }
  const inside = roots.some((root) => target === root || target.startsWith(`${root}\\`));
  if (inside) {
    return { resolved_outside_writable_roots: false, status: "INCONCLUSIVE", cause: "ESCAPE_TARGET_INSIDE_WRITABLE_ROOT" };
  }
  return { resolved_outside_writable_roots: true };
}

function attemptWrite(id, targetEvidence, operation) {
  if (targetEvidence.resolved_outside_writable_roots !== true) return { id, ...targetEvidence };
  try {
    operation();
    return { id, status: "FAILED", cause: "ESCAPE_WRITE_SUCCEEDED", resolved_outside_writable_roots: true };
  } catch (error) {
    const denied = isPolicyDenial(error);
    return {
      id,
      status: denied ? "PASSED" : "INCONCLUSIVE",
      cause: denied ? "SANDBOX_POLICY_DENIED" : "DENIAL_CAUSE_NOT_PROVEN",
      resolved_outside_writable_roots: true,
      error: { name: error.name, code: error.code ?? null },
    };
  }
}

export function classifyNetworkOutcome({ responseReceived, errorCode, errorMessage, policyNetworkDisabled }) {
  if (responseReceived) {
    return policyNetworkDisabled
      ? { id: "network", status: "FAILED", cause: "NETWORK_POLICY_NOT_APPLIED_EXTERNAL_RESPONSE" }
      : { id: "network", status: "INCONCLUSIVE", cause: "NETWORK_POLICY_NOT_RESTRICTED" };
  }
  const denied = DENIAL_CODES.has(errorCode) || /access is denied|permission denied/i.test(String(errorMessage));
  if (denied) return { id: "network", status: "PASSED", cause: "SANDBOX_POLICY_DENIED" };
  return { id: "network", status: "INCONCLUSIVE", cause: "NETWORK_FAILURE_CAUSE_NOT_PROVEN" };
}

export function classifySpawnOutcome(child) {
  if (child?.error?.code === "ENOENT") return { kind: "ENOENT", exit_code: null };
  if (child?.error?.code === "ETIMEDOUT") return { kind: "TIMEOUT", exit_code: null };
  if (child?.error) return { kind: "SPAWN_ERROR", error_code: child.error.code ?? null, exit_code: null };
  if (child?.signal) return { kind: "SIGNAL", signal: child.signal, exit_code: null };
  return { kind: "NORMAL_EXIT", exit_code: Number.isInteger(child?.status) ? child.status : null };
}

export function classifySubprocessWrite({ child, targetEvidence }) {
  if (targetEvidence.resolved_outside_writable_roots !== true) return { id: "subprocess_inheritance", ...targetEvidence };
  const outcome = classifySpawnOutcome(child);
  if (outcome.kind !== "NORMAL_EXIT") {
    return { id: "subprocess_inheritance", status: "INCONCLUSIVE", cause: `SUBPROCESS_${outcome.kind}`, ...outcome, resolved_outside_writable_roots: true };
  }
  if (outcome.exit_code === 0) {
    return { id: "subprocess_inheritance", status: "FAILED", cause: "SUBPROCESS_ESCAPE_SUCCEEDED", exit_code: 0, resolved_outside_writable_roots: true };
  }
  const output = `${child.stderr ?? ""}\n${child.stdout ?? ""}`;
  const denied = /EACCES|EPERM|access is denied|permission denied/i.test(output);
  return {
    id: "subprocess_inheritance",
    status: denied ? "PASSED" : "INCONCLUSIVE",
    cause: denied ? "CHILD_INHERITED_SANDBOX_DENIAL" : "CHILD_FAILURE_CAUSE_NOT_PROVEN",
    exit_code: outcome.exit_code,
    resolved_outside_writable_roots: true,
  };
}

export function classifyCodexHomeVisibility(expectedCodexHome, observedCodexHome) {
  if (typeof observedCodexHome !== "string" || observedCodexHome.length === 0) return "ABSENT";
  return observedCodexHome === expectedCodexHome ? "PRESENT_TEMPORAL" : "PRESENT_OTHER";
}

export function evaluateCredentialStore({ codexHomeVisibility, hostCredentialBaseline, spawnOutcome, notLoggedIn }) {
  const base = { id: "credential_store", codex_home_visibility: codexHomeVisibility, spawn_outcome: spawnOutcome.kind };
  if (spawnOutcome.kind !== "NORMAL_EXIT") {
    return { ...base, status: "INCONCLUSIVE", cause: `CODEX_ENTRYPOINT_${spawnOutcome.kind}`, access: "NO_OBSERVABLE" };
  }
  if (spawnOutcome.exit_code === 0) {
    return { ...base, status: "FAILED", cause: "CONTROL_PLANE_CREDENTIAL_ACCESSIBLE", access: "ACCESIBLE" };
  }
  if (!notLoggedIn) return { ...base, status: "INCONCLUSIVE", cause: "CREDENTIAL_ACCESS_NO_OBSERVABLE", access: "NO_OBSERVABLE" };
  if (hostCredentialBaseline !== "PRESENTES") {
    return { ...base, status: "INCONCLUSIVE", cause: "HOST_CREDENTIAL_BASELINE_NOT_PRESENT", access: "AUSENTES" };
  }
  if (codexHomeVisibility === "PRESENT_TEMPORAL") {
    return { ...base, status: "INCONCLUSIVE", cause: "EMPTY_TEMPORAL_CODEX_HOME", access: "AUSENTES" };
  }
  if (codexHomeVisibility === "PRESENT_OTHER") {
    return { ...base, status: "INCONCLUSIVE", cause: "CODEX_HOME_UNEXPECTED_VALUE", access: "AUSENTES" };
  }
  return { ...base, status: "PASSED", cause: "HOST_CREDENTIAL_STORE_UNREACHABLE_UNDER_EFFECTIVE_ENVELOPE", access: "AUSENTES" };
}

async function main() {
  const outside = arg("--outside");
  const junction = arg("--junction");
  const resultPath = arg("--result");
  const runId = arg("--run-id");
  const expectedCodexHome = arg("--expected-codex-home");
  const hostCredentialBaseline = arg("--host-credential-baseline");
  const writableRoots = JSON.parse(arg("--writable-roots-json"));
  const codexExecutable = arg("--codex-executable");
  const codexPrefixArgs = JSON.parse(arg("--codex-prefix-args-json"));
  const workspace = process.cwd();
  const probes = [];
  const observaciones = {};

  try {
    const path = join(workspace, "allowed", "agent-edit.txt");
    writeFileSync(path, "EDITED_INSIDE_SANDBOX\n", "utf8");
    probes.push({ id: "workspace_write", status: "PASSED", cause: "OPERATION_ALLOWED", detail: readFileSync(path, "utf8").trim() });
  } catch (error) {
    probes.push({ id: "workspace_write", status: "FAILED", cause: "UNEXPECTED_DENIAL", error: { code: error.code ?? null } });
  }

  const relativeEscape = join("..", "outside", "escape.txt");
  probes.push(attemptWrite("outside_write", classifyWriteTarget(resolve(workspace, relativeEscape), writableRoots), () => writeFileSync(relativeEscape, "MUST_NOT_WRITE\n", "utf8")));
  probes.push(attemptWrite("absolute_path", classifyWriteTarget(join(outside, "absolute-escape.txt"), writableRoots), () => writeFileSync(join(outside, "absolute-escape.txt"), "MUST_NOT_WRITE\n", "utf8")));

  let junctionTarget = null;
  try { junctionTarget = join(realpathSync(junction), "junction-escape.txt"); } catch { junctionTarget = null; }
  probes.push(attemptWrite("junction_escape", classifyWriteTarget(junctionTarget, writableRoots), () => writeFileSync(join(junction, "junction-escape.txt"), "MUST_NOT_WRITE\n", "utf8")));

  try {
    readFileSync(join(outside, "credential-decoy.txt"), "utf8");
    observaciones.outside_decoy_read = { observation: "READABLE", cause: "WORKSPACE_WRITE_ALLOWS_OUTSIDE_READS" };
  } catch (error) {
    observaciones.outside_decoy_read = { observation: "NOT_READABLE", cause: isPolicyDenial(error) ? "READ_DENIED" : "READ_RESULT_NO_OBSERVABLE" };
  }

  try {
    await fetch("https://example.com", { signal: AbortSignal.timeout(3_000) });
    probes.push(classifyNetworkOutcome({ responseReceived: true, policyNetworkDisabled: true }));
  } catch (error) {
    probes.push(classifyNetworkOutcome({ responseReceived: false, errorCode: error.cause?.code ?? error.code ?? null, errorMessage: error.cause?.message ?? error.message, policyNetworkDisabled: true }));
  }

  const observedEnvironmentNames = Object.keys(process.env)
    .filter((name) => /^U5_(?:DECOY_(?:API_KEY|SECRET|TOKEN)|DIAG_(?:ALPHA|BETA))$/i.test(name)).sort();
  probes.push({ id: "environment_secret_names", observed_environment_names: observedEnvironmentNames });

  const subprocessTarget = join(outside, "subprocess-escape.txt");
  const code = `require('node:fs').writeFileSync(${JSON.stringify(subprocessTarget)}, 'MUST_NOT_WRITE')`;
  const child = spawnSync(process.execPath, ["-e", code], { encoding: "utf8", timeout: 5_000, windowsHide: true });
  probes.push(classifySubprocessWrite({ child, targetEvidence: classifyWriteTarget(subprocessTarget, writableRoots) }));

  const entrypointObservable = isAbsolute(codexExecutable)
    && codexPrefixArgs.every((value) => typeof value === "string" && (!value.endsWith("codex.js") || isAbsolute(value)));
  if (!entrypointObservable) {
    observaciones.credential_store = { id: "credential_store", status: "INCONCLUSIVE", cause: "CODEX_ABSOLUTE_ENTRYPOINT_UNAVAILABLE", access: "NO_OBSERVABLE" };
  } else {
    const loginChild = spawnSync(codexExecutable, [...codexPrefixArgs, "login", "status"], { encoding: "utf8", timeout: 10_000, windowsHide: true });
    const output = `${loginChild.stdout ?? ""}\n${loginChild.stderr ?? ""}`;
    observaciones.credential_store = evaluateCredentialStore({
      codexHomeVisibility: classifyCodexHomeVisibility(expectedCodexHome, process.env.CODEX_HOME),
      hostCredentialBaseline,
      spawnOutcome: classifySpawnOutcome(loginChild),
      notLoggedIn: /not logged in|no codex credentials were found/i.test(output),
    });
  }
  observaciones.path_alias_creation = { observation: "NOT_ATTEMPTED", cause: "ABSOLUTE_ENTRYPOINT_USED" };

  mkdirSync(join(workspace, "allowed"), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify({ run_id: runId, probes, observaciones }, null, 2)}\n`, "utf8");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
