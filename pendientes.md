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

- Preferir **comandos simples** cuyo exit code pueda interpretar el agente.
- Evitar construcciones PowerShell (`if`, `Test-Path`) que solo reformatean un
  resultado que el agente ya puede leer directamente y que, además, crean tramos
  de permiso nuevos sin aportar información.
- Definir la **estrategia segura de permisos para automatización desatendida**:
  qué debe quedar autorizado de antemano para que un circuito autónomo no se
  bloquee, sin abrir más superficie de la necesaria.
- Decidir si conviene mantener reglas amplias del tipo `PowerShell(git *)` y
  `PowerShell(gh *)` o reemplazarlas por permisos más acotados.
- Resolver la **edición no interactiva** de archivos como parte de la misma
  política, no como un caso aparte que se aprueba a mano en cada sesión.
- Contemplar el **namespace de la herramienta** (`Bash` vs `PowerShell`) al
  definir la política, y hacer determinista qué ejecutor usa cada operación.
- Registrar como **bloqueo de automatización** cualquier solicitud interactiva
  inesperada dentro de un flujo que debería ser autónomo.
- La política compartida ya vive en `.claude/settings.json`, en estado
  **CANDIDATA / EN PRUEBA**. Falta depurar `.claude/settings.local.json`, que
  conserva reglas muertas y redundantes. Nunca recurrir a modos globales de
  bypass.

**Criterio de aceptación.** Completar varias PR reales consecutivas sin que el
usuario tenga que aprobar **comandos ni ediciones** durante el circuito normal.
Todavía no se cumple: el circuito de esta misma PR requirió dos autorizaciones.

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
