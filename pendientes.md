# Pendientes

Asuntos que hay que retomar más adelante y que no deben depender de la memoria
del usuario ni del contexto de una conversación.

No es una entidad del modelo, no lleva frontmatter y no se indexa junto al
contenido. Tampoco es una segunda lista de proyectos: lo que tenga alcance y
resultado propios va a `proyectos/`, y lo que sea material crudo sin clasificar
va a `inbox.md`. Acá viven los asuntos operativos y transversales —cómo
trabajamos, qué falta probar, qué habría que extraer— que no encajan en ninguna
entidad.

## Automatización del workflow de desarrollo asistido

El marco conceptual está en
[0007](decisiones/0007-flujo-de-desarrollo-asistido-sobre-git-y-github.md). Acá
quedan los pendientes operativos que se derivan de él.

### Ya observado

- GitHub funciona como canal asíncrono entre ejecutor y revisor.
- Copilot Code Review se solicita **manualmente** en el estado actual.
- Después de nuevos commits en una PR ya revisada, GitHub ofrece **Re-request
  review**.
- En cuatro solicitudes se observaron latencias de entre **69 y 155 segundos**.
  Es una medición inicial, **no un SLA**.
- Una review `COMMENTED` **no bloquea por sí sola** la integración.
- Para procesar una review de Copilot **no alcanza con leer los comentarios
  inline**. Hay que inspeccionar:
  - el cuerpo completo de la review;
  - los comentarios inline;
  - los *suppressed comments*.
- **"0 new comments" no implica "0 observaciones".** Una review puede declarar
  cero comentarios y traer hallazgos suprimidos en el cuerpo.
- Las tres primeras revisiones de prueba consumieron **20.16 AI Credits en
  total**. Medición inicial: no extrapolar un costo fijo por review.

### Requisitos de diseño para la automatización futura

- Claude Code es el ejecutor principal actual, pero el diseño **debe permitir
  reemplazarlo**.
- El revisor **también debe ser reemplazable**.
- **No hacer polling agresivo.** Esperar, consultar estado y aplicar timeout y
  reintentos razonables.
- Cuando el revisor detecte un problema real y la solución sea clara, debería:
  - explicar el problema;
  - señalar dónde está;
  - proponer una corrección concreta;
  - evitar cambios meramente cosméticos.
- **El revisor propone; el ejecutor evalúa** y aplica, rechaza o acepta
  parcialmente.
- Un desacuerdo material persistente sin evidencia concluyente **se escala al
  usuario**.
- Evaluar proporcionalidad documental **sin imponer máximos rígidos de líneas**.
- Copilot está aceptado **actualmente** como revisor complementario, no como
  autoridad final ni como supervisor fuerte probado.
- **No construir todavía** un harness multiagente propio.
- **No activar nuevas capas de complejidad** sin una necesidad real demostrada.

### Por probar

- Un nivel de revisión superior a Lite / low effort, comparando calidad y costo
  contra Lite.

### Permisos y ejecución no interactiva

**Ya observado**

- Durante el uso interactivo aparecieron autorizaciones nuevas para comandos Git
  concretos, por ejemplo `git merge-base *`.

**Requisitos**

- Una automatización desatendida **no puede quedar bloqueada por prompts de
  permisos**.
- La automatización futura debe funcionar **después de reiniciar Claude Code**, y
  no depender de permisos válidos solo durante una sesión.
- **No usar modos globales de bypass de permisos** como solución por defecto.
- Una solicitud interactiva inesperada dentro de un flujo que debería ser
  autónomo **es un bloqueo de automatización** y se registra como tal.

**Por hacer**

- Comprobar **qué permisos sobreviven** al cerrar y volver a iniciar Claude Code.
- Antes de declarar lista la automatización, hacer una **prueba completa de
  reinicio**: cerrar Claude Code, volver a abrirlo en este repositorio y
  comprobar las operaciones habituales de Git y GitHub que necesita el workflow.
- Después, si hace falta, diseñar **permisos persistentes explícitos** para las
  operaciones normales del proyecto.

**Criterio futuro de aceptación**

- Completar varias PR reales consecutivas sin que el usuario tenga que aprobar
  herramientas ni comandos durante el circuito normal.

## Entregables reutilizables

### Extraer filosofía general de desarrollo con IA

Cuando el primer MVP local esté funcionando y el workflow de desarrollo haya sido
usado en varias PR reales, revisar la experiencia acumulada y los documentos
relevantes del proyecto para crear un documento independiente, provisionalmente
`FILOSOFIA-DESARROLLO-CON-IA.md`.

**Objetivo.** Extraer únicamente principios generales y reutilizables para
futuros proyectos, sin copiar decisiones específicas de Roadmap IA y Agentes.
Debe servir como documento inicial que el usuario pueda entregar a una IA al
comenzar un proyecto nuevo.

**Revisar como mínimo:** `vision.md`, `reglas.md`, `decisiones/`, `AGENTS.md`,
`CLAUDE.md` y la experiencia práctica acumulada durante la construcción del MVP.

**No copiar automáticamente:**

- entidades específicas de este proyecto;
- Flask, PyYAML u otro stack particular;
- `oro` / `plata` / `pendiente` / `descartada`;
- la estructura de carpetas específica;
- las mediciones de Copilot;
- decisiones locales del producto.

**Principio.** Extraer la filosofía, no convertir este repositorio en una
plantilla rígida.

**Disparador.** Cuando el primer MVP local esté funcionando y ya haya varias PR
reales completadas con el workflow.

---

`pendientes.md` es una lista operativa viva. Cuando aparezca algo que deba
hacerse más adelante, primero se evalúa si merece quedar registrado acá, en vez
de depender de la memoria o del contexto de una conversación.
