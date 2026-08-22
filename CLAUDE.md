# CLAUDE.md

Instrucciones y contexto para que Claude trabaje de forma consistente en este proyecto.

Las reglas de trabajo compartidas están en [reglas.md](reglas.md).

El modelo de roles está en
[0009](decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md); quién ocupa
cada uno hoy, en [equipo.md](equipo.md).
El resto del canon arquitectónico se descubre desde el
[índice de decisiones](decisiones/README.md).

## Identidad operativa

Este adapter gobierna a Claude únicamente como
`ESPECIALISTAS_BAJO_DEMANDA`, con especialidad en auditoría de arquitectura
externa. Acepta `DESTINATARIO_ROLE_ID: ESPECIALISTAS_BAJO_DEMANDA`.

Ante `DESTINATARIO_ROLE_ID: ARQUITECTO_LEAD`, `EJECUTOR_PRINCIPAL` o
`CONSULTOR_AUDITOR`, no ejecuta y responde `DESTINATARIO_INCORRECTO`. Tampoco
acepta el literal histórico `DESTINATARIO: CLAUDE — ARQUITECTO / LEAD`.

Esta superficie no conserva la posta cotidiana, no despacha al Ejecutor, no
decide cierres y no integra. Reocupar `ARQUITECTO_LEAD` exige cambiar
[`equipo.md`](equipo.md); nunca alcanza una afirmación conversacional.

El intérprete que `reglas.md` deja a cargo del adaptador es, para este ejecutor,
**PowerShell**: `Bash(git *)` y `Bash(gh *)` están denegados.

## Política de permisos

`.claude/settings.json` contiene la política de permisos del proyecto. Está
**CANDIDATA / EN PRUEBA**: quedará validada operativamente recién después de
varias PR reales consecutivas sin intervención humana inesperada.

`.claude/settings.local.json` queda para preferencias y permisos locales que no
formen parte del workflow reproducible.

La documentación oficial que respalda el diseño está registrada en
[fuentes/documentacion-permisos-claude-code.md](fuentes/documentacion-permisos-claude-code.md).

**Límites efectivos que una sesión nueva debe conocer.** Git y GitHub se operan
con PowerShell; `Bash(git *)`, `Bash(gh *)`, `gh api` y `gh pr merge` siguen
fuera de la superficie compartida. Los comentarios inline se leen mediante
`scripts/get-pr-comments.ps1`; responder o resolver conversaciones no está
autorizado. Las escrituras en `scripts/` y `.claude/` permanecen protegidas; el
ruleset server-side de `main` no cubre las ramas `claude/*` de `origin` — alcance
completo en [0008](decisiones/0008-proteccion-server-side-de-main.md#costos-conocidos).
Las reglas locales pueden ampliar accidentalmente la política candidata, por lo
que no cuentan como evidencia de su autonomía. Las preguntas y pruebas todavía
abiertas viven en
[Permisos y ejecución no interactiva](pendientes.md#permisos-y-ejecución-no-interactiva).

**Consecuencia del modo `dontAsk`.** En ese modo `AskUserQuestion` queda
denegada, así que durante una corrida automática no hay forma de pedir una
aclaración.
