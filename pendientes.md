# Pendientes

Asuntos que hay que retomar más adelante y que no deben depender de la memoria
del usuario ni del contexto de una conversación.

No es una entidad del modelo, no lleva frontmatter y no se indexa junto al
contenido. Tampoco es una segunda lista de proyectos: lo que tenga alcance y
resultado propios va a `proyectos/`, y lo que sea material crudo sin clasificar
va a `inbox.md`. Acá viven los asuntos operativos y transversales —cómo
trabajamos, qué falta probar, qué habría que extraer— que no encajan en ninguna
entidad.

Cada asunto activo declara su **estado**: `ABIERTO`, `PARCIAL` o
`POSPUESTO`. Las afirmaciones sobre cómo se comporta el sistema declaran por
separado su **evidencia**, según los estados definidos en
[`reglas.md`](reglas.md#estados-de-evidencia).

Los asuntos cerrados y su evidencia se conservan en
[Pendientes resueltos PRE-MVP](historia/pendientes-resueltos-pre-mvp.md). Ese
archivo es historia y no forma parte del trabajo vivo.

## Automatización del workflow de desarrollo asistido

**Estado general: PARCIAL.** En el baseline, las baterías deterministas de
handoff y review pipeline pasan 126/126. El puente y el pipeline todavía no están
validados como circuito autónomo completo: la PR #97 utilizó transporte humano y
runners ad hoc. Autorización, presupuesto, reintentos y siguiente estado no
están representados completamente por los schemas principales. Handoff v2 queda
diferido hasta retomar la automatización.

Las decisiones del workflow viven en
[0007](decisiones/0007-flujo-de-desarrollo-asistido-sobre-git-y-github.md),
[0008](decisiones/0008-proteccion-server-side-de-main.md) y
[0009](decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md).

### Defectos DURANTE_MVP del handoff

#### Reutilización de PID en la recuperación del lock

**Estado: ABIERTO. Clasificación: DURANTE_MVP.** `scripts/handoff/handoff.mjs`
decide si un `running` quedó huérfano mediante `process.kill(pid, 0)`, que sólo
demuestra que algún proceso conserva ese PID; el `created_at` guardado no se
compara. Como Windows reutiliza PID, otro proceso puede impedir la recuperación
y la unidad quedar detenida en `running` sin notificación. Disparador para
corregirlo: observar por primera vez una unidad detenida en `running` sin su
proceso original vivo.

#### Listados de GitHub sin paginar

**Estado: ABIERTO. Clasificación: DURANTE_MVP.** `listByLabel` y `findChild` usan
`gh issue list --limit 100`; `findChild` además consulta `--state all` para evitar
crear dos veces el Issue hijo. Al emitir este pendiente se observaron 43 Issues,
pero el modo de falla al superar el límite es silencioso: un hijo existente puede
no encontrarse y duplicarse. Disparador para corregirlo: superar los 80 Issues, o
antes si aparece un hijo duplicado.

### Solicitud y lectura de revisiones

**Estado: PARCIAL.** Cómo se procesa una review y cuándo cuenta como válida ya no
vive acá: es regla estable en `0009`, "Coordinación de revisiones". Lo que queda
son las capacidades que al circuito todavía le faltan.

- **Solicitud automática — capacidad histórica: PROBADA LOCALMENTE; estado
  actual: NO OPERATIVO.** `gh pr edit <PR> --add-reviewer "@copilot"` produjo una
  review real sobre el commit indicado, sin intervención humana. GitHub Copilot
  no tiene crédito cargado y no se intenta por inercia; su estado por vía se
  detalla abajo. Queda pendiente el **Re-request review** que GitHub ofrece
  después de nuevos commits en una PR ya revisada.
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
material. El mismo Caso C congelado ya se ejecutó con [Claude Code Opus, Run
1](laboratorio/benchmarks/reviewers/v1/resultados/claude-code-opus-caso-c-run-1.md);
su auditoría cualitativa sigue pendiente. El [primer intento canónico con
Codex](laboratorio/benchmarks/reviewers/v1/resultados/codex-gpt-5-6-sol-caso-c-canonical-attempt-1.md)
falló en el harness por codificación de stdin antes de iniciar la inferencia y no
se repitió dentro de esa tarea. [Codex GPT-5.6 Sol, Run
1](laboratorio/benchmarks/reviewers/v1/resultados/codex-gpt-5-6-sol-caso-c-run-1.md)
se ejecutó después en una sesión nueva con reasoning `high`; su auditoría sigue
pendiente. También siguen pendientes la auditoría de Claude y la comparación
final. **La calidad global sigue NO VALIDADA.**

La procedencia de esas corridas quedó corregida: el benchmark ahora separa sujeto
evaluado, vía, ejecutor de la prueba y auditor posterior, y registra
`NO_VERIFICADO` donde el ejecutor no puede establecerse con evidencia. Ni el autor
de los commits ni el prefijo de la rama sirven para atribuirlo, porque todos los
agentes commitean con la misma identidad Git.

El hueco que eso dejaba —que nada producía el dato en el momento de ejecutar—
quedó cerrado hacia adelante por la convención de destinatario y firma de
`reglas.md`. Los registros históricos siguen `NO_VERIFICADO`.

La arquitectura que consumirá esta comparación ya está decidida en
[0010](decisiones/0010-revision-con-principal-y-segunda-opinion-ciega.md):
un reviewer principal sobre el 100% de las pull requests, un shadow ciego
activado por materialidad, muestreo determinista o riesgo, fusión determinista de
las dos reviews y una única review consolidada. La [v1 KISS del
pipeline](scripts/review-pipeline/README.md) ya implementa el contrato común, la
ceguera comprobable por hashes, los tres triggers, la fusión/decisión
deterministas, el diff desde `merge-base`, la política obtenida del harness
confiable, `publish=none|consolidada` y fallos cerrados; su lógica
determinista está probada localmente sin consumir reviews. **Falta validar la
integración real** con una corrida manual `shadow_trigger=always` y
`publish=none`, y falta completar la calibración que elige cuál de los reviewers
ocupa `principal`: para eso hacen falta esa prueba, las auditorías pendientes y
la comparación final. El benchmark sobre el Caso C congelado mide calidad; la
calibración de `0010` corre sobre pull requests reales y es la que decide la
asignación. La asignación inicial Claude/Codex del workflow es sólo configuración
intercambiable de calibración, no una elección de ganador.

La prueba integrada en Actions está bloqueada hasta configurar credenciales de
CI para ambos reviewers. Al comprobar los nombres de secrets del repositorio el
2026-08-10 sólo estaban `GEMINI_API_KEY` y `KIMI_API_KEY`; el workflow requiere
`ANTHROPIC_API_KEY` y `OPENAI_API_KEY`. Esto no implica que falten sesiones por
membresía en la máquina local. Además, GitHub no registra para despacho manual
un workflow nuevo que todavía no existe en la rama por defecto: la consulta del
workflow publicado en esta rama respondió 404. La primera corrida integrada
requiere primero integrar el harness confiable en `main` y luego despacharlo
manualmente sobre una PR adecuada; no corresponde agregar un trigger automático
transitorio para eludir esa condición.

Durante reviews reales hay que medir por separado cuántas solicitudes requieren
`OFFICIAL_DOCUMENTATION`, cuántas habrían cambiado un veredicto y cuántas no se
resuelven con el repositorio, GitHub ni Actions. Solo con esos datos corresponde
decidir si se habilita documentación externa, mediante una lista blanca de
dominios y límites de tamaño.

Si el protocolo se sostiene durante varias reviews reales, corresponde
promoverlo a una decisión en `decisiones/`. Hoy no: existe una sola corrida
válida y el proyecto no congela lo que todavía no demostró estabilidad.

#### Calibración experimental de profundidad, modelos y costo

**Estado: ABIERTO. Clasificación: EN PRUEBA / DURANTE_MVP.** Este apartado
registra evidencia e hipótesis operativas; no modifica el canon ni define una
política permanente.

**Profundidad de review.** Se usan experimentalmente las etiquetas `R1 LIGERA`,
`R2 MEDIA`, `R3 PROFUNDA` y `R4 EXHAUSTIVA` para describir profundidad o densidad
de una review. No reemplazan la clase de cambio de `0014`, no permiten reducir el
rigor por costo y requieren más benchmarks antes de canonizarse.

**Selección de modelo.** La hipótesis en prueba es preferir la vía por
suscripción mientras tenga cuota, usar un modelo API económico como contingencia
y reservar un modelo más caro o profundo para un escalamiento deliberado. La
comparación observada entre Kimi K2.7 Code con *thinking* nativo y Kimi K3 con
esfuerzo alto es evidencia de laboratorio, no una política: una sola comparación
no permite asignar modelos a R1-R4.

**Topes de costo.** Un cap fijo global puede bloquear una ejecución válida antes
de inferencia. En el caso observado, el preflight de K3 fue de aproximadamente
USD 0.364257 y un cap fijo de USD 0.35 lo habría abortado. Como hipótesis
operativa, un cap futuro debería ser consciente del modelo y del preflight o ser
relativo a la estimación; la fórmula queda deliberadamente sin definir.

**Billing diferido — OBSERVACIÓN EXPERIMENTAL.** Para K3 se calculó un costo
aproximado de USD 0.25398. El balance inmediato no cambió, pero en la medición
previa a la corrida siguiente había bajado aproximadamente USD 0.2539805: el
descenso observado salió del voucher y el cash permaneció sin cambios. Esto no
demuestra causalidad. Predicción falsable: si la hipótesis de reflejo diferido es
correcta, el cargo calculado de K2.7, aproximadamente USD 0.05234, debería
aparecer posteriormente.

Una telemetría futura puede representar `CARGO_PENDIENTE_DE_REFLEJO` y conservar
balance previo, balance posterior inmediato, balance posterior, voucher y cash.
No se implementa en esta unidad.

**Telemetría por intento. Estado: ABIERTO. Clasificación: recolección PRE_MVP;
análisis DURANTE_MVP.** El bloque de telemetría que ya acompaña a cada review
informa **sólo el intento que salió bien**. En la review de la PR #91 hubo dos
llamadas: la primera terminó en `finish_reason=length` y no produjo review válida,
y la segunda en `stop`. De la primera no quedó ningún registro, así que el costo
real hasta obtener una review válida es **NO_RECONSTRUIBLE**. El detalle está en el
[Issue #94](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/94).

La corrección es de alcance, no de diseño: **un registro por intento, no uno por
review**, dentro del mismo bloque de telemetría que ya existe. Cada intento
conserva tamaño del input, presupuesto de output, tokens de input, output y
reasoning, `finish_reason`, latencia, costo calculado y si esa salida fue válida.
Y una línea acumulada hasta `REVIEW_VALIDA`: número de intentos, costo total y
latencia total.

Cuatro cosas que no deben colapsarse en una sola, porque nombran cosas distintas:

- el **cap económico autorizado**, que es autorización y vive en `0011`;
- el **presupuesto de output** de cada llamada, que es un parámetro técnico;
- el **`finish_reason`** y la validez de cada salida;
- el **costo calculado**, que sólo se conoce después.

Un `finish_reason=length` es un evento de presupuesto de output, **no** un bloqueo
por cap económico. No confundirlos evita atribuir a la política de costos un
truncamiento que no produjo. Esta anotación no cambia caps, límites económicos,
packaging ni política económica: sólo amplía lo que se registra.

También se registran, en el mismo evento y sin crear una segunda base, la ruta
intentada, la clase de fallo, el fallback usado y su resultado.

**Runtime de Codex observable.** Hasta ahora las firmas de Codex declaraban modelo
y esfuerzo efectivos como `NO_OBSERVABLE`. La auditoría del
[Issue #93](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/93) observó
que sí lo son: `turn_context` expone `model` y `effort`, y `token_count` expone
input, cached input, output, reasoning y total. Desde ahora, `NO_OBSERVABLE` en
esos campos requiere haber mirado ahí primero, conforme a `reglas.md`
§*Firma de ejecución*.

Nada de esto crea un gate, un agente, una base ni una unidad nueva, y no bloquea
ninguna unidad en curso.

**Publicación autónoma del Consultor — limitación externa aceptable. Estado:
ABIERTO. Clasificación: DURANTE_MVP.** El conector de GitHub puede crear Issues y
el Consultor lo demostró publicando los Issues #93 y #94, pero el primer intento
fue frenado por una salvaguarda del propio conector hasta que el Director autorizó
expresamente el repositorio privado y el contenido. Es una salvaguarda externa: una
política interna del proyecto no concede capacidades ni rebaja protecciones de un
producto de terceros, y **rodearla con `gh`, con la API directa o con otro canal
está prohibido**, igual que cualquier otra denegación.

No bloquea nada. Esa autorización es del mismo tipo que abrir una sesión de Codex
—una acción física o de autorización que la plataforma todavía no automatiza— y no
del tipo que este proyecto quiere eliminar, que es el Director transportando
contexto o decidiendo cuestiones técnicas. Si alguna vez se exigiera publicación
sin ninguna intervención humana, eso sería una necesidad nueva a arbitrar, con una
vía oficialmente soportada que habría que verificar, no suponer.

**Runner API. Estado: ABIERTO. Clasificación: PRE_MVP_OPORTUNISTA; sin secuencia
canónica: U0 no fue promovido al repositorio.** El runner de review API es
actualmente efímero. Conviene
convertirlo en una vía reutilizable para evitar reconstrucciones manuales o
*ad-hoc* cuando vuelva a agotarse una cuota de membresía; no se implementa ahora.

**WebFetch — pruebas pendientes. Estado: ABIERTO.** La capacidad de consulta
oficial ya está cerrada y su evidencia vive en el
[histórico](historia/pendientes-resueltos-pre-mvp.md#documentación-externa-vía-de-consulta-oficial).
Queda por probar que el preflight bloquee un destino malicioso concreto, que un
`deny` por dominio funcione y cómo se comportan otros nombres de herramienta
desnudos.

**Saldo autorizado — estado operativo temporal.** Existe una preautorización
vigente del Director para consumir el saldo preexistente de Kimi API Platform en
revisiones independientes: sólo saldo ya existente, sin Auto-recharge, recarga,
compra, upgrade, cambio de plan ni gasto más allá de ese saldo. Al agotarse, se
usan contingencias gratuitas o autorizadas, o se detiene el circuito de forma
segura.

El estado operativo se registra por vía, sin colapsar dimensiones distintas:

- **AUTORIZACIÓN.** La membresía está autorizada. La API está preautorizada
  contra saldo preexistente, sin recarga, Auto-recharge, compra, upgrade ni gasto
  por encima de ese saldo.
- **CAPACIDAD.** `Codex → Kimi API` está **PROBADO**. La vía
  `Claude → Kimi API directa` no está demostrada.
- **ESTADO.** La membresía devolvió `403 usage limit` el 2026-08-15/16. La API
  con saldo preexistente produjo reviews válidas mediante el runner operado desde
  Codex en los Issues
  [#72](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/72),
  [#74](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/74) y
  [#76](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/76).
- **PRIORIDAD.** Intentar primero suscripción o membresía cuando tenga cuota; si
  no, usar la API preautorizada dentro de sus límites; si tampoco está
  disponible, recurrir a una contingencia gratuita o detener de forma segura
  conforme a `0009`.

**GitHub Copilot — estado por vía al 2026-08-16.**

- **AUTORIZACIÓN.** Autorizado como producto, pero sin crédito cargado; el
  Director decidió no agregar más.
- **CAPACIDAD.** Demostrada históricamente: la solicitud con `@copilot` produjo
  una review real sin intervención humana.
- **ESTADO.** **NO OPERATIVO.**
- **PRIORIDAD.** No se selecciona, sondea ni intenta por inercia.
- **CONDICIÓN_DE_REVALIDACIÓN.** Nueva autorización del Director, crédito o
  suscripción nuevos, cambio de configuración, o una prueba controlada pedida
  expresamente. No queda prohibido: permanece inactivo hasta un hecho observable.

**Gemini — estado por vía al 2026-08-16.**

- **AUTORIZACIÓN.** Participó históricamente; hoy no es una vía autorizada del
  circuito.
- **CAPACIDAD.** Existió y el workflow sigue instalado en el repositorio.
- **ESTADO.** **NO OPERATIVO.** La review automática falla en las pull requests;
  el [Issue #87](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/87)
  trata ese disparo.
- **PRIORIDAD.** No se selecciona ni se sondea.
- **CONDICIÓN_DE_REVALIDACIÓN.** Nueva autorización del Director, crédito o
  suscripción nuevos, cambio de configuración, o una prueba controlada pedida
  expresamente.

Después de un `403 usage limit` conocido, no se reintenta la membresía por
inercia. Sólo se vuelve a intentar ante una razón observable, como tiempo
transcurrido, cambio de plan o cuota renovada; no como primer paso automático de
cada pull request. Esto registra estado durable y no implementa backoff, máquina
de estados ni telemetría nueva.

El último balance observado conocido antes de que se reflejara un eventual cargo
de K2.7 fue: `available_balance = USD 9.2436695`, `voucher_balance = USD
4.24367`, `cash_balance = USD 5.00`. Es información operacional temporal, no un
valor permanente, y puede actualizarse cuando exista nueva evidencia observada.

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
- **Gemini** queda como candidato a evaluar, sin asignación ni trato preferencial;
  su vía histórica está **NO OPERATIVA** y no se selecciona ni se sondea hasta una
  revalidación por un hecho observable.
- Objetivo futuro: que el ejecutor y el arquitecto puedan consultarlo sin que el
  director haga de intermediario.

#### SuperGrok como reviewer

**Estado: ABIERTO. Clasificación: FUTURO / EXPERIMENTAL.** Evaluar si Grok puede
incorporarse como reviewer usando exclusivamente la suscripción SuperGrok
existente. Cuando se ejecute, comparar `Claude → Grok` y `Codex → Grok` sobre un
paquete congelado equivalente y observar autenticación efectiva, capacidad,
límites, continuidad y calidad.

La propuesta no autoriza xAI API PAYG, compra adicional, recarga ni gasto
variable. No es PRE-MVP y una sola prueba no modifica la asignación vigente ni
crea política canónica.

### Permisos y ejecución no interactiva

**Estado: PARCIAL.** Una automatización desatendida no puede quedar bloqueada por
prompts de permisos.

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
- **Wrapper seguro de push: propuesta pendiente, no decisión.** Un script
  versionado que publique la rama actual sin aceptar flags ni refspecs
  eliminaría la clase entera de escapes por comodín, en lugar de enumerarlos.
  Reevaluar **después** del cambio de ejecutor: otro ejecutor puede tener otro
  modelo de permisos y volverlo innecesario.
- **Resolver hilos de review y ejecutar el merge quedan fuera de la superficie
  autorizada de Claude.** El cierre de la PR #10 lo confirmó: resolver un hilo
  exige la API GraphQL, con `gh api` denegado, y `gh pr merge` está en el `deny`
  de la política compartida. Hoy esos pasos requieren otra herramienta o la
  interfaz de GitHub. `0008` ya registra el primero como costo conocido; `0013`
  define el gate de integración y deja claro que la limitación de una herramienta
  no crea una aprobación humana obligatoria.

**Criterio de aceptación.** Completar varias PR reales consecutivas sin que el
usuario tenga que aprobar **comandos ni ediciones** durante el circuito normal.
Todavía no se cumple.

## Para medir durante las primeras PR del MVP

Los asuntos de esta sección necesitan evidencia real durante las primeras pull
requests. No bloquean el arranque salvo cuando declaran expresamente otro alcance
de bloqueo.

### Mediciones de las primeras pull requests del MVP

**Estado: ABIERTO.** Son mediciones activas derivadas del marco ya resuelto y
archivado; no funcionan como gates salvo que declaren expresamente ese alcance.

- **Aviso de intervención en la PC.** Si el próximo paso necesita navegador,
  login interactivo, aplicación de escritorio, `localhost` o aprobación visual,
  el agente lo avisa **antes** y no manda al director a la computadora por
  comodidad propia. Medir si el MVP genera ese caso realmente.
- **Resolución de hilos.** Medir si el paso manual de resolución de hilos se
  vuelve un cuello de botella con volumen real de pull requests, antes de
  construir nada. Hay además una objeción de gobernanza pendiente: si el ejecutor
  resuelve sus propios hilos, deja sin efecto el *Require conversation
  resolution*.
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
