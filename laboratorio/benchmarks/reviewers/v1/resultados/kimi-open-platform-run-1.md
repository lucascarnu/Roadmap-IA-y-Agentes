# Kimi Open Platform — Caso C — Run 1

## Identidad

- Reviewer: Kimi K2.7 Code
- Vía: Kimi Open Platform API
- Caso: Caso C — PR #16
- Run: 1
- HEAD: `2587b3cfd3db9831386b6a04fbfa3807444fd458`
- Tipo: calibración manual
- Review de GitHub:
  [4897202738](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/pull/16#pullrequestreview-4897202738)
- Actions run:
  [31392565012](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/actions/runs/31392565012)

## Condiciones y telemetría

- Diff: completo
- Contexto auxiliar: 7.290 tokens
- Recortes de contexto: ninguno
- Input estimado previo: 27.031 tokens
- Prompt real: 27.448 tokens
- Completion: 7.538 tokens
- Reasoning informado: 6.123 tokens
- Total: 34.986 tokens
- Ronda 1, máximo de output: 24.000 tokens
- Ronda 2, máximo de output: 4.000 tokens
- Ronda 2: no ejecutada; no hubo solicitudes M1/M2 con fuente servible
- `finish_reason`: `stop`
- JSON estructurado: válido
- Duración de la llamada de Ronda 1: 246,886 s
- Duración interna hasta publicar: 253,1 s
- Duración aproximada: 4 min 13 s
- Costo real total: USD 0,056228
- Decisión publicada: `REQUEST_CHANGES`
- Hallazgos: 8
- Intervención humana: autorización y disparo manual de la calibración

Timeouts de transporte de la calibración:

- headers: 12 min;
- body: 5 min.

El timeout de headers de 12 minutos fue margen experimental para observar la
latencia real, no una decisión operativa.

## Resultado emitido por el reviewer

Esta sección conserva el contenido conceptual de los ocho hallazgos publicados,
antes de incorporar la auditoría posterior.

### F1 — M2 — SETTLED / DIFF

**Contradicción: tools para comentarios inline habilitadas pese a declaración
contraria.** El reviewer sostuvo que el cuerpo de la PR decía que no se publican
comentarios inline, mientras `gemini-review.yml` habilitaba herramientas MCP que
podrían publicarlos.

### F2 — M3 — SETTLED / DIFF

**Falta de concurrency en el workflow de Kimi.** El reviewer señaló que pushes
`synchronize` próximos podrían ejecutar reviews simultáneas sobre la misma PR.

### F3 — M3 — SETTLED / DIFF

**Dependencia innecesaria de review en el job fallthrough.** El reviewer sostuvo
que esperar al estado `skipped` de `review` agregaba latencia y ruido sin aportar
funcionalidad al caso `fallthrough`.

### F4 — M3 — SETTLED / DIFF

**Imagen del MCP server no fijada por digest SHA.** El reviewer señaló que
`ghcr.io/github/github-mcp-server:v0.27.0` usa un tag y no un digest inmutable, y
lo presentó como inconsistente con la práctica de fijación declarada.

### F5 — M3 — SETTLED / DIFF

**Timeouts de headers y body inconsistentes en Ronda 1.** El reviewer consideró
inconsistente esperar 12 minutos por headers y 5 minutos por el cuerpo de una
salida de hasta 24.000 tokens.

### F6 — M3 — SETTLED / DIFF

**Política duplicada en mensajes system y user.** El reviewer indicó que
`policyText` se incluye en `system` y vuelve a aparecer en `auxiliaryBlocks`
dentro de `user`, consumiendo contexto innecesariamente.

### F7 — O — SETTLED / DIFF

**Uso innecesario de `${{ }}` en una condición `if`.** El reviewer señaló que la
interpolación explícita es redundante, aunque válida.

### F8 — O — SETTLED / DIFF

**`workflow_dispatch` de Kimi acotado exclusivamente a la PR #16.** El reviewer
señaló que la restricción intencional limita la reutilización futura del
workflow.

## Auditoría posterior

### F1 — FALSO_POSITIVO_MATERIAL

El cuerpo de la PR dice que no se publican comentarios inline «desde el workflow
paralelo», es decir, Kimi. No afirma que Gemini carezca de esa capacidad.

Además, Kimi clasificó el hallazgo como `SETTLED/DIFF`, aunque la premisa que
genera la supuesta contradicción proviene del cuerpo de la PR y no únicamente del
diff. La propia `reviewer-policy.md` establece que el cuerpo expresa intención y
no constituye por sí solo evidencia técnica suficiente para ese cierre.

Fue el único M2 `SETTLED` y produjo `REQUEST_CHANGES`.

### F2 — CORRECTO_UTIL

El workflow no declara `concurrency`. Pushes `synchronize` próximos podrían
generar ejecuciones y reviews concurrentes sobre la misma PR.

### F3 — FALSO_POSITIVO

`fallthrough` no existe únicamente para `command == fallthrough`: también
analiza estados anormales `failure`, `cancelled` y `skipped` de `review`. Por eso
necesita disponer de su estado; la dependencia forma parte del manejo de fallos.

### F4 — PARCIAL_SOBREDIMENSIONADO

Es correcto que `ghcr.io/github/github-mcp-server:v0.27.0` usa un tag y no un
digest inmutable, y puede ser una mejora real de supply chain. Sin embargo, la PR
afirma específicamente que las Actions están fijadas por SHA, no que todas las
imágenes estén fijadas por digest. La contradicción formulada no existe.

### F5 — FALSO_POSITIVO

Los timeouts corresponden a fases diferentes: headers controla la espera previa
a recibirlos y body controla la recepción posterior del cuerpo. Los valores de
12 y 5 minutos no demuestran por sí mismos un problema funcional.

### F6 — CORRECTO_UTIL

`policyText` se incluye directamente en `system` y vuelve a aparecer en
`auxiliaryBlocks`, usado en `user`. Esto duplica contexto y consume tokens
innecesariamente.

### F7 — CORRECTO_TRIVIAL

La interpolación es redundante en una condición `if`, pero válida y sin impacto
funcional.

### F8 — CORRECTO_INTENCIONAL

La restricción existe, pero es una condición explícita de la calibración y no un
defecto de la prueba.

## Resumen cuantitativo de la auditoría

- Total de hallazgos: 8
- `CORRECTO_UTIL`: 2
- `CORRECTO_TRIVIAL`: 1
- `CORRECTO_INTENCIONAL`: 1
- `PARCIAL_SOBREDIMENSIONADO`: 1
- `FALSO_POSITIVO`: 2
- `FALSO_POSITIVO_MATERIAL`: 1

No se calcula un score numérico global ni un porcentaje de precisión: una sola
corrida y estas categorías no justifican esa simplificación.

## Calidad de la decisión

- Decisión publicada: `REQUEST_CHANGES`
- ¿Estuvo afectada por un falso positivo material?: **SÍ**

F1 fue el único hallazgo M2 `SETTLED`. La lógica determinista del workflow
produce `REQUEST_CHANGES` ante un M1/M2 vigente y `SETTLED`; sin F1, los demás
hallazgos de esta ejecución no habrían producido esa decisión. Es una señal
material del benchmark.

## LIMITACION_DEL_HARNESS

El control actual valida que un hallazgo `SETTLED/DIFF` tenga un `path:line`
válido en el diff, pero no verifica que la premisa semántica completa derive
realmente del diff.

F1 atravesó el control porque la línea señalada existía, aunque la supuesta
contradicción dependía de interpretar el cuerpo de la PR. Esta limitación no se
atribuye automáticamente al modelo.

## Estado

- Estado del reviewer: **NO ADOPTADO / NO DESCARTADO**
- Estado del benchmark: **EN_EVALUACION**
- Evidencia disponible: 1 corrida válida del Caso C

Pendiente:

- segunda corrida idéntica de Kimi Open Platform sobre el Caso C;
- seleccionar y congelar un Caso A pequeño;
- seleccionar y congelar un Caso B mediano;
- definir cuántas repeticiones mínimas se usarán para evaluar estabilidad;
- ejecutar Kimi Code vía membresía;
- ejecutar Claude Code;
- ejecutar Codex;
- comparar calidad, latencia, costo o cuota e intervención.
