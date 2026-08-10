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

## Procedencia de ejecución

Quién es evaluado y quién ejecuta la prueba son cosas distintas, y confundirlas
ya produjo una atribución equivocada en este benchmark. Cada corrida registra por
separado:

- **`SUJETO_EVALUADO`** — el reviewer que se está midiendo.
- **`MODELO_ALIAS`** — el identificador de modelo observable, o
  `MODELO_EFECTIVO_NO_OBSERVABLE`.
- **`VIA`** — la vía de acceso: API de la plataforma, membresía, u otra.
- **`EJECUTOR_DE_LA_PRUEBA`** — el agente que preparó, disparó y materializó la
  ejecución. No es el sujeto.
- **`AUDITOR_POSTERIOR`** — quien evaluó la calidad de los hallazgos, cuando esa
  auditoría exista.

Cuando el ejecutor no pueda establecerse con evidencia, se escribe
`NO_VERIFICADO`. No se infiere.

Desde ahora ese dato se produce al ejecutar y no se reconstruye después:
`reglas.md`, en "Destinatario y firma de ejecución", exige un encabezado de
destinatario al inicio de toda tarea operativa y una firma al final con ejecutor
real, entorno, modelo, esfuerzo, sujeto evaluado, vía y fecha. Para las corridas
de este benchmark esa firma incluye además el auditor posterior. La convención
rige hacia adelante y no reinterpreta los registros históricos de la tabla de
abajo.

**Dos cosas que no sirven para atribuir ejecutor, y conviene tenerlas escritas
porque las dos invitan al error:**

- **El autor de los commits.** En este repositorio todos los agentes commitean
  bajo la misma identidad Git, así que el campo `author` no distingue nada.
- **El prefijo de la rama.** Una rama `codex/*` indica la convención de nombre
  con la que se abrió la tarea, no quién la ejecutó después.

Cambiar de ejecutor **no crea por sí solo una versión nueva del benchmark**, si
el input, la política, las restricciones y las condiciones materiales se
mantienen equivalentes. Pero se registra igual, porque puede afectar el proceso
operativo y la reproducibilidad.

### Trazabilidad de las tareas del benchmark

Reconstruida a partir del historial de Git y de los artefactos persistidos. La
certeza se declara; no se rellena con suposiciones.

| Commits | Tarea | Ejecutor | Certeza |
| --- | --- | --- | --- |
| `8c2b693`, `e223d6a`, `0b3c77a`, `0139471` | Instalación y corrección del reviewer de Gemini | `NO_VERIFICADO` | — |
| `cba4a90` | Primera prueba del reviewer Kimi | `NO_VERIFICADO` | — |
| `e46ed74`, `e5772d6`, `6ac0829`, `2587b3c` | Protocolo de dos rondas y calibración manual | `NO_VERIFICADO` | — |
| `374f620`, `7f041a1`, `eb1020d`, `1939ce0` | Área de laboratorio, benchmark v1, Caso C congelado y cierre de la limitación histórica | `NO_VERIFICADO` | — |
| `c81ba40`, `a2763ca` | Runner canónico del Caso C y su porte a workflow | `NO_VERIFICADO` | — |
| `0d79a0c` | Registro del intento canónico fallido de Open Platform | `NO_VERIFICADO` | — |
| `eafc25b` | Registro del benchmark de Kimi Code por membresía | `NO_VERIFICADO` | ver nota |
| `97df625` | Auditoría cualitativa de Kimi Code Moderato Run 1 | Claude | Alta, por observación directa |

Nota sobre `eafc25b`: la **preparación local** —instalación de Kimi Code CLI
`0.34.0`, home y workspace aislados fuera del repositorio, validación de los seis
hashes del Caso C y redacción de la instrucción del reviewer— la realizó Claude,
y está verificada por observación directa. La **materialización de la corrida** y
su registro ocurrieron después, con un mecanismo distinto del preparado —agent
file con todas las herramientas deshabilitadas, en lugar de reglas `deny` en
`config.toml`—, así que el ejecutor de esa parte queda `NO_VERIFICADO`.

Que el ejecutor de varias tareas no esté verificado **no degrada la validez
experimental** de los resultados, mientras se mantengan la integridad del input
congelado, la política, las restricciones y la telemetría, que sí están
documentadas y verificadas en cada archivo de resultado.
