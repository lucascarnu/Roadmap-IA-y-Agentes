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
- [Caso C: PR compleja](casos/caso-c-pr16.md). Congelado en la PR #16.

Por ahora, solo el Caso C está congelado.

Resultado registrado: [Kimi Open Platform — Caso C — Run
1](resultados/kimi-open-platform-run-1.md).

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

## Separación

Siempre se distinguen:

- el resultado bruto emitido por el reviewer;
- la auditoría posterior;
- la interpretación;
- la decisión de adopción.

El benchmark no adopta automáticamente al reviewer con más hallazgos.
