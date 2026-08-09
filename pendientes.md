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
[0007](decisiones/0007-flujo-de-desarrollo-asistido-sobre-git-y-github.md),
[0008](decisiones/0008-proteccion-server-side-de-main.md) y
[0009](decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md). Acá quedan
únicamente las acciones futuras que se derivan de ellas.

### Solicitud y lectura de revisiones

- **Solicitud automática: probada localmente.**
  `gh pr edit <PR> --add-reviewer "@copilot"` produjo una review real sobre el
  commit indicado, sin intervención humana. Queda pendiente el **Re-request
  review** que GitHub ofrece después de nuevos commits en una PR ya revisada.
- **`gh pr edit` no está autorizado por la política compartida.** Hoy funciona
  por la regla amplia de `.claude/settings.local.json`. Al depurar ese archivo,
  el circuito pierde la capacidad de solicitar revisiones y de actualizar cuerpos
  de pull request, salvo que se agregue al `allow` compartido.
- Diseñar la espera: consultar estado **sin polling agresivo**, con timeout y
  reintentos razonables. Las latencias observadas están en `0007`.
- **Falta un mecanismo autorizado de espera y reintento** para estados remotos.
  Hoy no hay forma permitida de esperar entre consultas, así que el circuito no
  puede seguir por sí mismo el estado de una revisión en curso.
- Evaluar coordinación **basada en eventos** con GitHub Actions o webhooks, si
  las pull requests reales demuestran que esperar es un cuello de botella.
- Al procesar una review, leer las **tres** fuentes: el cuerpo de la review, los
  comentarios inline y los *suppressed comments*. Una review puede declarar
  "0 new comments" y traer igualmente hallazgos en el cuerpo.
- Verificar que la automatización permita sustituir ejecutor y revisor, según el
  principio de reemplazabilidad de `0007`.
- **Resolución de conversaciones.** La PR #9 demostró que un hilo de review sin
  resolver deja la pull request en `BLOCKED` y el merge no se ofrece. El circuito
  automático futuro tiene que incorporar ese paso.

#### Lectura automática de comentarios inline

**Resuelto para lectura.** `scripts/get-pr-comments.ps1` es hoy el acceso
autorizado: recibe un número de pull request validado, usa repositorio fijo y
ejecuta una sola llamada de lectura contra
`GET /repos/{owner}/{repo}/pulls/{pull_number}/comments`. `gh api` directo sigue
denegado. El ejecutor lee los hallazgos inline sin intervención humana.

Lo que sigue abierto:

- **Responder y resolver hilos.** El wrapper es de solo lectura, así que el
  circuito todavía no puede desbloquear una pull request detenida por
  conversaciones sin resolver.
- `agynio/gh-pr-review` queda como **candidato** para ese tramo. Sujeto a evaluar
  cadena de suministro, scopes y fijación de versión, y a una objeción de
  gobernanza: si el ejecutor resuelve sus propios hilos, deja sin efecto el
  *Require conversation resolution*.
- **Leer todos los hallazgos de una review sigue siendo requisito previo** para
  declarar validado un circuito desatendido, y ahora se cumple para los
  comentarios inline. El cuerpo de la review y sus *suppressed comments* se leen
  con `gh pr view`, que sí los incluye.

### Evaluación del revisor

- Probar un nivel de esfuerzo superior a Lite **sobre código real** y comparar
  calidad y costo. Balanced ya se probó sobre documentación y sobre configuración.
- Los modos observados son **Lite**, **Balanced** y **Max**. `Low` y `High` son
  severidades de un hallazgo individual, no modos de esfuerzo: no confundirlos.
- En la PR #9, sobre el mismo commit, Balanced expuso hallazgos materiales que
  Lite no había mostrado. Es evidencia **de esa prueba**, sobre configuración y
  documentación, no una conclusión general sobre los modos.
- El modo solicitado se observó en el **timeline** de GitHub. No hay evidencia de
  que `gh pr view --json` lo exponga como campo estructurado, y no se consultó la
  API REST.
- El **Review effort level se configura a nivel de repositorio**, en Settings →
  Copilot → Code review. En este repositorio el valor observado es **Balanced**,
  así que no hace falta elegir el modo en cada solicitud. **Max** figura como
  *Coming soon* y todavía no está disponible, de modo que la política de `0009`
  que lo reserva para arquitectura y seguridad describe un modo que aún no puede
  usarse.
- Definir qué debe entregar el revisor cuando detecte un problema real con
  solución clara: explicar el problema, señalar dónde está, proponer una
  corrección concreta y evitar cambios meramente cosméticos.
- Evaluar proporcionalidad documental sin imponer máximos rígidos de líneas.

### Agente investigador de soluciones externas

Rol todavía **no adoptado**: no figura en el Nivel A de `0009` ni tiene ocupante
en `equipo.md`.

