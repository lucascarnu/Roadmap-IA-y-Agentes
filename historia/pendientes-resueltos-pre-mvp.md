# Pendientes resueltos PRE-MVP

Archivo histórico de asuntos retirados de `pendientes.md` al sanear el canon.
Conserva títulos, contenido, evidencia, fechas, estados y referencias. No es
trabajo vivo ni crea gates.

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

### Identidad de sesiones Codex por directorio de trabajo

**Estado: RESUELTO. Evidencia: PROBADO LOCALMENTE.** QA ejecutado el 2026-08-16
sobre `main` `e9d744981f4535eccad4727b024cb4e5c3d5dd95`, con el protocolo del
[Issue #79](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/79) y la
evidencia en el
[Issue #78](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/78).

Dos sesiones limpias de Codex, una con directorio de trabajo en la raíz y otra
en `.consultor/`, adoptaron automáticamente `CODEX — EJECUTOR PRINCIPAL` y
`CODEX — CONSULTOR / AUDITOR DE CONTINUIDAD Y COHERENCIA`, respectivamente, sin
bootstrap manual y sin que ningún prompt les indicara su rol. Cada una aceptó su
propio destinatario y rechazó el contrario con `DESTINATARIO_INCORRECTO`, sin
ejecutar la tarea ajena. En cada ronda se envió la misma tarea textual a ambas
sesiones y la única variable fue el encabezado `DESTINATARIO:`.

La identidad sobrevivió a la compactación en ambas sesiones —`Compactar` de
Codex Desktop en el Ejecutor y `/compact` en el Consultor por CLI— y a la
reanudación del Consultor con `codex resume --last` desde el mismo directorio. El
Consultor observó como instrucciones activas `AGENTS.md` de raíz,
`.consultor/AGENTS.override.md`, `CONSULTOR.md` y `reglas.md`; el Ejecutor no
observó `CONSULTOR.md` ni el override, que es el resultado esperado.

Alcance de lo que se afirma: dos sesiones, un cliente, una máquina y una corrida.
No es VALIDADO OPERATIVAMENTE.

Observaciones del entorno durante el QA:

- Las sesiones de Codex cargan también un archivo de instrucciones fuera del
  repositorio,
  `…\.codex\plugins\cache\openai-curated-remote\github\…\skills\github\SKILL.md`.
  No declara ocupación ni destinatario, por lo que no compite con la identidad,
  pero forma parte de lo que gobierna una sesión.
- En la sesión del Consultor, Git emitió
  `warning: unable to access C:\Users\lucas\.config\git\ignore: Permission denied`.
  Las operaciones completaron igual. El efecto observable es que
  `.claude/settings.local.json` aparece como untracked en esa sesión y como
  ignorado en otras. No afecta la identidad, pero hace que `git status` no sea
  comparable entre sesiones.

### Prueba de sustitución del ocupante de contingencia

**Estado: RESUELTO. Evidencia: PROBADO LOCALMENTE.** Ejecutada el 2026-08-11 por
Kimi, con el modelo `k3-256k` y esfuerzo `high`, en modo de solo lectura sobre el
HEAD remoto `06a597eb97bb2b5a48592820172f9313ab44b9ba`, sin handoff histórico
del Director.

A partir del repositorio, las ramas y las pull requests, reconstruyó correctamente
el estado actual, el siguiente paso y qué no debía hacerse todavía. También
detectó que `main` local y `origin/main` local estaban atrasados y que el working
tree estaba sobre una rama anterior, y resolvió correctamente el HEAD canónico
contra el remoto y GitHub sin ayuda del Director.

Claude / Arquitecto-Lead auditó la reconstrucción sin encontrar errores
materiales ni huecos documentales nuevos. El resultado se limita a este ocupante,
esta corrida y el repositorio en ese estado; conviene repetir la prueba si la
documentación cambia materialmente de volumen u organización. Esta evidencia no
prueba el experimento Claude↔Codex de la PR #20 ni el handoff automático.

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

Los asuntos registrados en esta bandeja que declaraban bloquear el comienzo de
las pull requests de código del MVP están RESUELTOS con `0014` y con las dos
pruebas documentadas abajo.

### Continuidad y reanudación PRE-MVP

**Estado: RESUELTO. Evidencia: PROBADO LOCALMENTE.** El QA post-reinicio de la
[PR #49](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/pull/49), ejecutado
con el [Issue #65](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/65)
sobre el HEAD `d3f952e64bc310249dd002f9db0f97cba75b4d85`, observó la transición
`waiting → ready → running → done` después de la madurez del descriptor.

Windows se reinició antes de esa madurez y, sin abrir manualmente agentes,
terminal ni editor, la cadena Task Scheduler → `tick` → `poll` → agente →
GitHub → ntfy reanudó y completó el handoff. Hubo un único procesamiento y un
único resultado material, sin duplicación. La vía observada antes y después fue
`chatgpt_subscription_session`, sin PAYG.

La evidencia durable en el repositorio y GitHub está en la PR #49 y el Issue
#65, cuyos enlaces figuran arriba. La evidencia local no versionada que la
complementa está en `scripts/handoff/artifacts/transitions.log`, que registra
para #65 `waiting → ready`, `ready → running` y `running → done`, y en
`scripts/handoff/artifacts/issue-65-d3f952e64bc3/`, incluidos `telemetry.json`,
`via-before.json`, `via-observada.json`, manifiestos y resultado validado.

También se observaron dos formas distintas de continuidad:

1. continuidad del circuito de ejecución tras el reinicio;
2. reconstrucción de contexto en una sesión nueva mediante el snapshot
   `codex-resume.md`, contrastado antes de continuar con Git local, GitHub, la
   PR #49, el Issue #65 y los artefactos durables.

Con esto queda satisfecho el requisito PRE-MVP de continuidad y reanudación. No
se implementa todavía un sistema general de checkpoints durante el MVP.

### Handoffs — deriva de órdenes operacionales

**Estado: RESUELTO. Evidencia: IMPLEMENTADO Y PROBADO LOCALMENTE.** UC establece
en `reglas.md` que una orden operacional puede definir tarea, alcance y entrega,
pero no crear un gate material sin fundamento canónico. La misma precedencia se
transporta en `scripts/handoff/prompt-template.md`, y la batería determinista
comprueba que llega al prompt generado sin alterar el contrato ni sus marcadores.

La prueba cubre el transporte de la regla, no garantiza que un modelo obedezca
siempre el canon. No se agregó un validador semántico ni un gate nuevo.

### Frontera PRE-MVP → MVP

**Estado: RESUELTO.** Arbitrada el 2026-08-16 por el Arquitecto / Lead sobre
`main` `6a0756c2b3728af9f19ccd4aef9b253896a8b8ab`, con la reconciliación
completa del Consultor contra repositorio, `origin/main`, GitHub y Drive.

La compuerta queda **cerrada**: los cuatro asuntos que la componen están
RESUELTOS y ningún asunto `ABIERTO` declara bloquear el inicio del MVP. La
primera unidad del MVP es construir el lector de archivos del repositorio.

Drive es bandeja exploratoria y no crea gates, según `CONSULTOR.md` §*Jerarquía
de fuentes*. Sus propuestas rotuladas PRE-MVP quedaron arbitradas así:

- **U0:** no promovido. No existe definición en el repositorio ni evidencia de
  que el MVP dependa de él; su única referencia se corrige en esta unidad.
- **Núcleo material de UB:** no promovido por la misma razón.
- **PCI:** no se construye una prueba de integración sintética; la reemplaza la
  primera unidad real del MVP, única capaz de comprobar el circuito con código
  real.
- **Estado por ocupante y vía, y no reintentar tras un 403 conocido:** promovido
  en su forma documental mínima en esta unidad. La maquinaria de backoff no se
  promueve y queda DURANTE_MVP.
- **WebFetch:** PRE_MVP_OPORTUNISTA. El 2026-08-16 seguía denegado en la
  superficie de Claude bajo `dontAsk`, pero no bloquea: la primera unidad del MVP
  no depende de documentación externa y el Arquitecto puede delegar una lectura
  externa necesaria en un agente autorizado que sí alcance la fuente. El
  [Issue #98](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/98) y la
  [PR #99](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/pull/99) registran
  el desenlace: habilitar
  `WebSearch` y `WebFetch` generales para el Arquitecto, sujeto a las sondas
  post-reinicio definidas en esa unidad.
- **Objetivo de unas dos horas sin el Director como relay:** no se canoniza como
  gate. Durante el MVP se medirá cuántas intervenciones del Director hacen falta
  y de qué tipo, separando las físicas —abrir sesión, pegar, aprobar un permiso o
  compactar— de las decisiones técnicas o el transporte de contexto. El objetivo
  es que estas últimas tiendan a cero; la primera unidad del MVP registra la
  medición.
- **Billing diferido:** sin acción nueva. Ya está registrado como observación
  experimental con predicción falsable, y `0011` §*Preautorización de saldo
  preexistente* fija los límites económicos.

Lo no promovido puede volver a proponerse si aparece evidencia nueva, pero no se
promueve por haber estado antes en Drive.


## Automatización del workflow de desarrollo asistido

### Handoff automático real Claude↔Codex

**Estado: RESUELTO. Evidencia: PROBADO LOCALMENTE.** El 2026-08-12 se ejecutó y
el Arquitecto / Lead auditó una prueba limpia de dos relevos sobre el HEAD
congelado `6c52a8ce435836b7d0f4151e15c8a586972cfa1d`.

El Issue #27, destinado a Codex, terminó `handoff:done` y publicó un resultado
estructurado. El puente creó automáticamente el Issue #28 para Claude, sobre el
mismo HEAD, y transportó `resultado_previo` con su marker, `result_sha256` y el
siguiente destinatario. El Issue #28 también terminó `handoff:done`: Claude
reconstruyó y confirmó la auditoría, devolvió `siguiente_destinatario = null` y no
se creó otro hijo.

La intervención del Director se limitó a ejecutar `poll`: no transportó prompt,
contexto, HEAD, resultado, instrucciones ni destinatario siguiente. Los artefactos
verifican sesión de suscripción ChatGPT para Codex y suscripción Anthropic
first-party para Claude, sin PAYG.

La recuperación segura ante caída está probada por la batería y por el
comportamiento fail-closed observado en fallos anteriores del harness. La corrida
exitosa no sufrió una caída real a mitad de ejecución. Los modelos y esfuerzos
efectivos permanecen `NO_VERIFICADO` donde no existe medición directa; las
declaraciones de los agentes no se toman como medición. Los Issues #22 y #25 se
conservan como evidencia histórica y no se reutilizaron.


### Documentación externa: vía de consulta oficial

**Documentación externa — vía de consulta oficial. Estado: RESUELTO. Evidencia:
PROBADO LOCALMENTE.** El 2026-08-16, sobre `main`
`e20c295212c684337565a136730dfac33ea53987`, el Arquitecto / Lead consultó
documentación oficial de Codex mediante `WebFetch`, sin que el Director
transportara URL, contenido, contexto ni resultado. El protocolo y las tres
corridas están en el
[Issue #85](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/85).

De esa unidad quedan tres cosas que conviene no volver a descubrir:

- **La vía por el puente de handoffs no sirve para esto.** El puente invoca a
  Codex con `--sandbox read-only`, `web_search="disabled"` y
  `features.shell_tool=false`, y falla la unidad si el agente intenta usar una
  herramienta. Es una propiedad deliberada del congelado, no un defecto: no
  corresponde habilitarle navegación.
- **La documentación de Codex ya no se sirve desde `developers.openai.com`.** Todo
  `/codex/*` responde `308` hacia `learn.chatgpt.com`. La allowlist de `WebFetch`
  conserva ambos dominios y la unidad del
  [Issue #98](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/98)
  agrega `WebSearch` y `WebFetch` generales. La semántica de la regla desnuda
  queda **DOCUMENTADA** contra Claude Code 2.1.233; su efecto real permanece
  **NO_VERIFICADO** hasta las sondas post-reinicio del Arquitecto, que podrán
  elevarlo a **PROBADO LOCALMENTE**.
- **Regla.** Una premisa externa material **no se completa por memoria cuando
  existe una vía autorizada de consulta oficial**. Concreta, para este proyecto,
  lo que `reglas.md` §*Premisas externas de una unidad* ya exige: mientras esa vía
  esté disponible, "no era alcanzable" deja de ser una explicación admisible.

La ampliación acepta como riesgos residuales la inyección de instrucciones por
contenido externo, la exfiltración por URL, la identidad de paquetes y
herramientas, la ausencia de humano en el lazo y las redirecciones entre hosts;
los mitigantes están en `reglas.md` §*Investigación en fuentes externas* y en los
`deny` que esta unidad no modifica. Queda sin probar que el preflight de
`WebFetch` bloquee un destino malicioso concreto, que un `deny` por dominio de
`WebFetch` funcione y cómo se comportan otros nombres de herramienta desnudos.


### Permisos y ejecución no interactiva — evidencia histórica

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


#### Redirección sin espacios

- **Redirección sin espacios — Estado: RESUELTO. Evidencia: PROBADO LOCALMENTE.** Cuatro
  sondas en el mismo entorno:
  escribe en la raíz y en una carpeta común, y queda **bloqueada** en `scripts/`
  y en `.claude/`. Las reglas `deny Edit(...)` alcanzan también a las escrituras
  por subproceso. Lo que sigue siendo cierto es que los patrones `> archivo` y
  `>> archivo` del `deny` no cubren las formas sin espacios: no son ellos los que
  protegen, sino la capa de escritura, que decide antes.

#### Cuerpo multilínea de una pull request

- **Cuerpo multilínea de una pull request: RESUELTO.** La regla general está en
  `reglas.md`; la evidencia es específica de Claude Code: bajo `dontAsk` un
  cuerpo pasado en línea se troceó por salto de línea y la llamada fue denegada,
  mientras que `--body-file` funcionó.

## Para medir durante las primeras PR del MVP

### Clases de cambio y verificaciones exigidas

**Estado: RESUELTO.** [0014](../decisiones/0014-clases-de-cambio-y-verificaciones-exigidas.md)
define las clases que reconoce el gate de `0013`, su piso de verificaciones, los
casos de QA obligatorio y la regla específica para las pull requests de código
del MVP. Las viñetas siguientes permanecen como mediciones durante las primeras
pull requests; no son gates salvo que declaren expresamente ese alcance.
