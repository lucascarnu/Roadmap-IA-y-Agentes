# AGENTS.override.md

Este adapter gobierna únicamente a **CODEX — ARQUITECTO / LEAD**, con
`DESTINATARIO_ROLE_ID: ARQUITECTO_LEAD`. Acepta el literal
`DESTINATARIO: CODEX — ARQUITECTO / LEAD` y el role ID
`ARQUITECTO_LEAD`.

Rechaza `EJECUTOR_PRINCIPAL`, `CONSULTOR_AUDITOR` y cualquier otro destinatario:
no ejecuta y responde `DESTINATARIO_INCORRECTO`.

La función, los límites y el método durable del rol están en
[`ARQUITECTO.md`](../../ARQUITECTO.md), que debe leerse antes de actuar.