- Es un rol **separado** de Arquitecto / Lead y de Ejecutor. Se activa ante un
  hueco, una limitación o una duda material sobre si ya existe una solución.
- Busca primero capacidades nativas de la plataforma que ya se usa, y después
  APIs, configuraciones, skills, plugins, MCP, extensiones, librerías y
  herramientas. Es el orden que `reglas.md` ya fija en "Buscar antes de
  construir".
- Devuelve **alternativas, fuentes, riesgos y una recomendación**. No implementa
  ni decide arquitectura.
- **Gemini** queda como candidato inicial preferente, sin asignación todavía.
- Objetivo futuro: que el ejecutor y el arquitecto puedan consultarlo sin que el
  director haga de intermediario.

### Permisos y ejecución no interactiva

Una automatización desatendida no puede quedar bloqueada por prompts de permisos.

**Verificado sobre la configuración efectiva.** Las reglas concedidas con "Yes,
and don't ask again" quedan persistidas en `.claude/settings.local.json`. Entre
ellas está `PowerShell(git *)`, que ya cubría un `git merge-base …` simple. Los
prompts repetidos que observamos ocurrieron con comandos compuestos del tipo
`git merge-base ...; if ($?) { ... } else { ... }`, y la causa respaldada por la
configuración es que **el tramo `if (...)` no estaba autorizado**, no que
`git merge-base` hubiera perdido su permiso. La regla específica
`PowerShell(git merge-base *)` es redundante frente a `PowerShell(git *)` y no
resuelve ese tramo.

El problema **no es concatenar con `;`**: ya se comprobó que varios comandos Git
encadenados con `;` se ejecutan sin prompt cuando cada tramo está cubierto.

**Verificado tras reiniciar Claude Code.** Se cerró Claude Code por completo con
`exit` y se abrió una sesión nueva desde el mismo repositorio. En esa sesión se
ejecutaron, uno por uno y sin lógica adicional, `git status`, `git branch`,
`git merge-base --is-ancestor origin/main HEAD` y `gh pr list`. Ninguno provocó
una solicitud de permiso, `git merge-base` terminó con exit code 0 y no hubo
modificaciones al repositorio ni a la configuración.

Conclusión: las reglas persistidas en `.claude/settings.local.json` **sobreviven
entre sesiones** y se reutilizan correctamente al reiniciar. La hipótesis de
pérdida de permisos entre sesiones queda **descartada** para las operaciones
probadas, y el resultado refuerza que los prompts anteriores se debieron al
tramo PowerShell no cubierto (`if (...)`), no a un `git merge-base` simple.

**Alcance de esa verificación.** Vale únicamente para comandos shell de lectura
ya cubiertos por una regla persistida. **No** implica que el circuito completo de
una PR se ejecute sin prompts: en la misma sesión aparecieron dos solicitudes de
autorización, una de edición y otra de shell, descritas abajo.

Los dos apartados que siguen son el **registro histórico de la investigación**,
anterior a que la política compartida existiera. El estado actual está más abajo.

#### Permisos de edición

Hecho observado: en esa misma sesión nueva, después de que los cuatro comandos de
lectura reutilizaran sus permisos persistidos sin pedir nada, el primer intento
de modificar `pendientes.md` **volvió a pedir autorización de edición**. El
usuario eligió permitir ediciones durante la sesión.

Conclusión: los **permisos shell persistidos** y la **autorización interactiva
para editar archivos** son problemas distintos y se resuelven por separado. Una
automatización desatendida también debe resolver la capacidad de edición sin
intervención del usuario. Queda pendiente evaluar la forma segura de habilitar
edición no interactiva dentro de la política completa de permisos; todavía no se
aplica ninguna configuración.

#### Diferencia entre Bash y PowerShell

Hecho observado: existe una regla persistida `PowerShell(git push *)`, pero el
push de esta rama se ejecutó **mediante Bash**. `Bash(git push *)` no estaba
autorizado y apareció un prompt de permiso.

Conclusión: autorizar una operación en PowerShell **no garantiza** que quede
autorizada si el agente decide ejecutarla mediante Bash. El permiso está atado al
namespace de la herramienta, no a la operación. La automatización futura debe
controlar o contemplar explícitamente **qué herramienta usa para cada
operación**, en vez de acumular permisos amplios de forma improvisada. Sigue
pendiente diseñar una política segura y suficientemente determinista.

La política compartida ya vive en `.claude/settings.json`, en estado **CANDIDATA
/ EN PRUEBA**. Lo que sigue abierto:

- Registrar como **bloqueo de automatización** cualquier solicitud interactiva
  inesperada dentro de un flujo que debería ser autónomo.
- **Depurar `.claude/settings.local.json`**, que conserva reglas amplias, muertas
  y redundantes. Recién después se puede probar la política compartida sin
  contaminación local. Nunca recurrir a modos globales de bypass.
