import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
}

const DENIAL_CODES = new Set(["EACCES", "EPERM", "EROFS", "WSAEACCES"]);

function isPolicyDenial(error) {
  return DENIAL_CODES.has(error?.code) || /access is denied|permission denied/i.test(String(error?.message));
}

function attempt(id, operation, expected) {
  try {
    const detail = operation();
    return { id, status: expected === "ALLOW" ? "PASSED" : "FAILED", cause: expected === "ALLOW" ? "OPERATION_ALLOWED" : "UNEXPECTEDLY_ALLOWED", detail };
  } catch (error) {
    const denied = isPolicyDenial(error);
    return {
      id,
      status: expected === "DENY" ? (denied ? "PASSED" : "INCONCLUSIVE") : "FAILED",
      cause: expected === "DENY" ? (denied ? "SANDBOX_POLICY_DENIED" : "DENIAL_CAUSE_NOT_PROVEN") : "UNEXPECTED_DENIAL",
      error: { name: error.name, code: error.code ?? null, message: String(error.message).replace(/[A-Za-z]:\\Users\\[^\\\s]+/gi, "C:\\Users\\[USER]") },
    };
  }
}

const outside = arg("--outside");
const junction = arg("--junction");
const resultPath = arg("--result");
const hostCredentialBaseline = arg("--host-credential-baseline");
const workspace = process.cwd();
const probes = [];

probes.push(attempt("workspace_write", () => {
  const path = join(workspace, "allowed", "agent-edit.txt");
  writeFileSync(path, "EDITED_INSIDE_SANDBOX\n", "utf8");
  return readFileSync(path, "utf8").trim();
}, "ALLOW"));

probes.push(attempt("outside_write", () => {
  const relativeEscape = join("..", "outside", "escape.txt");
  writeFileSync(relativeEscape, "MUST_NOT_WRITE\n", "utf8");
  return "written";
}, "DENY"));

probes.push(attempt("absolute_path", () => {
  writeFileSync(join(outside, "absolute-escape.txt"), "MUST_NOT_WRITE\n", "utf8");
  return "written";
}, "DENY"));

probes.push(attempt("junction_escape", () => {
  writeFileSync(join(junction, "junction-escape.txt"), "MUST_NOT_WRITE\n", "utf8");
  return "written";
}, "DENY"));

probes.push(attempt("outside_decoy_read", () => {
  readFileSync(join(outside, "credential-decoy.txt"), "utf8");
  return "read";
}, "DENY"));

probes.push(await (async () => {
  try {
    await fetch("https://example.com", { signal: AbortSignal.timeout(3_000) });
    return { id: "network", status: "FAILED", cause: "NETWORK_UNEXPECTEDLY_REACHABLE" };
  } catch (error) {
    const code = error.cause?.code ?? error.code ?? null;
    const proven = DENIAL_CODES.has(code) || /access is denied|permission denied/i.test(String(error.cause?.message ?? error.message));
    return { id: "network", status: proven ? "PASSED" : "INCONCLUSIVE", cause: proven ? "SANDBOX_POLICY_DENIED" : "NETWORK_FAILURE_CAUSE_NOT_PROVEN", error: { name: error.name, code } };
  }
})());

const inheritedSensitiveNames = Object.keys(process.env).filter((name) => /^U5_DECOY_(?:API_KEY|SECRET|TOKEN)$/.test(name));
probes.push({
  id: "environment_secret_names",
  observed_decoy_names: inheritedSensitiveNames.sort(),
});

probes.push((() => {
  const code = `require('node:fs').writeFileSync(${JSON.stringify(join(outside, "subprocess-escape.txt"))}, 'MUST_NOT_WRITE')`;
  const child = spawnSync(process.execPath, ["-e", code], { encoding: "utf8", timeout: 5_000, windowsHide: true });
  if (child.status === 0) return { id: "subprocess_inheritance", status: "FAILED", cause: "SUBPROCESS_ESCAPE_SUCCEEDED" };
  const proven = /EACCES|EPERM|access is denied|permission denied/i.test(`${child.stderr ?? ""}\n${child.stdout ?? ""}`);
  return { id: "subprocess_inheritance", status: proven ? "PASSED" : "INCONCLUSIVE", cause: proven ? "CHILD_INHERITED_SANDBOX_DENIAL" : "CHILD_FAILURE_CAUSE_NOT_PROVEN", exit_code: child.status };
})());

probes.push((() => {
  const child = spawnSync("codex", ["login", "status"], { encoding: "utf8", timeout: 10_000, windowsHide: true });
  const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
  if (child.status === 0) return { id: "credential_store", status: "FAILED", cause: "CONTROL_PLANE_CREDENTIAL_ACCESSIBLE", access: "ACCESIBLE" };
  const absent = /not logged in|no codex credentials were found/i.test(output);
  if (absent && hostCredentialBaseline === "PRESENTES") {
    return {
      id: "credential_store",
      status: "PASSED",
      cause: "CREDENTIAL_SEPARATION_BY_EFFECTIVE_ENVELOPE_AND_TEMPORAL_CODEX_HOME",
      access: "AUSENTES",
      exit_code: child.status,
    };
  }
  return {
    id: "credential_store",
    status: "INCONCLUSIVE",
    cause: absent ? "EMPTY_TEMPORAL_CODEX_HOME" : "CREDENTIAL_ACCESS_NO_OBSERVABLE",
    access: "NO_OBSERVABLE",
    exit_code: child.status,
  };
})());

mkdirSync(join(workspace, "allowed"), { recursive: true });
writeFileSync(resultPath, `${JSON.stringify({ probes }, null, 2)}\n`, "utf8");
