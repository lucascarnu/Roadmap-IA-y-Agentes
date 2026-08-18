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

Este instrumental no reemplaza el transporte de red ni modifica sus timeouts por
fase. Sólo gobierna la sanitización, el ensamblado, la persistencia y la
autoverificación del informe final.

## Verificación

    node --test scripts/kimi-review/kimi-review.test.mjs
