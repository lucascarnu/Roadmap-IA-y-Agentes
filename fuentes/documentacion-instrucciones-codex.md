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

## Por qué oro

La documentación determina el mecanismo durable elegido para separar dos roles
Codex dentro del mismo repositorio: un adapter raíz por defecto y un
`AGENTS.override.md` más cercano al directorio de trabajo del Consultor.

## Vigencia

Revalidar cuando cambie de forma relevante Codex, la documentación oficial de
descubrimiento de instrucciones o el comportamiento observado de precedencia y
compactación.
