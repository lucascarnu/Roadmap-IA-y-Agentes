# Instrumental durable para reviews de Kimi

`sanitize.mjs` elimina credenciales y datos sensibles de objetos, errores,
headers, URLs y texto libre, pero conserva los contadores numéricos de uso que
el contrato reconoce. `report.mjs` separa el payload contractual completo, el
sobre API sanitizado y la telemetría, autoverifica el payload y puede persistir
exactamente el mismo artefacto que devuelve.

Estos módulos existen por el defecto de representación observado durante la
review de PR #106. Promueven y corrigen la lógica de saneamiento probada primero
en un runner efímero. Los futuros runners de Kimi deben importarlos en lugar de
reimplementar el saneamiento o el ensamblado del informe.

La batería es portable, usa `node --test` y no depende de rutas personales ni de
clientes de red. El diagnóstico contra el runner anterior fue evidencia local de
la unidad que creó estos módulos, no una dependencia durable.

`stream-transport.mjs` agrega un transporte SSE incremental y at-most-once. El
request usa `stream: true`, `stream_options: {"include_usage": true}` y el
parámetro vigente `max_completion_tokens`; el límite predeterminado queda fijado
en 32768 antes del preflight. `include_usage` es obligatorio porque el uso llega
en un chunk adicional inmediatamente anterior a `[DONE]`. Los chunks anteriores
pueden traer `usage: null`, y `finish_reason` sólo se acepta cuando el chunk final
lo informa como `stop`.

El transporte reconstruye `content`, captura `reasoning_content` cuando aparece
y valida el JSON localmente. Su forma en streaming y la compatibilidad de
structured output estricto con streaming permanecen no documentadas; ninguna de
las dos se presupone. Un stream sin `[DONE]`, `finish_reason: stop` o usage final
se clasifica incompleto.

Los generadores de paquetes deben exigir que `findings[].line` sea un número
entero JSON sin comillas o `null`; un string numérico no es válido y no se
normaliza. `findings[].origin` pertenece al enum cerrado `DIFF`,
`REPOSITORY_FILE`, `GITHUB_STATE`, `ACTIONS_RUN` o `NONE`.

## Timeouts y at-most-once

Los cuatro límites predeterminados son independientes:

- conexión: 10 segundos, para fallos previos al establecimiento del canal;
- primer evento: 180 segundos, con amplio margen sobre la sonda mínima observada
  de aproximadamente 1,3 segundos;
- inactividad: 60 segundos entre eventos contados;
- total: 20 minutos como techo absoluto para una review representativa.

El deadline del primer evento es absoluto desde que se establece la conexión y
sólo termina con un evento contado; comentarios y bytes que todavía no completan
un evento no lo reinician. El deadline de inactividad también es absoluto desde
el último evento contado. Comentarios y fragmentos parciales no lo reinician. Al
vencer cualquiera de los dos se rechaza antes de invocar otro `iterator.next()`;
si el deadline total ya venció, `TOTAL_TIMEOUT` tiene precedencia.

Cada código identifica su fase. `request_started_at` se toma inmediatamente
antes de invocar la fábrica, después de persistir el registro local de
`attempt_id`. La telemetría conserva el tiempo hasta el primer evento y el mayor
intervalo entre eventos contados. Todos los eventos de un mismo fragmento
comparten sello temporal, por lo que su intervalo interno es cero. No existe
reintento automático: un fallo con consumo económico indeterminado termina el
intento.

Cuando los eventos lo incluyen, el transporte conserva un único `completion_id`
y modelo efectivo; una divergencia posterior invalida el protocolo. Su ausencia
queda representada por `null` y no invalida la review.

## Idempotencia de publicación

El módulo construye y expone para cada intento una línea literal estable:

    KIMI_STREAM_REVIEW HEAD=<HEAD_EXACTO> ATTEMPT_ID=<ATTEMPT_ID_LOCAL>

El transporte no consulta GitHub ni publica por sí mismo. La unidad o publicador
externo busca el marcador completo antes de publicar: si ya existe, no lo
duplica. Ese publicador también busca y reporta cualquier comentario previo para
el mismo HEAD, sin que eso bloquee por sí solo. `completion_id` se agrega cuando
sea observable, pero nunca reemplaza al marcador como condición de idempotencia.

El transporte importa `sanitize.mjs` y `report.mjs`; no reimplementa sus
protecciones. La prueba estructural de ausencia de clientes de red sigue siendo
deliberadamente nominal sobre esos dos módulos. No se amplía al transporte,
porque éste sí contiene un cliente HTTPS real. En cambio, ambas baterías instalan
una guarda observable que hace fallar cualquier uso accidental de `fetch` o de
las primitivas de `node:http` y `node:https`; los casos del transporte usan sólo
una fábrica inyectada.

## Evidencia operativa del transporte

Dos ejecuciones no streaming terminaron en `HEADERS_TIMEOUT` con un límite de
720.000 ms. La ejecución streaming representativa terminó correctamente con
HTTP 200, 22.863 eventos SSE, `finish_reason: stop`, usage y `[DONE]`. El primer
evento llegó en 8.785 ms, el intervalo máximo entre eventos fue 4.102 ms y la
duración total fue 923.136 ms —15 minutos 23,136 segundos—, con 22.523 reasoning
tokens y un costo calculado de USD 0,11793665.

El streaming resolvió la observabilidad y continuidad del transporte. Que la
generación durara 923.136 ms frente al límite no streaming de 720.000 ms sostiene
fuertemente la inferencia sobre los timeouts anteriores, pero no constituye una
traza interna del proveedor. Esta evidencia tampoco demuestra que reducir el
paquete hubiera sido irrelevante.

Una latencia de 15 minutos 23 segundos no satisface el tiempo operativo aceptable
para un reviewer cotidiano de varias rondas. Mientras esa latencia no se
resuelva, Kimi no se considera reviewer principal del camino crítico: queda como
contingencia o segunda opinión, pendiente de una decisión durable posterior.

## Verificación

    node --test scripts/kimi-review/kimi-review.test.mjs

    node --test scripts/kimi-review/stream-transport.test.mjs
