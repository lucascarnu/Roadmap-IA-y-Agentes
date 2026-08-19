---
formato: documentacion
plataforma: web
origen: "https://learn.chatgpt.com/docs/developer-commands?surface=cli"
autor: OpenAI
categoria: agentes-de-desarrollo
clasificacion: oro
materiales:
  - "https://raw.githubusercontent.com/openai/codex/rust-v0.147.0/codex-rs/cli/src/debug_sandbox.rs"
  - "https://raw.githubusercontent.com/openai/codex/rust-v0.147.0/codex-rs/protocol/src/shell_environment.rs"
  - "https://raw.githubusercontent.com/openai/codex/rust-v0.147.0/codex-rs/protocol/src/config_types.rs"
  - "https://learn.chatgpt.com/docs/config-file/config-reference"
  - "https://learn.chatgpt.com/docs/windows/windows-sandbox"
---

# Entorno de los comandos ejecutados por el sandbox helper de Codex

Documentación oficial de OpenAI sobre `codex sandbox` y
`shell_environment_policy`, acompañada del código fuente pinneado a la
versión evaluada.

## Trazabilidad

- **Fecha de consulta:** 2026-08-19.
- **Versión:** `codex-cli 0.147.0`; fuente leída en el tag
  `rust-v0.147.0`, archivo
  `codex-rs/cli/src/debug_sandbox.rs`.
- **Qué afirmación respalda sobre el entorno:** que `codex sandbox`
  aplica `shell_environment_policy` al comando que ejecuta, en las tres
  plataformas, incluida Windows, limpiando antes el entorno del proceso
  padre. La documentación lo describe como ejecutar un comando
  «under the same policies Codex uses internally»; el código lo
  implementa mediante
  `create_env(&config.permissions.shell_environment_policy, None)` en
  `run_command_under_sandbox()` y
  `cmd.env_clear(); cmd.envs(env);` en
  `spawn_debug_sandbox_child()`.
- **Qué afirmación respalda sobre `CODEX_HOME`:** que bajo
  `shell_environment_policy.inherit = "core"` el proceso hijo lanzado por
  `codex sandbox` **no** recibe `CODEX_HOME`. En
  `codex-rs/protocol/src/shell_environment.rs`, `create_env` parte de
  `std::env::vars()` y el modo `Core` conserva sólo su lista fija, que no
  incluye `CODEX_HOME` ni en Unix ni en Windows; la única variable Codex
  insertada condicionalmente es `CODEX_THREAD_ID`. En
  `codex-rs/cli/src/debug_sandbox.rs`, `spawn_debug_sandbox_child()`
  agrega `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR` y variables de
  plataforma, pero no reinyecta `CODEX_HOME`.
- **Qué afirmación respalda sobre lecturas:** `workspace-write` delimita las
  escrituras al workspace y a las raíces adicionales; no constituye una
  frontera general de lectura. Por eso una credencial almacenada como archivo
  ordinario fuera del workspace no queda protegida sólo por esta modalidad.
- **Qué afirmación respalda sobre la red:** la documentación oficial declara
  que el sandbox nativo de Windows previene acceso de red sin aprobación y
  advierte que el modo `unelevated` conserva límites ACL pero tiene aislamiento
  de red más débil. En la fuente pinneada, `debug_sandbox.rs` transmite la
  política de red del perfil a `spawn_windows_sandbox_session_for_level()` y
  crea la sesión con `proxy_enforced: false` cuando no hay proxy gestionado.
  Estado: `DOCUMENTADO`. Una respuesta externa real bajo una política
  restringida es evidencia de que la política no se aplicó en esa corrida; un
  fallo de DNS o timeout por sí solo no demuestra el bloqueo del sandbox.
- **Qué afirmación respalda sobre la política ambiental:** la referencia
  vigente llama `shell_environment_policy.filters` a la forma canónica. La
  versión pinneada `0.147.0`, en cambio, representa y ejecuta los campos legacy
  `exclude` e `include_only`, con patrones glob case-insensitive. El
  instrumental fijado a esa versión usa `exclude` y debe migrarse al cambiar de
  versión si la compatibilidad deja de existir.
- **Polaridad de `ignore_default_excludes`:** `true` conserva inicialmente las
  variables cuyos nombres contienen `KEY`, `SECRET` o `TOKEN`; `false` aplica
  las exclusiones automáticas antes de los filtros explícitos. La fuente
  pinneada implementa esta polaridad en `populate_env()`.
- **Qué afirmación respalda sobre `codex exec --json`:** la
  documentación oficial confirma que produce salida JSONL. La página
  citada no enumera el catálogo exhaustivo de tipos de evento.
- **Límite explícito:** los identificadores `thread.started`,
  `turn.*`, `item.*` y `error` quedan ligados instrumentalmente a la
  versión `0.147.0` y pendientes de observación en una ejecución real de
  Capa B. El monitor preparado contra esos identificadores no constituye
  evidencia de que el catálogo sea completo.
- **Condición de revalidación:** un cambio de versión del CLI, cualquier
  cambio en `debug_sandbox.rs`, `shell_environment.rs` o `config_types.rs`,
  cualquier cambio en la composición del modo `Core`, en la implementación de
  red del sandbox Windows, en la sintaxis canónica de filtros o en el formato
  JSONL de `codex exec --json`.
