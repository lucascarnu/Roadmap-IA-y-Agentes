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

Las decisiones del workflow y las mediciones de las pruebas son canónicas en
[0007](decisiones/0007-flujo-de-desarrollo-asistido-sobre-git-y-github.md). Acá
quedan únicamente las acciones futuras que se derivan de ellas.

### Solicitud y lectura de revisiones

- Automatizar la solicitud de revisión, incluido el **Re-request review** que
  GitHub ofrece después de nuevos commits en una PR ya revisada.
- Diseñar la espera: consultar estado **sin polling agresivo**, con timeout y
  reintentos razonables. Las latencias observadas están en `0007`.
- Al procesar una review, leer las **tres** fuentes: el cuerpo de la review, los
  comentarios inline y los *suppressed comments*. Una review puede declarar
  "0 new comments" y traer igualmente hallazgos en el cuerpo.
- Verificar que la automatización permita sustituir ejecutor y revisor, según el
  principio de reemplazabilidad de `0007`.

### Evaluación del revisor

- Probar un nivel de esfuerzo superior a Lite **sobre código real** y comparar
  calidad y costo. Balanced ya se probó sobre documentación.
- Definir qué debe entregar el revisor cuando detecte un problema real con
  solución clara: explicar el problema, señalar dónde está, proponer una
  corrección concreta y evitar cambios meramente cosméticos.
- Evaluar proporcionalidad documental sin imponer máximos rígidos de líneas.

### Permisos y ejecución no interactiva

Una automatización desatendida no puede quedar bloqueada por prompts de permisos.

- Comprobar **qué permisos sobreviven** al cerrar y volver a iniciar Claude Code.
  Durante el uso interactivo fueron apareciendo autorizaciones nuevas para
  comandos concretos, por ejemplo `git merge-base *`.
- Antes de declarar lista la automatización, hacer una **prueba completa de
  reinicio**: cerrar Claude Code, volver a abrirlo en este repositorio y
  comprobar las operaciones habituales de Git y GitHub que necesita el workflow.
- Diseñar, si hace falta, **permisos persistentes explícitos** para las
  operaciones normales del proyecto, sin recurrir a modos globales de bypass.
- Registrar como **bloqueo de automatización** cualquier solicitud interactiva
  inesperada dentro de un flujo que debería ser autónomo.

**Criterio de aceptación.** Completar varias PR reales consecutivas sin que el
usuario tenga que aprobar herramientas ni comandos durante el circuito normal.

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
reales completadas con el workflow. Al cumplirse, evaluar además si corresponde
promoverlo a `proyectos/`.

---

`pendientes.md` es una lista operativa viva. Cuando aparezca algo que deba
hacerse más adelante, primero se evalúa si merece quedar registrado acá, en vez
de depender de la memoria o del contexto de una conversación.
