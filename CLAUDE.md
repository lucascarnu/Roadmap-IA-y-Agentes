# CLAUDE.md

Instrucciones y contexto para que Claude trabaje de forma consistente en este proyecto.

Las reglas de trabajo compartidas están en [reglas.md](reglas.md).

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

**Límites conocidos de la política candidata.** Se registran para no confundirlos
con problemas resueltos:

- `main` tiene protección server-side efectiva: el ruleset `Proteger main`, sobre
  la rama por defecto, bloquea borrado y force push, exige pull request y
  historial lineal, admite solo squash y no tiene lista de bypass.
- Ese ruleset **no cubre las ramas `claude/*`** de `origin`. Su borrado y su
  reescritura dependen por ahora de guardarraíles locales.
- La protección contra redirecciones solo fue probada para las formas con
  espacios, `> archivo` y `>> archivo`. Las formas sin espacios siguen abiertas.
- De una review solo se pueden **leer** los comentarios inline, con
  `scripts/get-pr-comments.ps1`, que es el único acceso autorizado. Responder y
  resolver hilos sigue fuera de alcance, y `gh api` directo sigue denegado.

**Consecuencia del modo `dontAsk`.** En ese modo `AskUserQuestion` queda
denegada, así que durante una corrida automática no hay forma de pedir una
aclaración.
