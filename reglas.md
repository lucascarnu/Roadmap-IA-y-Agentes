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
- El circuito automático llega hasta donde lo autoricen las garantías objetivas disponibles. Hoy termina con la pull request lista para integrar. Las condiciones bajo las cuales la integración misma podría automatizarse todavía no están definidas: la decisión sobre el modelo operativo las deja explícitamente abiertas.
- Una tarea automática no depende de poder consultar al usuario: debe estar suficientemente especificada o fallar de forma segura.

## Estados de evidencia

Toda afirmación sobre cómo se comporta el sistema declara en cuál de estos tres estados se apoya. No son sinónimos ni grados de confianza: se distinguen por el tipo de evidencia que los sostiene.

- **DOCUMENTADO.** Lo respalda documentación oficial de quien produce la herramienta. Dice cómo debería comportarse, no que se haya comprobado acá. Se cita con su fuente y envejece con las versiones.
- **PROBADO LOCALMENTE.** Se ejecutó una prueba concreta en un entorno concreto y se observó el resultado. Vale para ese entorno y para lo que la prueba efectivamente cubrió, no para el caso general.
- **VALIDADO OPERATIVAMENTE.** El circuito objetivo se comportó como se espera, en el entorno donde realmente corre, de forma repetida y con evidencia suficiente para confiar en él.

Un agente **no puede declarar VALIDADO OPERATIVAMENTE algo que su entorno no le permite probar**. Puede documentarlo, puede señalar qué haría falta para validarlo, y puede pedir que lo valide quien tenga acceso a ese entorno; lo que no puede es dar por demostrado lo que no ejecutó.

De ahí se sigue una separación de roles: quien revisa responde si algo está bien construido, y quien valida responde si funciona realmente. Son preguntas distintas y no siempre las puede contestar el mismo agente.

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
