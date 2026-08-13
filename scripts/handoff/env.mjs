import { spawnSync } from "node:child_process";

const SAFE_ENV = [
  "APPDATA", "COMSPEC", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "NO_COLOR",
  "NUMBER_OF_PROCESSORS", "OS", "PATH", "PATHEXT", "PROCESSOR_ARCHITECTURE",
  "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "SYSTEMDRIVE", "SYSTEMROOT",
  "TEMP", "TMP", "USERDOMAIN", "USERNAME", "USERPROFILE", "WINDIR",
];

export function buildChildEnv(source = process.env, extra = {}) {
  const env = {};
  for (const name of SAFE_ENV) if (source[name] !== undefined) env[name] = source[name];
  for (const [name, value] of Object.entries(extra)) env[name] = value;
  return env;
}

// Conserva argumentos simples tal como fueron configurados (incluidas comillas
// internas) y agrupa sólo los que cmd.exe podría separar o interpretar.
export function quoteCmdArgument(value) {
  const text = String(value);
  if (!text) return '""';
  if (!/[\s&|<>^()%!]/.test(text)) return text;
  const escaped = text
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/, "$1$1");
  return `"${escaped}"`;
}

export function buildWindowsCmdInvocation(command, args, comspec = process.env.COMSPEC ?? "cmd.exe") {
  const commandLine = [`${command}.cmd`, ...args].map(quoteCmdArgument).join(" ");
  return { command: comspec, args: ["/d", "/s", "/c", commandLine], commandLine };
}

export function runProcess(command, args, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  const platform = options.platform ?? process.platform;
  const spawnOptions = {
    cwd: options.cwd,
    env: options.env ?? buildChildEnv(),
    input: options.input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout ?? 20 * 60 * 1000,
    windowsHide: true,
  };
  let executedCommand = command;
  let result = spawn(command, args, spawnOptions);
  const hasExplicitExtension = /\.[^\\/]+$/.test(command);
  if (platform === "win32" && result.error?.code === "ENOENT" && !hasExplicitExtension) {
    const retry = buildWindowsCmdInvocation(command, args);
    executedCommand = retry.command;
    result = spawn(executedCommand, retry.args, {
      ...spawnOptions,
      windowsVerbatimArguments: true,
    });
  }
  if (result.error) {
    const error = new Error(`${executedCommand}: ${result.error.message}`);
    error.code = result.error.code;
    error.stdout = result.stdout ?? "";
    error.stderr = result.stderr ?? "";
    throw error;
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "sin salida").trim();
    const error = new Error(`${executedCommand} terminó con ${result.status}: ${detail}`);
    error.status = result.status;
    error.stdout = result.stdout ?? "";
    error.stderr = result.stderr ?? "";
    throw error;
  }
  return result;
}

function parseJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("El cliente no devolvió estado JSON");
  return JSON.parse(text.slice(start, end + 1));
}

export function observeAuthentication(agent, adapter, options = {}) {
  const run = options.run ?? runProcess;
  const env = options.env ?? buildChildEnv();
  if (agent === "claude") {
    const result = run(adapter.executable, ["auth", "status", "--json"], { env, timeout: 30_000 });
    const status = parseJsonObject(result.stdout);
    const valid = status.loggedIn === true && status.authMethod === "claude.ai"
      && status.apiProvider === "firstParty" && typeof status.subscriptionType === "string";
    return {
      authorized_via: adapter.authorized_via,
      observed_via: valid ? "anthropic_first_party_subscription" : "unverified",
      evidence: {
        logged_in: status.loggedIn === true,
        auth_method: status.authMethod ?? null,
        api_provider: status.apiProvider ?? null,
        subscription_type: status.subscriptionType ?? null
      },
      valid: valid && adapter.authorized_via === "anthropic_first_party_subscription",
    };
  }
  if (agent === "codex") {
    const result = run(adapter.executable, ["login", "status"], { env, timeout: 30_000 });
    const normalized = `${result.stdout}\n${result.stderr}`.trim();
    const chatgpt = /logged in using chatgpt|chatgpt subscription|chatgpt account/i.test(normalized);
    return {
      authorized_via: adapter.authorized_via,
      observed_via: chatgpt ? "chatgpt_subscription_session" : "unverified",
      evidence: { client_status: normalized.slice(0, 500) },
      valid: chatgpt && adapter.authorized_via === "chatgpt_subscription_session",
    };
  }
  if (agent === "kimi") {
    const result = run(adapter.executable, ["provider", "list", "--json"], { env, timeout: 30_000 });
    const status = parseJsonObject(result.stdout);
    const provider = status.providers?.["managed:kimi-code"];
    const model = status.models?.[adapter.alias];
    const managedOauth = provider?.type === "kimi"
      && provider.baseUrl === "https://api.kimi.com/coding/v1"
      && provider.oauth?.storage === "file"
      && provider.oauth?.key === "oauth/kimi-code";
    const configuredModel = model?.provider === "managed:kimi-code"
      && model.model === adapter.model
      && model.capabilities?.includes("always_thinking")
      && model.supportEfforts?.includes(adapter.effort);
    const valid = managedOauth && configuredModel;
    return {
      authorized_via: adapter.authorized_via,
      observed_via: valid ? "kimi_membership_oauth" : "unverified",
      evidence: {
        provider: provider ? "managed:kimi-code" : null,
        provider_type: provider?.type ?? null,
        base_url: provider?.baseUrl ?? null,
        oauth_storage: provider?.oauth?.storage ?? null,
        oauth_key: provider?.oauth?.key ?? null,
        model_alias: model ? adapter.alias : null,
        runtime_model: model?.model ?? null,
        supports_effort: model?.supportEfforts?.includes(adapter.effort) === true,
        always_thinking: model?.capabilities?.includes("always_thinking") === true,
      },
      valid: valid && adapter.authorized_via === "kimi_membership_oauth",
    };
  }
  throw new Error(`Agente no soportado: ${agent}`);
}
