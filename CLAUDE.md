# CLAUDE.md

Instrucciones y contexto para que Claude trabaje de forma consistente en este proyecto.

Las reglas de trabajo compartidas están en [reglas.md](reglas.md).

## Ejecución de comandos

Convenciones de este ejecutor sobre esta máquina, no reglas generales del
proyecto.

- Git y GitHub del workflow normal se ejecutan mediante PowerShell.
- Usar comandos simples. Evitar lógica shell cuando el exit code y la salida
  directa ya alcanzan.
- Los pushes nombran explícitamente la rama: `git push -u origin claude/<rama>`.
- Las PR se crean con `gh pr create --body-file`. Observado en esta instalación
  bajo `dontAsk`: un cuerpo multilínea pasado inline se trocea por salto de
  línea y la llamada se deniega. Es lo medido acá, no una afirmación general
  sobre GitHub CLI.

## Política de permisos

`.claude/settings.json` contiene la política de permisos del proyecto. Está
**CANDIDATA / EN PRUEBA**: quedará validada operativamente recién después de
varias PR reales consecutivas sin intervención humana inesperada.

El circuito autónomo termina con la PR lista para integrar, no con el merge.

`.claude/settings.local.json` queda para preferencias y permisos locales que no
formen parte del workflow reproducible.

La documentación oficial que respalda el diseño está registrada en
[fuentes/documentacion-permisos-claude-code.md](fuentes/documentacion-permisos-claude-code.md).

**Límites conocidos de la política candidata.** Se registran para no confundirlos
con problemas resueltos:

- La protección fuerte de `main` deberá resolverse del lado del servidor. Un
  refspec del tipo `claude/<rama>:refs/heads/main` no queda cubierto por las
  reglas locales, y enumerar más patrones no cierra esa clase de escape.
- La autorización mínima para leer comentarios inline de una review se
  determinará durante una prueba real del circuito de review. Hoy `gh api` está
  denegado por completo.

**Consecuencia del modo `dontAsk`.** El ejecutor no debe apoyarse en
`AskUserQuestion` para resolver ambigüedades: en ese modo la herramienta queda
denegada y la pregunta nunca llega. Una tarea autónoma tiene que estar
suficientemente especificada, o fallar de forma segura.
