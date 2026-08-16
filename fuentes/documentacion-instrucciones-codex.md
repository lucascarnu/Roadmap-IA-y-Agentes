---
formato: documentacion
plataforma: web
origen: "https://developers.openai.com/codex/guides/agents-md"
autor: OpenAI
categoria: agentes-de-desarrollo
clasificacion: oro
---

# Documentación oficial de instrucciones de Codex

Documentación oficial sobre el descubrimiento y la precedencia de archivos de
instrucciones de Codex, junto con la referencia de las opciones de configuración
relacionadas.

## Páginas consultadas

Consultadas el **2026-08-15**, en el contexto de **Codex CLI 0.147.0** y Codex
Desktop:

- `https://developers.openai.com/codex/guides/agents-md`
- `https://developers.openai.com/codex/config-reference`

La primera URL redirigía durante la consulta a
`https://learn.chatgpt.com/docs/agent-configuration/agents-md`; la segunda, a
`https://learn.chatgpt.com/docs/config-file/config-reference`.

Consultadas además el **2026-08-16**:

- `https://learn.chatgpt.com/docs/codex/cli`
- `https://learn.chatgpt.com/codex/developer-commands?surface=cli`

**Dónde vive hoy la documentación.** Todo el árbol `/codex/*` de
`developers.openai.com` responde `308 Permanent Redirect` hacia
`learn.chatgpt.com`; sólo la raíz del sitio anterior sigue sirviendo contenido.
Comprobado con cuatro rutas el 2026-08-16. La referencia completa de comandos no
está bajo `/docs`: `https://learn.chatgpt.com/docs/codex/developer-commands`
devuelve `404`, y la que responde es
`https://learn.chatgpt.com/codex/developer-commands?surface=cli`.

## Qué afirmaciones respalda

**DOCUMENTADO — 2026-08-15.**

- Codex busca las instrucciones de proyecto desde la raíz —normalmente la raíz
  Git— hasta el directorio de trabajo actual.
- En cada directorio busca primero `AGENTS.override.md`, después `AGENTS.md` y
  por último los nombres configurados en `project_doc_fallback_filenames`.
- Incorpora como máximo un archivo de instrucciones por directorio.
- Concatena los archivos encontrados desde la raíz hacia el directorio de
  trabajo.
- Las instrucciones más cercanas al directorio de trabajo aparecen después y
  prevalecen sobre instrucciones incompatibles más generales.
- Un nombre arbitrario como `CONSULTOR.md` no tiene semántica especial de
  descubrimiento: sólo se consideran los nombres reconocidos o configurados.
- Los nombres fallback se prueban después de `AGENTS.override.md` y `AGENTS.md`;
  por lo tanto, no desplazan al archivo preferido existente en el mismo
  directorio.

**DOCUMENTADO — 2026-08-16**, sobre reanudación de sesiones, desde
`https://learn.chatgpt.com/codex/developer-commands?surface=cli`:

- `codex resume` continúa una sesión interactiva por identificador o reanuda la
  conversación más reciente.
- `--last` *"Skip the picker and resume the most recent chat from the current
  working directory"*. Es decir: **el alcance de "la más reciente" está acotado al
  directorio de trabajo actual**, no es global del usuario.
- `--all` *"Include sessions outside the current working directory when selecting
  the most recent session"*: es lo que amplía ese alcance, y hay que pedirlo
  expresamente.
- El identificador de sesión —UUID o nombre— es un argumento posicional opcional:
  se omite cuando se usa `--last`, y se pasa cuando se quiere una sesión concreta.
- Si el directorio actual difiere del directorio guardado de la sesión, Codex
  pregunta cuál usar; `tui.resume_cwd` en `"current"` o `"session"` evita esa
  pregunta y un `--cd` explícito prevalece.
- `https://learn.chatgpt.com/docs/codex/cli` describe la función como *"Reopen a
  recent chat from the current repository, or search across local chats when you
  need to return to older work"*, y remite a la referencia de comandos.

Esto cierra una limitación que el QA de identidad había dejado abierta: la
reanudación del Consultor se hizo con `codex resume --last` desde `.consultor/`, y
ahora está documentado que ese alcance es el del directorio de trabajo. Sigue
siendo cierto que el comentario publicado no identificaba la sesión: para que una
prueba de reanudación quede demostrada por su artefacto, hay que registrar el
identificador de sesión, que la documentación confirma que existe y es aceptado
como argumento.

## Observación local

**OBSERVACIÓN LOCAL — 2026-08-15.** En el rollout fallido del Consultor, el
contenido de `AGENTS.md` cargado automáticamente quedó preservado de forma
explícita después de una compactación, mientras que `CONSULTOR.md` había entrado
como salida de una herramienta. Tras compactar, la sesión comenzó a aplicar el
adapter automático de raíz y rechazó también el destinatario correcto del
Consultor.

Esta observación describe una ejecución de Codex Desktop. No demuestra una
garantía universal sobre cómo toda compactación futura preservará cada clase de
contenido.

**OBSERVACIÓN LOCAL — 2026-08-16.** En Windows, con Codex CLI `v0.147.0` y Codex
Desktop, se validó el procedimiento operativo para separar las dos identidades:
el Ejecutor usa un proyecto cuya carpeta de origen es
`C:\Proyectos\Roadmap-IA-y-Agentes`, mientras que el Consultor usa un segundo
proyecto cuya carpeta de origen es
`C:\Proyectos\Roadmap-IA-y-Agentes\.consultor`. Ambos operan sobre el mismo
repositorio Git; no son worktrees, ramas ni repositorios distintos. El cwd hace
que el segundo proyecto cargue `.consultor/AGENTS.override.md`; el nombre visible
del chat no determina la identidad.

Este procedimiento es conocimiento operativo observado para esas versiones, ese
sistema operativo y esa fecha, no una garantía permanente del producto.

## Por qué oro

La documentación determina el mecanismo durable elegido para separar dos roles
Codex dentro del mismo repositorio: un adapter raíz por defecto y un
`AGENTS.override.md` más cercano al directorio de trabajo del Consultor.

## Vigencia

Revalidar cuando cambie de forma relevante Codex, la documentación oficial de
descubrimiento de instrucciones o el comportamiento observado de precedencia y
compactación. Revalidar también el procedimiento de proyectos separados por cwd
cuando cambien Codex CLI o Desktop, Windows, o la forma en que Codex Desktop
selecciona la carpeta de origen y el directorio de trabajo de un proyecto.

Revalidar además cuando cambie el host donde OpenAI sirve esta documentación
—hoy `learn.chatgpt.com`, con `developers.openai.com` redirigiendo—, porque de eso
depende la allowlist de `WebFetch`; y cuando cambie el comportamiento de
`codex resume`, su alcance por directorio de trabajo o sus banderas.
