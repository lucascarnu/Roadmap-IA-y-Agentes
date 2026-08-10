# Pendientes

Asuntos que hay que retomar más adelante y que no deben depender de la memoria
del usuario ni del contexto de una conversación.

No es una entidad del modelo, no lleva frontmatter y no se indexa junto al
contenido. Tampoco es una segunda lista de proyectos: lo que tenga alcance y
resultado propios va a `proyectos/`, y lo que sea material crudo sin clasificar
va a `inbox.md`. Acá viven los asuntos operativos y transversales —cómo
trabajamos, qué falta probar, qué habría que extraer— que no encajan en ninguna
entidad.

Cada asunto declara su **estado**: `ABIERTO`, `PARCIAL`, `RESUELTO` o
`POSPUESTO`. Las afirmaciones sobre cómo se comporta el sistema declaran por
separado su **evidencia**, según los estados definidos en
[`reglas.md`](reglas.md#estados-de-evidencia). Un asunto `RESUELTO` se conserva
mientras su evidencia siga explicando por qué el sistema es como es; cuando deje
de aportar, se retira.

## Compuerta PRE-MVP

Lo que tiene que quedar cerrado **antes de la primera pull request de código**
del MVP, según la regla de transición entre fases de `reglas.md`. Cuando todo
esto esté cerrado, la compuerta queda abierta.

### Gobernanza del ejecutor principal

**Estado: RESUELTO. Evidencia: PROBADO LOCALMENTE.** La parte neutral quedó
escrita en `AGENTS.md`; la configuración concreta se verificó en el alcance que
se enumera abajo.

Lo verificado en este entorno, al 2026-08-09:

- El ejecutor principal está instalado y configurado en la máquina del director,
  con su propio archivo de configuración.
- **No se gobierna por listas de comandos permitidos y denegados.** Autoriza por
  **nivel de confianza del proyecto** más un modo de sandbox. Es un modelo
  distinto del de `.claude/settings.json`, y por eso no corresponde inventarle un
  equivalente.
- Este repositorio figura entre sus proyectos de confianza.
- El sandbox opera en modo elevado y acepta automáticamente las solicitudes
  elegibles de escalada puntual; durante la prueba no apareció ninguna ventana
  de aprobación manual.
- Python 3.13.14 funciona mediante escalada puntual.
- GitHub CLI está autenticado como `lucascarnu` y el remoto Git responde.
- El ejecutor sincronizó `main` con `origin/main`, incluida la escritura
  necesaria en `.git`.
- La prueba no modificó la configuración local de permisos de ningún ejecutor.
- Su archivo de instrucciones globales del usuario está vacío, así que hoy no
  contradice nada de lo que fija este repositorio.

El circuito mutable completo se ejecutó en la pull request #14 y quedó integrado:
rama → cambio → verificación → commit → push → pull request → revisión
independiente → convergencia → integración. Se usó **PowerShell** como intérprete
para Git y GitHub CLI, y no hubo ninguna aprobación manual en ninguno de los
pasos. La revisión independiente sobre el HEAD exacto no encontró hallazgos
materiales. La evidencia corresponde a una sola corrida completa; para alcanzar
VALIDADO OPERATIVAMENTE hacen falta varias pull requests reales consecutivas con
el mismo resultado y evidencia suficiente para confiar en el circuito.

### Prueba de sustitución del ocupante de contingencia

**Estado: ABIERTO.** La contingencia está documentada en `equipo.md`; la
sustitución no se probó.

Ejercicio mínimo, sobre una tarea pequeña y real: entregarle al ocupante de
contingencia únicamente el repositorio y el historial de ramas y pull requests, y
comprobar que reconstruye por su cuenta **el estado actual, el próximo paso y qué
no debe hacer todavía**, sin que el director le reconstruya la historia a mano.

Si lo logra, la contingencia queda PROBADA LOCALMENTE. Si falla, se documentan
únicamente los huecos concretos que impidieron la reconstrucción.

### Prueba de reconstrucción del consultor externo

**Estado: RESUELTO. Evidencia: PROBADO LOCALMENTE.** Ejecutada el 2026-08-09.

Se le pidió al consultor externo por hitos que `equipo.md` registra que, leyendo
únicamente un checkout del repositorio, explicara el estado del proyecto, el
siguiente paso y qué no debe hacerse todavía.

Reconstruyó correctamente objetivo, estado general, fase, próxima acción, qué no
hacer, roles, pendientes, y el stack y el alcance del MVP. Además detectó dos
huecos documentales reales, que esta misma pull request corrige.

Con eso queda comprobado lo que la prueba buscaba: **el repositorio alcanza como
memoria crítica del proyecto**, sin que ninguna conversación larga sea
insustituible y sin necesidad de un resumen auxiliar fuera de él. Por eso no se
agregó documentación nueva: se corrigió lo que la prueba encontró mal.

Alcance de lo que se afirma: vale para este consultor, en esta lectura y con el
repositorio en este estado. No es una propiedad permanente del repositorio, y
conviene repetir la prueba si el volumen de documentación crece mucho o si cambia
de forma material cómo está organizada.

## Automatización del workflow de desarrollo asistido

Las decisiones del workflow y las mediciones de las pruebas son canónicas en
[0007](decisiones/0007-flujo-de-desarrollo-asistido-sobre-git-y-github.md),
[0008](decisiones/0008-proteccion-server-side-de-main.md) y
[0009](decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md). Acá quedan las
acciones futuras que se derivan de ellas, junto con el estado y los resultados
observados **mínimos para entender por qué siguen abiertas** o por qué dejaron de
estarlo. Lo que no cabe acá es la argumentación: esa vive en las decisiones.

### Solicitud y lectura de revisiones

**Estado: PARCIAL.** Cómo se procesa una review y cuándo cuenta como válida ya no
vive acá: es regla estable en `0009`, "Coordinación de revisiones". Lo que queda
son las capacidades que al circuito todavía le faltan.

- **Solicitud automática — Estado: RESUELTO. Evidencia: PROBADO LOCALMENTE.**
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
- Verificar que la automatización permita sustituir ejecutor y revisor, según el
  principio de reemplazabilidad de `0007`.
- **Resolución de conversaciones.** La PR #9 demostró que un hilo de review sin
  resolver deja la pull request en `BLOCKED` y el merge no se ofrece. El circuito
  automático futuro tiene que incorporar ese paso.

#### Lectura automática de comentarios inline

**Estado: PARCIAL.** Resuelto para lectura. **Evidencia: PROBADO LOCALMENTE.**
`scripts/get-pr-comments.ps1` es
hoy el acceso autorizado: recibe un número de pull request validado, usa
repositorio fijo y consulta **un único endpoint**
`GET /repos/{owner}/{repo}/pulls/{pull_number}/comments`, con paginación, así que
puede hacer una solicitud por página. `gh api` directo sigue denegado. El
ejecutor lee los hallazgos inline sin intervención humana.

Lo que sigue abierto:

- **Responder y resolver hilos.** El wrapper es de solo lectura, así que el
  circuito todavía no puede desbloquear una pull request detenida por
  conversaciones sin resolver.
- `agynio/gh-pr-review` queda como **candidato** para ese tramo. Sujeto a evaluar
  cadena de suministro, scopes y fijación de versión, y a una objeción de
  gobernanza: si el ejecutor resuelve sus propios hilos, deja sin efecto el
  *Require conversation resolution*.
- **Observabilidad del estado de los hilos.** `isResolved` solo existe en la API
  GraphQL: el endpoint REST de comentarios no lo trae, y `gh pr view --json` no
  expone ningún campo de hilos. Con `gh api` denegado, el ejecutor no puede saber
  qué hilo quedó sin resolver, solo inferirlo desde `mergeStateStatus`.

Los tres canales de una review se leen con lo ya autorizado: los comentarios
inline con el wrapper, y el cuerpo junto con los suprimidos con `gh pr view`.

### Evaluación del revisor

**Estado: ABIERTO.**

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
  *Coming soon* y todavía no está disponible: es una opción del reviewer actual,
  no una política del proyecto.
- Definir qué debe entregar el revisor cuando detecte un problema real con
  solución clara: explicar el problema, señalar dónde está, proponer una
  corrección concreta y evitar cambios meramente cosméticos.
- Evaluar proporcionalidad documental sin imponer máximos rígidos de líneas.

#### Reviewer independiente en dos rondas

**Estado: PARCIAL. Funcionalidad: PROBADA LOCALMENTE. Calidad como reviewer: NO
VALIDADA.**

La calibración anterior al protocolo nuevo sirve para evaluar el harness, no el
modelo: no ofrecía una salida legítima para la incertidumbre y, para varios
hallazgos, carecía de contexto suficiente.

La primera corrida válida bajo el protocolo nuevo completó sus controles, la
llamada y la publicación. Inició el [Reviewer Benchmark
v1](laboratorio/benchmarks/reviewers/v1/README.md): [Caso C, Kimi Open Platform,
Run 1](laboratorio/benchmarks/reviewers/v1/resultados/kimi-open-platform-run-1.md).
La funcionalidad queda PROBADA LOCALMENTE; la calidad todavía NO VALIDADA. La
decisión `REQUEST_CHANGES` estuvo afectada por un falso positivo material. Falta
evaluar consistencia entre corridas y comparar con reviewers vía membresía.

El [primer intento canónico con input congelado](laboratorio/benchmarks/reviewers/v1/resultados/kimi-open-platform-canonical-attempt-1.md)
confirmó la integridad del paquete, pero terminó con `read ECONNRESET` antes de
recibir respuesta; quedó registrado como fallo de transporte y no se repetirá de
inmediato. Una nueva corrida canónica de Open Platform puede hacerse más adelante
si hace falta completar la comparación exacta. Este intento no adopta ni descarta
Open Platform.

La comparación por membresía ya se ejecutó y se auditó: [Caso C, Kimi Code
Moderato, Run 1](laboratorio/benchmarks/reviewers/v1/resultados/kimi-code-moderato-caso-c-run-1.md),
seis hallazgos, decisión `COMMENT` también afectada por un falso positivo
material. **La calidad global sigue NO VALIDADA.** Lo pendiente ahora es correr el
mismo Caso C congelado con un reviewer distinto —no otra vía del mismo modelo—,
que es lo único que permite distinguir si esos puntos del caso son ambiguos o si
hay una tendencia propia del reviewer a elevar hipótesis no verificadas a impacto
material.

Durante reviews reales hay que medir por separado cuántas solicitudes requieren
`OFFICIAL_DOCUMENTATION`, cuántas habrían cambiado un veredicto y cuántas no se
resuelven con el repositorio, GitHub ni Actions. Solo con esos datos corresponde
decidir si se habilita documentación externa, mediante una lista blanca de
dominios y límites de tamaño.

Si el protocolo se sostiene durante varias reviews reales, corresponde
promoverlo a una decisión en `decisiones/`. Hoy no: existe una sola corrida
válida y el proyecto no congela lo que todavía no demostró estabilidad.

### Agente investigador de soluciones externas

**Estado: POSPUESTO.** Rol todavía **no adoptado**: no figura en el Nivel A de
`0009` ni tiene ocupante en `equipo.md`. El fallback puntual de revisión ya está
cubierto por las contingencias de `equipo.md`; formalizar el rol completo espera
a tener evidencia de uso.

- Es un rol **separado** de Arquitecto / Lead y de Ejecutor. Se activa ante un
  hueco, una limitación o una duda material sobre si ya existe una solución.
- Busca primero capacidades nativas de la plataforma que ya se usa, y después
  APIs, configuraciones, skills, plugins, MCP, extensiones, librerías y
  herramientas. Es el orden que `reglas.md` ya fija en "Buscar antes de
  construir".
- Devuelve **alternativas, fuentes, riesgos y una recomendación**. No implementa
  ni decide arquitectura.
- **Gemini** queda como candidato a evaluar, sin asignación todavía y sin trato
  preferencial: la evidencia que lo justifique o lo descarte todavía no existe.
- Objetivo futuro: que el ejecutor y el arquitecto puedan consultarlo sin que el
  director haga de intermediario.

### Permisos y ejecución no interactiva

**Estado: PARCIAL.** Una automatización desatendida no puede quedar bloqueada por
prompts de permisos.

Lo que sigue, hasta el apartado "Estado actual", es **registro histórico** de la
investigación que produjo la política: explica por qué es como es y no describe
pendientes activos.

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

#### Estado actual

La política compartida ya vive en `.claude/settings.json`, en estado **CANDIDATA
/ EN PRUEBA**. Lo que sigue abierto:

- Registrar como **bloqueo de automatización** cualquier solicitud interactiva
  inesperada dentro de un flujo que debería ser autónomo.
- **Depurar `.claude/settings.local.json`**, que conserva reglas amplias, muertas
  y redundantes. Recién después se puede probar la política compartida sin
  contaminación local. Nunca recurrir a modos globales de bypass.
- `defaultMode: dontAsk` desde `.claude/settings.json` está **PROBADO
  LOCALMENTE**: en una sesión nueva y limpia, sin `settings.local.json`, un
  comando autorizado se ejecutó, uno no autorizado se denegó solo y no hubo
  prompts. Era la hipótesis central de la política. Falta **validarlo
  operativamente**, con varias pull requests reales consecutivas dentro del
  circuito normal; no volver a probar el modo.
- **Volver a una rama `claude/*` existente no está autorizado.** La política
  permite crear ramas `claude/*` y volver a `main`, pero no regresar a una rama
  de trabajo ya creada. Observado durante la PR #9.
- **Reconciliar una rama contra `main` tampoco está autorizado.** `git merge` no
  figura en la política compartida: la reconciliación de la PR #10 funcionó por
  la regla amplia `PowerShell(git *)` de `.claude/settings.local.json`. Al
  depurar ese archivo, el circuito pierde la capacidad de **reconciliar por
  merge**, que es un paso normal cuando hay más de una PR abierta. Rebasar no se
  pierde porque nunca estuvo disponible: `PowerShell(git rebase*)` está en el
  `deny` de la política compartida, que prevalece sobre cualquier `allow`. Hace
  falta una capacidad compartida y acotada; no se resuelve ahora.
- **`git branch -d claude/*` fue denegado** al terminar la PR #9, pese a existir
  una regla `allow` que aparentemente lo cubre, y la rama local no pudo
  limpiarse de forma autónoma. La denegación es un **hecho observado**. Como
  **hipótesis todavía no probada**, podría deberse a una colisión con el `deny`
  de `git branch -D*` si el emparejamiento de patrones no distingue mayúsculas.
  Diseñar una prueba controlada antes de tocar ninguna regla.
- **Redirección sin espacios — Estado: RESUELTO. Evidencia: PROBADO LOCALMENTE.** Cuatro
  sondas en el mismo entorno:
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
- **Cuerpo multilínea de una pull request: RESUELTO.** La regla general está en
  `reglas.md`; la evidencia es específica de Claude Code: bajo `dontAsk` un
  cuerpo pasado en línea se troceó por salto de línea y la llamada fue denegada,
  mientras que `--body-file` funcionó.
- **Resolver hilos de review y mergear quedan fuera de la superficie
  autorizada.** El cierre de la PR #10 lo confirmó: resolver un hilo exige la API
  GraphQL, con `gh api` denegado, y `gh pr merge` está en el `deny` de la política
  compartida. Los dos pasos finales del circuito los hace hoy el director en la
  interfaz de GitHub. `0008` ya registra el primero como costo conocido, y `0009`
  aclara que el segundo es el estado de una política candidata, no una regla del
  modelo.
- Definir **criterios objetivos que habiliten la integración automática** por
  clase de riesgo, según deja abierto `0009`.

**Criterio de aceptación.** Completar varias PR reales consecutivas sin que el
usuario tenga que aprobar **comandos ni ediciones** durante el circuito normal.
Todavía no se cumple.

## Para medir durante las primeras PR del MVP

**Estado: ABIERTO.** No bloquean el arranque, pero necesitan evidencia real antes
de decidirse. Se registran acá para que la evaluación no dependa de que alguien
se acuerde.

- **Aviso de intervención en la PC.** Si el próximo paso necesita navegador,
  login interactivo, aplicación de escritorio, `localhost` o aprobación visual,
  el agente lo avisa **antes** y no manda al director a la computadora por
  comodidad propia. Medir si el MVP genera ese caso realmente.
- **Resolución de hilos y merge.** Medir si el paso manual del director se vuelve
  un cuello de botella con volumen real de pull requests, antes de construir nada.
  Hay además una objeción de gobernanza pendiente: si el ejecutor resuelve sus
  propios hilos, deja sin efecto el *Require conversation resolution*.
- **Espera y reintentos.** Como punto de partida, consultar el estado con un
  primer intento del orden del minuto y medio, reintentos espaciados y timeout
  finito. Sin polling agresivo ni infinito. Pasar a eventos solo si la evidencia
  muestra el cuello de botella.
- **Registro de huecos del investigador.** Anotar, de forma mínima, cuándo un
  investigador externo habría ayudado: qué problema, cuánto esfuerzo costó, si se
  construyó algo propio, si después apareció una solución existente y qué impacto
  tuvo. Solo si aparece un caso real; no montar el formato antes.
- **Mantenimiento de archivos protegidos.** Medir si el MVP necesita realmente
  tocar `scripts/` o `.claude/`, que hoy exigen al director como editor manual.
  El código del MVP vive en `app/`, que no está protegido.
- **Depuración de `.claude/settings.local.json` y validación de la política.**
  Ninguna pull request cuenta como evidencia de validación operativa mientras el
  circuito dependa de reglas locales amplias para pedir review, reconciliar o
  publicar.
- **Esfuerzo del revisor sobre código real**, que es lo único que falta para
  poder afirmar algo sobre su calidad revisando código.

### Revisión independiente obligatoria mientras tanto

**Estado: ABIERTO.** Lo abierto es **cuándo se levanta**, no la obligación
misma: esa rige desde la primera pull request de código y no hay nada que cerrar
antes de empezar.

Durante las primeras pull requests de código real del MVP, **toda** pull request
de código lleva revisión independiente, incluso si el cambio parece pequeño o
mecánico. Suspende, solo para código y solo por ahora, la proporcionalidad de
`0009`, que sigue siendo la regla general a largo plazo.

El motivo es que toda la evidencia acumulada sobre la calidad de la revisión es
sobre documentación y configuración. `0007` lo dice sin adornos: la calidad del
revisor frente a bugs de código **no está demostrada**. Hasta tenerla, "cambio
pequeño" no es un juicio confiable sobre código.

Se levanta después de acumular evidencia suficiente en varias pull requests
reales de código. No se fija un número acá: cuántas hacen falta es una
preferencia del director que la evidencia todavía no puede resolver.

## Entregables reutilizables

**Estado: POSPUESTO.** Dos documentos independientes y de importancia
equivalente: uno recoge los principios, el otro los patrones operativos probados.
Comparten disparador, y ese disparador todavía no se cumplió.

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
