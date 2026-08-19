import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  CRITICAL_OVERRIDES,
  MAX_MODEL_INVOCATIONS,
  PERMISSION_PROFILE,
  assertLayerBAllowed,
  buildOverrideArgs,
  createCampaignWorkspace,
  layerAGate,
  sanitizeObservation,
} from "./harness.mjs";

test("el sobre fija todos los controles críticos por override", () => {
  assert.equal(PERMISSION_PROFILE, ":workspace");
  for (const expected of [
    "sandbox_mode=\"workspace-write\"",
    "approval_policy=\"never\"",
    "sandbox_workspace_write.network_access=false",
    "tools.web_search=false",
    "mcp_servers={}",
    "apps._default.enabled=false",
    "cli_auth_credentials_store=\"keyring\"",
  ]) assert.ok(CRITICAL_OVERRIDES.includes(expected), expected);
  assert.deepEqual(buildOverrideArgs().filter((_, index) => index % 2 === 0), Array(CRITICAL_OVERRIDES.length).fill("-c"));
});

test("la política de entorno excluye KEY, SECRET y TOKEN", () => {
  const policy = CRITICAL_OVERRIDES.find((item) => item.startsWith("shell_environment_policy.exclude="));
  assert.match(policy, /KEY/);
  assert.match(policy, /SECRET/);
  assert.match(policy, /TOKEN/);
});

test("el workspace hostil y CODEX_HOME viven en temporal", () => {
  const campaign = createCampaignWorkspace();
  assert.match(campaign.root, /codex-u5-/);
  assert.match(readFileSync(join(campaign.workspace, ".codex", "config.toml"), "utf8"), /danger-full-access/);
  assert.match(readFileSync(join(campaign.codexHome, "config.toml"), "utf8"), /trust_level = "untrusted"/);
  assert.notEqual(campaign.workspace, process.cwd());
});

test("la sanitización no conserva secretos ni rutas personales", () => {
  const personalPath = ["C:", "Users", "someone", "private"].join("\\");
  const value = sanitizeObservation({
    authorization: { nested: "FAKE-NOT-A-REAL-SECRET" },
    message: `Bearer FAKE-TOKEN password=FAKE-PASSWORD ${personalPath}`,
  });
  assert.equal(value.authorization, "[REDACTED]");
  assert.doesNotMatch(value.message, /FAKE-TOKEN|FAKE-PASSWORD|someone/);
});

test("Capa B queda cerrada si Capa A no está completa", () => {
  assert.throws(() => assertLayerBAllowed({ layer_a_complete: false }), /LAYER_A_REQUIRED/);
});

test("la cuota de modelo tiene techo de cinco y no es objetivo", () => {
  assert.equal(MAX_MODEL_INVOCATIONS, 5);
  assert.throws(() => assertLayerBAllowed({ layer_a_complete: true }, 5), /MODEL_INVOCATION_QUOTA_EXHAUSTED/);
  assert.equal(assertLayerBAllowed({ layer_a_complete: true }, 0), true);
});

test("el gate exige configuración, inventario, bootstrap y probes completos", () => {
  const base = {
    sandbox_bootstrap: { status: "PASSED" },
    effective_config: { auth_storage_mode: "Keyring", configured_mcp_servers: "0" },
    inventory: {
      skill_dependency_install_disabled: true,
      multi_agent_feature_disabled: true,
      external_tool_inventory_conclusive: true,
      apps_or_connectors_present: false,
      computer_use_present: false,
      web_search_present: false,
    },
    probes: [{ status: "PASSED" }],
  };
  assert.equal(layerAGate(base), true);
  for (const mutation of [
    (x) => { x.sandbox_bootstrap.status = "FAILED"; },
    (x) => { x.effective_config.auth_storage_mode = "File"; },
    (x) => { x.inventory.external_tool_inventory_conclusive = false; },
    (x) => { x.probes[0].status = "NOT_RUN"; },
  ]) {
    const value = structuredClone(base);
    mutation(value);
    assert.equal(layerAGate(value), false);
  }
});

test("los archivos durables no contienen credenciales reales ni rutas personales", () => {
  for (const file of ["harness.mjs", "probe-child.mjs", "harness.test.mjs", "README.md"]) {
    const source = readFileSync(join(import.meta.dirname, file), "utf8");
    assert.doesNotMatch(source, /C:\\Users\\lucas/i);
    assert.doesNotMatch(source, /sk-[A-Za-z0-9_-]{12,}/);
  }
});