- `defaultMode: dontAsk` **ya se validó** en una sesión nueva y limpia, sin
  `settings.local.json`: un comando autorizado se ejecutó, uno no autorizado se
  denegó solo, y no hubo prompts. Era la hipótesis central de la política. Lo que
  falta es ejercitarla en el circuito real, no volver a probar el modo.
- **Volver a una rama `claude/*` existente no está autorizado.** La política
  permite crear ramas `claude/*` y volver a `main`, pero no regresar a una rama
  de trabajo ya creada. Observado durante la PR #9.
- **Reconciliar una rama contra `main` tampoco está autorizado.** `git merge` no
  figura en la política compartida: la reconciliación de la PR #10 funcionó por
  la regla amplia `PowerShell(git *)` de `.claude/settings.local.json`. Al
  depurar ese archivo, el circuito pierde la capacidad de rebasar o reconciliar,
  que es un paso normal cuando hay más de una PR abierta. Hace falta una
  capacidad compartida y acotada; no se resuelve ahora.
- **`git branch -d claude/*` fue denegado** al terminar la PR #9, pese a existir
  una regla `allow` que aparentemente lo cubre, y la rama local no pudo
  limpiarse de forma autónoma. La denegación es un **hecho observado**. Como
  **hipótesis todavía no probada**, podría deberse a una colisión con el `deny`
  de `git branch -D*` si el emparejamiento de patrones no distingue mayúsculas.
  Diseñar una prueba controlada antes de tocar ninguna regla.
- **La redirección sin espacios ya se probó.** Cuatro sondas en el mismo entorno:
  escribe en la raíz y en una carpeta común, y queda **bloqueada** en `scripts/`
  y en `.claude/`. Las reglas `deny Edit(...)` alcanzan también a las escrituras
  por subproceso. Lo que sigue siendo cierto es que los patrones `> archivo` y
  `>> archivo` del `deny` no cubren las formas sin espacios: no son ellos los que
  protegen, sino la capa de escritura, que decide antes.
- **Wrapper seguro de push: propuesta pendiente, no decisión.** Un script
  versionado que publique la rama actual sin aceptar flags ni refspecs
  eliminaría la clase entera de escapes por comodín, en lugar de enumerarlos.
  Reevaluar **después** del cambio de ejecutor: otro ejecutor puede tener otro
  modelo de permisos y volverlo innecesario.
- **Cuerpo multilínea de una pull request.** La regla general está en
  `reglas.md`; la evidencia es específica de Claude Code: bajo `dontAsk` un
  cuerpo pasado en línea se troceó por salto de línea y la llamada fue denegada,
  mientras que `--body-file` funcionó.
- Definir **criterios objetivos que habiliten la integración automática** por
  clase de riesgo, según deja abierto `0009`.

**Criterio de aceptación.** Completar varias PR reales consecutivas sin que el
usuario tenga que aprobar **comandos ni ediciones** durante el circuito normal.
Todavía no se cumple.

## Entregables reutilizables

Dos documentos independientes y de importancia equivalente: uno recoge los
principios, el otro los patrones operativos probados. Comparten disparador.

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

### Extraer guía operativa de desarrollo con IA

Crear un segundo documento independiente, provisionalmente
`GUIA-OPERATIVA-DESARROLLO-CON-IA.md`.

**Objetivo.** Extraer los **patrones operativos reutilizables** que hayan sido
probados durante proyectos reales. Donde la filosofía recoge principios, esta
guía recoge cómo se trabaja en la práctica.

**Temas candidatos:**

- organización ejecutor / revisor;
- Git y GitHub como canal de coordinación;
- la PR como unidad de trabajo y de revisión;
- asincronía, espera y reintentos;
- procesamiento de reviews;
- permisos y ejecución no interactiva;
- separación entre permisos de edición y permisos de shell;
- diferencias entre Bash, PowerShell u otros ejecutores de comandos;
- guardarraíles para operaciones peligrosas;
- criterios para considerar un workflow realmente autónomo.

**Principio.** Distinguir los principios generales de las implementaciones
circunstanciales. Un detalle temporal de este proyecto —una versión concreta de
una herramienta, el nombre de una regla de permisos, un comportamiento que puede
cambiar en la próxima versión— no debe quedar convertido en regla universal.

### Disparador común

Cuando el primer MVP local esté funcionando y el workflow haya sido usado en
varias PR reales. Al cumplirse, evaluar además si **cada uno de los dos
entregables** merece convertirse en un proyecto propio dentro de `proyectos/`.

---

`pendientes.md` es una lista operativa viva. Cuando aparezca algo que deba
hacerse más adelante, primero se evalúa si merece quedar registrado acá, en vez
de depender de la memoria o del contexto de una conversación.
