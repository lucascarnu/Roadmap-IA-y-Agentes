# Reglas de Trabajo

Define cómo trabajamos paso a paso, sin saltar etapas ni agregar complejidad innecesaria.

## Alcance y autorización de cambios

- Distinguir entre tareas de consulta y tareas de ejecución.
- Las solicitudes de revisar, analizar, inspeccionar, verificar, explicar o confirmar son de solo lectura.
- En tareas de solo lectura, no modificar archivos, estructura, configuración ni Git.
- Solo realizar cambios persistentes cuando la tarea los solicite explícitamente.
- No ampliar el alcance por iniciativa propia.
- Crear la rama temporal de una tarea de ejecución no cuenta como ampliar el alcance ni requiere autorización adicional: es parte del flujo normal definido en [Estrategia de ramas](#estrategia-de-ramas).
- Si una ambigüedad pudiera producir cambios no solicitados, preguntar antes de actuar.

## Estrategia de ramas

- `main` contiene únicamente trabajo revisado y aceptado.
- Solo se trabaja directamente en `main` cuando el usuario lo autorice de forma explícita.
- Toda tarea de ejecución comienza automáticamente en una rama temporal, creada antes de modificar ningún archivo.
- Crear esa rama no requiere pedir autorización: forma parte del flujo normal de una tarea de ejecución.
- El nombre de la rama usa el formato `<ejecutor>/<tarea-breve>`.
- Ejemplos: `claude/crear-plantilla-fuentes` y `codex/revisar-roadmap`.
- No mezclar tareas distintas en una misma rama.
- Las tareas de consulta, revisión, análisis o verificación permanecen en la rama actual y son de solo lectura: no crean ramas ni alteran Git.
- Integrar en `main` solo después de revisar el resultado.
- Eliminar la rama una vez integrada o descartada.
- No agregar trailers `Co-Authored-By` a los commits.

## Ejecución de comandos

- Los comandos de Git y de la plataforma de repositorios se ejecutan siempre por el mismo intérprete, para que las autorizaciones no dependan de cuál se elija en cada momento. Qué intérprete es lo declara el adaptador del ejecutor.
- Usar comandos simples, uno por operación. Evitar lógica de shell cuando el exit code y la salida directa ya alcanzan.
- Al publicar una rama, nombrarla explícitamente en el comando en vez de depender de cuál esté activa.
- Los textos multilínea, como el cuerpo de una pull request, se pasan por archivo y no en línea dentro del comando.
- Las condiciones de integración rutinaria están definidas en [0013](decisiones/0013-delegar-cierre-operativo-y-merge-rutinario.md). Cuando la herramienta no pueda ejecutar ese cierre, el circuito termina con la pull request lista para integrar como una limitación de implementación, no como una exigencia de aprobación humana.
- Las clases de cambio y su piso de verificaciones se definen en [0014](decisiones/0014-clases-de-cambio-y-verificaciones-exigidas.md).
- Antes de cerrar una unidad de trabajo, comprobar en `pendientes.md` si existe un asunto `ABIERTO` que declare expresamente bloquear esa unidad, una fase o el MVP. Mientras siga abierto, no avanza aquello que el propio asunto declara bloquear; los demás pendientes no funcionan como gates. Una desviación o incidente material registra en ese mismo pendiente su estado, el alcance del bloqueo y evidencia suficiente para identificarlo. La clasificación técnica de materialidad corresponde al Arquitecto / Lead según [0009](decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md).
- Antes de cerrar cada pull request, comprobar si sigue vigente la [obligación temporal de revisión independiente](pendientes.md#revisión-independiente-obligatoria-mientras-tanto). Su estado y alcance viven únicamente en `pendientes.md` y pueden exigir revisión aunque la proporcionalidad general de `0009` permitiera omitirla.
- Una tarea automática no depende de poder consultar al usuario: debe estar suficientemente especificada o fallar de forma segura.

### Sólo el canon crea gates

Sólo bloquean el circuito los gates que el canon vigente declara obligatorios
para la unidad concreta. No constituyen por sí mismos un gate una señal roja
genérica, `mergeStateStatus UNSTABLE`, un check fallido que no sea *required* ni
gate canónico, la ausencia de shadow, una herramienta temporalmente no
disponible, una cuota temporal agotada, la observabilidad parcial, un pendiente
que no declare bloquear ni una contingencia preferida no disponible cuando
exista otra vía autorizada.

Si una señal de ese tipo revela un problema material real, se trata el problema
material correspondiente, no el color o estado de la señal. Si un gate
obligatorio no puede satisfacerse mediante ninguna vía razonable y autorizada,
el circuito se detiene de forma segura conforme a `0009`.

Una orden o prompt operacional puede definir la tarea, su alcance y la forma de
entrega, pero no crea por sí mismo un gate material: toda restricción con
pretensión bloqueante necesita fundamento canónico. Si una restricción *ad hoc*
es incompatible con el canon, el destinatario ignora, rechaza o bloquea esa
parte conforme al canon y lo declara en su salida. Esto no limita la definición
normal de tareas, alcance ni entregables.

## Destinatario y firma de ejecución

Quién ejecuta una tarea es un dato que se produce al ejecutarla, no algo que se
reconstruya después. Ni el autor de los commits ni el nombre de la rama lo
registran: los agentes comparten identidad Git, y el prefijo de la rama solo dice
con qué convención se abrió la tarea.

Por eso toda tarea operativa lleva un control al principio y una firma al final.
Son dos cosas distintas: el encabezado **evita** que la ejecute quien no debe; la
firma **registra** quién la ejecutó realmente.

**Alcance.** Aplica a los pedidos que ordenan a un agente modificar el
repositorio, ejecutar pruebas, evaluar, auditar, crear commits, disparar acciones
o cambiar infraestructura. No aplica a la conversación humana corriente: no
convertir esto en burocracia.

### Encabezado de destinatario

Todo prompt dirigido a un rol concreto empieza con `DESTINATARIO: <ROL>` y una
regla **fail closed**: antes de ejecutar, la sesión identifica su rol leyendo su
adapter durable y verifica que coincide con el destinatario. La memoria
conversacional no determina el rol. Si no puede identificar el adapter o el
destinatario no coincide, no ejecuta nada y responde
`DESTINATARIO_INCORRECTO`.

Valores previstos: `CLAUDE — ARQUITECTO / LEAD`, `CODEX — EJECUTOR PRINCIPAL`,
`CODEX — CONSULTOR / AUDITOR DE CONTINUIDAD Y COHERENCIA` y
`CUALQUIER_EJECUTOR_AUTORIZADO`. No es un sistema de identidades: es una
protección contra pegar el prompt en la sesión equivocada.

`CUALQUIER_EJECUTOR_AUTORIZADO` se usa cuando la tarea no depende materialmente
de quién la ejecute. En ese caso no se cancela por identidad, pero la firma final
sigue siendo obligatoria. **No usar ese valor por comodidad** cuando el rol o la
independencia del agente formen parte de lo que se está midiendo.

### Firma de ejecución

Toda tarea ejecutada termina con una sección `## FIRMA DE EJECUCIÓN` con estos
campos mínimos: ejecutor real, entorno, modelo, esfuerzo o modo, sujeto evaluado,
vía evaluada y fecha. Cuando exista una auditoría separada —y siempre que la
tarea forme parte de un benchmark o de una evaluación— se agrega el auditor
posterior.

Tres campos que no deben mezclarse, porque nombran funciones distintas:

- **ejecutor real** — quién realizó la tarea;
- **sujeto evaluado** — qué modelo, reviewer o herramienta se estaba midiendo;
- **vía evaluada** — cómo se accedió a ese sujeto.

Escribir "Claude / Kimi" no sirve: no distingue quién ejecutó de qué se evaluó.

**Nada se infiere, y nada se declara sin haber mirado.** Antes de marcar un campo
como `NO_OBSERVABLE`, el ejecutor intenta obtenerlo por las fuentes razonablemente
disponibles para esa tarea. Si después de ese intento sigue sin poder
determinarse, se usa `NO_OBSERVABLE` y se dice en una línea dónde se buscó. No se
exigen búsquedas desproporcionadas: alcanza con la fuente evidente.

**Configurado no es efectivo.** Un valor encontrado en configuración persistida se
registra como **configurado**, y no como el valor que gobernó la ejecución, salvo
que exista evidencia directa de que la gobernó. Cuando hay un valor configurado
observable pero no puede demostrarse que fue el efectivo, ese segundo dato es
`NO_VERIFICADO`, que no es lo mismo que `NO_OBSERVABLE`: acá el dato existe y lo
que falta es la prueba de que rigió.

Se escribe, por ejemplo, "modelo configurado `opus`, efectivo en runtime
`NO_VERIFICADO`". No hace falta partir cada campo en dos cuando uno solo lo
expresa con claridad; lo que no se hace nunca es presentar la configuración como
si fuera el runtime.

Todo esto vale especialmente para el modelo, el esfuerzo o modo, el tier y el
alias efectivo, que no se deducen de la interfaz, del nombre comercial, de la
rama ni de cómo estaba configurado el entorno la última vez.

### Alcance temporal

Esta convención rige **hacia adelante**. No permite reconstruir ejecutores
anteriores: los registros históricos marcados `NO_VERIFICADO` se quedan así, y
una firma nueva no reinterpreta un commit viejo.

## Estados de evidencia

Toda afirmación sobre cómo se comporta el sistema declara en cuál de estos tres estados se apoya. No son sinónimos ni grados de confianza: se distinguen por el tipo de evidencia que los sostiene.

- **DOCUMENTADO.** Lo respalda documentación oficial de quien produce la herramienta. Dice cómo debería comportarse, no que se haya comprobado acá. Se cita con su fuente y envejece con las versiones.
- **PROBADO LOCALMENTE.** Se ejecutó una prueba concreta en un entorno concreto y se observó el resultado. Vale para ese entorno y para lo que la prueba efectivamente cubrió, no para el caso general.
- **VALIDADO OPERATIVAMENTE.** El circuito objetivo se comportó como se espera, en el entorno donde realmente corre, de forma repetida y con evidencia suficiente para confiar en él.

Un agente **no puede declarar VALIDADO OPERATIVAMENTE algo que su entorno no le permite probar**. Puede documentarlo, puede señalar qué haría falta para validarlo, y puede pedir que lo valide quien tenga acceso a ese entorno; lo que no puede es dar por demostrado lo que no ejecutó.

De ahí se sigue una separación de roles: quien revisa responde si algo está bien construido, y quien valida responde si funciona realmente. Son preguntas distintas y no siempre las puede contestar el mismo agente.

### Premisas externas de una unidad

Una **premisa externa** es una afirmación sobre cómo se comporta una herramienta de terceros —una bandera, un formato de salida, una vía de autenticación, un límite— de la que depende un diseño o una implementación. Los estados de arriba dicen cómo clasificarla; esto dice cuándo hay que conseguirla y a quién le toca.

- **Arquitecto / Lead.** Antes de emitir una unidad implementable, identifica las premisas externas materiales de las que depende y verifica la fuente oficial aplicable, con su versión y alcance cuando importen. Si la premisa es duradera, registra la fuente según [0002](decisiones/0002-metadata-minima-de-fuentes.md). No completa huecos por memoria ni por suposición: si una premisa material sigue sin verificar y es razonablemente verificable, la unidad todavía no está lista para implementarse.
- **Ejecutor.** No da por cierta una premisa sólo porque está escrita en la orden. Si al implementar aparece una contradicción con la documentación, una versión incompatible o una capacidad que no puede demostrar, detiene esa parte y la devuelve al Arquitecto en vez de resolverla por su cuenta.
- **Reviewer independiente.** No repite la investigación. Comprueba que las premisas externas materiales estén identificadas y con evidencia trazable, y no toma como fundamento suficiente una especificación que no la tenga.

Verificar no significa poder siempre: cuando la fuente oficial no sea alcanzable desde el entorno del agente, eso se declara —igual que cualquier otro límite— y se decide con la evidencia que sí exista, sabiendo que se apoya en observación y no en documentación.

## Intervención crítica del agente

- Estas reglas aplican a cualquier agente, modelo o ejecutor que trabaje en el proyecto.
- Antes de diseñar o implementar, el agente puede señalar una objeción, riesgo o alternativa solo cuando pueda cambiar de forma material la calidad, seguridad, costo, mantenibilidad o alcance del resultado.
- No cuestionar por rutina ni abrir debates sobre decisiones menores.
- Si la intervención es importante, exponerla de forma breve y concreta antes de continuar.
- Si existe una alternativa claramente superior, proponerla y explicar en una o dos frases por qué.
- Si el riesgo es grave o la instrucción es ambigua, detenerse y pedir confirmación.
- Si la mejora es opcional y no bloquea la tarea, mencionarla sin frenar la ejecución.
- Una vez tomada la decisión, ejecutarla sin reabrir el mismo punto salvo que aparezca información nueva.
- El rol del agente puede ser diseño, revisión, ejecución o validación; estas reglas se aplican en cualquiera de esos roles.

## Evaluación y persistencia de resultados

- Antes de atribuir una falla cualitativa a un agente o modelo, evaluar primero
  el contexto entregado, la evidencia disponible, las herramientas y fuentes a
  su alcance, el protocolo y el prompt, el formato de salida exigido y el alcance
  de la tarea. Solo después corresponde preguntarse si el agente es
  suficientemente bueno: un mal resultado suele decir más del pedido que de
  quien lo respondió.
- Una recomendación material aceptada no continúa como conversación. Antes de
  seguir trabajando se convierte en decisión, regla, pendiente o estado
  documentado, según corresponda. Si no queda escrita, no fue aceptada: fue
  comentada.
- Una corrección de harness o infraestructura no altera silenciosamente una
  capacidad material del sujeto evaluado para lograr una corrida exitosa. Los
  cambios de modelo, razonamiento, herramientas, fuentes, contexto esencial,
  protocolo de evidencia o condiciones materiales de inferencia son cambios del
  experimento y se escalan antes de aplicarse.

## Completitud de una entrega

- Una entrega responde lo que se pidió y, además, incluye la información **directa y material** que el agente descubrió durante la tarea y que el rol o la decisión siguientes necesitan para continuar correctamente, aunque no figurara entre los campos pedidos.
- El criterio es práctico: si omitir algo que el agente ya descubrió provocaría previsiblemente otro intercambio solo para pedirlo, se incluye ahora.
- Esto no autoriza auditoría general, ampliación lateral del alcance, mejoras cosméticas, refactors opcionales ni ideas no relacionadas. Se entrega lo que la tarea ya produjo, no trabajo nuevo.
- Toda información adicional se verifica antes de presentarse como hecho. Cuando la distinción importe, se declara si es **hecho verificado**, **inferencia**, **recomendación** o **no observable desde ese entorno**.
- Una inferencia no se presenta como hecho, y un límite del entorno se declara en vez de disimularse.

## Chequeo de dependencias directas

- Antes de cerrar una tarea que modifica, sustituye o elimina una regla, una decisión, un documento canónico o un concepto significativo, se revisan sus dependencias **directas en los dos sentidos**: qué contenido referencia lo cambiado, y qué contenido depende de lo cambiado o apunta a ello.
- El objetivo es detectar la consecuencia inmediata antes de introducir una contradicción nueva, no revisar el repositorio entero.
- Solo cuentan las consecuencias **directas y materiales**. Si el chequeo no encuentra ninguna, se dice y se cierra.

## Comparación previa a la integración

La comparación contra `main` es obligatoria cuando:

- cambia más de un archivo;
- afecta lógica, estructura, Git, configuración o seguridad;
- introduce o modifica metadata;
- fue realizado por otro agente;
- existe una implementación alternativa para comparar;
- el impacto no es evidente a simple vista.

Puede omitirse cuando:

- el cambio es pequeño;
- afecta un solo archivo;
- consiste solo en texto o documentación;
- no elimina ni reescribe contenido existente;
- el alcance y el resultado son evidentes.

**Ante criterios superpuestos:**

- Si se cumplen criterios de ambas listas, existe superposición o hay duda razonable, realizar la comparación contra `main`.

## Revisión de concisión

- No iniciar una ronda de revisión basándose solamente en la cantidad de líneas.
- Revisar por concisión únicamente cuando exista:
  - repetición concreta;
  - contenido fuera de alcance;
  - estructura innecesariamente duplicada;
  - o una oportunidad real de simplificación material.
- No reabrir una tarea solo para reducir unas pocas líneas o alcanzar una cifra aproximada.
- Como referencia, si no se espera una reducción de al menos 15% sin perder fundamentos, no hacer una ronda separada de concisión.
- Las correcciones de precisión, contradicciones o errores sí justifican una revisión aunque no reduzcan la extensión.
- La claridad y la calidad tienen prioridad sobre el número de líneas.

## Documentación y código

- La documentación es la fuente de verdad sobre el comportamiento esperado del sistema; el código lo implementa y no debe quedar como única constancia de una regla de comportamiento.
- Todo cambio de comportamiento observable —el que sorprendería a quien leyó únicamente la documentación— se documenta y lo aprueba el usuario antes de implementarse.
- Los cambios puramente técnicos que no alteran comportamiento observable se resuelven directamente en código: refactors, organización interna, optimizaciones sin efecto observable, tests, estilos visuales que no cambian funcionalidad y elecciones que una decisión haya dejado explícitamente abiertas.
- Si durante la implementación se descubre que la especificación es incompleta, ambigua o incorrecta en algo observable, detener esa parte, corregir primero la fuente documental correspondiente y después continuar con el código. Quién aprueba esa corrección depende de su naturaleza: una **enmienda técnica** que preserva la intención y las restricciones materiales la resuelve el rol con autoridad técnica delegada, y se informa después; un cambio de comportamiento observable, de alcance o de intención lo aprueba el usuario antes. La decisión sobre el modelo operativo fija el detalle.
- Ante una contradicción entre documentos canónicos, no resolverla por jerarquía automática ni dejando que el código elija: detener el cambio y corregir explícitamente la documentación antes de continuar.
- Corregir un bug no exige modificar documentación cuando el código contradice una especificación ya correcta. Si el código cumple la especificación pero el resultado esperado debe cambiar, es un cambio de comportamiento y la documentación se actualiza primero.

## Buscar antes de construir

- Antes de diseñar un wrapper, una extensión, un script o infraestructura propia para resolver una limitación operativa, buscar primero una capacidad nativa de la plataforma que ya se usa, y preferir su configuración o su API oficial cuando satisfagan la necesidad y la seguridad.
- Antes de proponer o iniciar una herramienta, app, plugin, skill, integración u otra solución propia para cubrir una capacidad, revisar las herramientas ya registradas para esa capacidad.
- Si ninguna cubre suficientemente la necesidad, investigar alternativas externas reutilizables razonables, que se justifican por la ventaja concreta que aportan.
- Proponer construir cuando el hueco persista, indicando qué se revisó.
- El esfuerzo de búsqueda es proporcional al costo y a la importancia de la construcción.
- No hace falta repetir la comparación cuando la decisión de construir en lugar de reutilizar ya fue evaluada explícitamente, aprobada y sigue vigente.
- Cuando construir tenga un propósito específico que vuelva irrelevante reutilizar algo existente —aprendizaje, control o una necesidad deliberadamente específica—, ese motivo se declara.
- Si cambian materialmente las condiciones que sustentaban una decisión anterior de construir, esa decisión puede necesitar reevaluación.

## Transición entre fases

Antes de empezar una fase material nueva —pasar de documentación a código, de prototipo a uso real, de un usuario a varios—:

- se consulta `pendientes.md`;
- se identifican los asuntos que afectan a esa fase;
- se clasifican en **A**, cerrar antes de empezar; **B**, medir durante la fase; y **C**, posponer;
- se cierran todos los **A** antes de iniciar el trabajo de la fase.

Tener un pendiente escrito no alcanza si nadie está obligado a leerlo al cambiar de fase: sin esta regla, la transición depende de que alguien se acuerde, que es justo lo que `pendientes.md` existe para evitar.

No aplica a microtareas ni a cada pull request. Aplica a transiciones de fase material, que son pocas y reconocibles.
