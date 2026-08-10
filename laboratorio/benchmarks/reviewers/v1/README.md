# Reviewer Benchmark v1

## Propósito

Comparar reviewers de IA bajo condiciones reproducibles y medir:

- precisión de los hallazgos;
- falsos positivos;
- omisiones materiales, cuando puedan determinarse;
- severidad asignada;
- cumplimiento del protocolo de evidencia;
- calidad de la decisión final;
- latencia;
- costo de API o consumo de cuota, cuando sea observable;
- necesidad de una segunda ronda;
- intervención humana;
- estabilidad entre ejecuciones.

## Casos previstos

- Caso A: PR pequeña. Pendiente de seleccionar y congelar.
- Caso B: PR mediana. Pendiente de seleccionar y congelar.
- [Caso C: PR compleja](casos/caso-c-pr16/README.md). Congelado en la PR #16.

Por ahora, solo el Caso C está congelado.

Ejecuciones registradas de Kimi Open Platform:

- [Run 1 — referencia histórica](resultados/kimi-open-platform-run-1.md):
  respuesta completada sobre un input casi reproducible, con un bloque histórico
  de Actions de 90 tokens no recuperable exactamente.
- [Canonical attempt 1](resultados/kimi-open-platform-canonical-attempt-1.md):
  input congelado controlado y fallo de transporte antes de obtener respuesta.

`Run` identifica ejecuciones con una respuesta completa disponible; `attempt`
conserva intentos que terminaron antes de producirla. Las comparaciones directas
entre reviewers deben usar el input canónico congelado.

## Artefactos

- Este README define el benchmark.
- `casos/` conserva los inputs congelados.
- `resultados/` conserva la salida y la auditoría de cada run, y los intentos
  fallidos cuando aportan evidencia sobre fiabilidad operacional.

Una nueva corrida de un caso congelado no debe tomar el HEAD vivo de una PR si
ese HEAD ya cambió. Debe usar el paquete congelado del caso.

## Comparabilidad

Para comparar reviewers sobre un mismo caso deben recibir, en la medida que su
interfaz lo permita:

- el mismo diff;
- el mismo HEAD y caso congelado;
- la misma `reviewer-policy.md`;
- el mismo contexto auxiliar;
- las mismas fuentes permitidas;
- el mismo contrato de evidencia;
- el mismo criterio posterior de auditoría.

Toda diferencia inevitable de plataforma o interfaz debe quedar registrada en
el resultado correspondiente.

## Versionado

Una vez observado un resultado, el caso no se modifica retroactivamente para
favorecer o perjudicar a un reviewer.

Los cambios materiales de diff, política, contexto esencial, fuentes, contrato
de evidencia o scoring crean una nueva versión del benchmark.

## Repeticiones

Una corrida mide una ejecución, no la calidad estable del modelo. La consistencia
se evaluará mediante varias corridas independientes sobre el mismo caso y sin
cambiar sus condiciones.

## Fiabilidad operacional

Además de calidad, costo y latencia, cada proveedor e interfaz registra:

- completion attempts;
- completions exitosas;
- fallos de transporte;
- timeouts;
- respuestas inválidas;
- necesidad de retries;
- disponibilidad de `usage` y costo después de un fallo.

Una muestra pequeña se conserva como evidencia, pero no se convierte en un
porcentaje de fiabilidad ni en una conclusión estable.

## Separación

Siempre se distinguen:

- el resultado bruto emitido por el reviewer;
- la auditoría posterior;
- la interpretación;
- la decisión de adopción.

El benchmark no adopta automáticamente al reviewer con más hallazgos.
