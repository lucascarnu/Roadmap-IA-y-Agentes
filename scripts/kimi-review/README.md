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

## Timeouts y at-most-once

Los cuatro límites predeterminados son independientes:

- conexión: 10 segundos, para fallos previos al establecimiento del canal;
- primer evento: 180 segundos, con amplio margen sobre la sonda mínima observada
  de aproximadamente 1,3 segundos;
- inactividad: 60 segundos desde cada evento, reiniciado mientras el stream siga
  vivo;
- total: 20 minutos como techo absoluto para una review representativa.

Cada código identifica su fase. El registro local de `attempt_id` se persiste
antes de invocar la fábrica de request. No existe reintento automático: un fallo
con consumo económico indeterminado termina el intento.

El transporte importa `sanitize.mjs` y `report.mjs`; no reimplementa sus
protecciones. La prueba estructural de ausencia de clientes de red sigue siendo
deliberadamente nominal sobre esos dos módulos. No se amplía al transporte,
porque éste sí contiene un cliente HTTPS real. En cambio, ambas baterías instalan
una guarda observable que hace fallar cualquier uso accidental de `fetch` o de
las primitivas de `node:http` y `node:https`; los casos del transporte usan sólo
una fábrica inyectada.

Los dos `HEADERS_TIMEOUT` del camino no streaming son la evidencia anterior. La
evidencia posterior con carga representativa queda pendiente de la unidad de
review separada; esta unidad no realiza solicitudes a proveedores.

## Verificación

    node --test scripts/kimi-review/kimi-review.test.mjs

    node --test scripts/kimi-review/stream-transport.test.mjs
