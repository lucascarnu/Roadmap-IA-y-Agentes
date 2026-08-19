---
formato: documentacion
plataforma: web
origen: "https://learn.chatgpt.com/docs/developer-commands?surface=cli"
autor: OpenAI
categoria: agentes-de-desarrollo
clasificacion: oro
materiales:
  - "https://raw.githubusercontent.com/openai/codex/rust-v0.147.0/codex-rs/cli/src/debug_sandbox.rs"
  - "https://learn.chatgpt.com/docs/config-file/config-advanced"
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
- **Qué afirmación respalda sobre `codex exec --json`:** la
  documentación oficial confirma que produce salida JSONL. La página
  citada no enumera el catálogo exhaustivo de tipos de evento.
- **Límite explícito:** los identificadores `thread.started`,
  `turn.*`, `item.*` y `error` quedan ligados instrumentalmente a la
  versión `0.147.0` y pendientes de observación en una ejecución real de
  Capa B. El monitor preparado contra esos identificadores no constituye
  evidencia de que el catálogo sea completo.
- **Condición de revalidación:** un cambio de versión del CLI, cualquier
  cambio en `debug_sandbox.rs`, o cualquier cambio observable en el
  formato JSONL de `codex exec --json`.
