# Kimi Open Platform — Caso C — Canonical attempt 1

## Identidad

- Reviewer: Kimi K2.7 Code.
- Vía: Open Platform API.
- Modelo: `kimi-k2.7-code`.
- Caso: Caso C — PR #16.
- Input: `CANONICAL_FROZEN_INPUT`.
- Identificador: `Canonical attempt 1`.
- Estado: `FAILED_TRANSPORT`.
- `execution_status`: `FAILED`.
- `failure_class`: `TRANSPORT`.
- Error observado: `read ECONNRESET`.
- Actions run: [31405079757](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/actions/runs/31405079757).

Este intento no se denomina Run 2 porque no produjo una respuesta completa del
reviewer. La numeración `Run` se conserva para ejecuciones con una salida
estructurada disponible.

## Integridad del input

El runner validó el manifiesto y los seis inputs autorizados antes de llamar al
modelo:

| Input | SHA-256 |
| --- | --- |
| `diff.patch` | `1d492c83267a45821467b2ec2fc80f7be3556731b2fcb7d1016a42d66fa78b7e` |
| `pr-metadata.json` | `e755a42bd6feb832e3e7030f5d88a82a32aa02a057197e5b4d9a74dbc9b2ce03` |
| `contexto/reviewer-policy.md` | `6b14a9435d2b6391d54878c55c3d1f121a6c6d76c3b94f7a31e66353e4718b27` |
| `contexto/vision-extracto.md` | `57cd6c643af2f9d42d5ed862b87861fe78a3253f32ab5de17e2b981956c21b20` |
| `contexto/reglas.md` | `52edcd7ce17d1670b19cf902822bc3a02bb106ff40e288e7f799a9596a64fb67` |
| `contexto/decision-0004.md` | `cf724a56ec4f398de6c04a6340790083ee17fb25e2086bd4e8d5e205f64ec861` |

- El input correspondió al caso congelado con HEAD
  `2587b3cfd3db9831386b6a04fbfa3807444fd458`.
- No se usó estado vivo de GitHub ni Actions como evidencia.
- No se entregaron resultados o auditorías anteriores al modelo.
- `contexto/actions-evidence.txt` permaneció excluido.
- No se publicó ninguna review ni comentario sobre la PR #16.

## Configuración

- Reasoning: comportamiento soportado por defecto; no deshabilitado.
- Structured Output: habilitado.
- Máximo de Ronda 1: 24.000 tokens.
- Máximo de Ronda 2: 4.000 tokens.
- Timeout de headers de Ronda 1: 12 minutos.
- Timeout de body de Ronda 1: 5 minutos.
- Retries: 0.
- Hard cap: USD 0,15.
- Gate automático de USD 0,10: no aplicado por tratarse de un benchmark manual.

## Telemetría

- Input estimado de Ronda 1: 26.993 tokens.
- Contexto auxiliar estimado: 7.200 tokens.
- Costo máximo previo de Ronda 1: USD 0,121643.
- Completion calls de Ronda 1: 1.
- Completion calls de Ronda 2: 0.
- Inicio del runner: `2026-08-10T15:43:15.941Z`.
- Inicio de la llamada de Ronda 1: `2026-08-10T15:43:17.847Z`.
- Tiempo aproximado hasta el fallo: 262 segundos, 4m22s.
- Duración del job: aproximadamente 4m29s.
- Headers: no observados.
- `finish_reason`: no disponible.
- Usage de prompt, completion, reasoning y total: no disponible.
- JSON estructurado: no recibido.
- Costo real: **NO OBSERVABLE**.

El proveedor podría haber realizado procesamiento antes del reset. Como la
respuesta no incluyó `usage`, no puede inferirse ni calcularse el costo real; en
particular, no corresponde asumir costo cero.

## Clasificación

- `RESULTADO_CUALITATIVO`: `NO DISPONIBLE`.
- `RESULTADO_OPERACIONAL`: `FALLO_TRANSPORTE`.
- `CONTAMINACION`: `NO OBSERVADA`.
- `INTEGRIDAD_EXPERIMENTAL`: `CONSERVADA`.
- Causa raíz: `NO DETERMINADA`.

El hecho observable es que la conexión terminó con `read ECONNRESET`. Este
intento no permite atribuir la causa raíz al modelo, al harness ni al proveedor,
y tampoco aporta evidencia para auditar la calidad del reviewer.

## Relación con otras ejecuciones

- [Run 1](kimi-open-platform-run-1.md) es la referencia histórica exitosa. Su
  input es casi reproducible, salvo el bloque histórico de Actions de 90 tokens
  que no pudo recuperarse exactamente.
- `Canonical attempt 1` usó el input congelado controlado, pero falló antes de
  obtener una respuesta.

Con una única ejecución histórica completada y un intento canónico fallido no
corresponde concluir todavía si Open Platform es fiable o no fiable.
