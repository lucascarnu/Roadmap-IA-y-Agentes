# Kimi Code Moderato — Caso C — Run 1

## Identidad

- Reviewer: Kimi Code.
- Vía: membresía Kimi mediante OAuth administrado `managed:kimi-code`.
- Caso: Caso C — PR #16.
- Run: 1.
- Input: `CANONICAL_FROZEN_INPUT`.
- Rama del ejecutor: `codex/instalar-review-gemini`.
- HEAD del repositorio al ejecutar:
  `0d79a0c426c4a463b292efcd07a2f59674aa4333`.
- Estado: `COMPLETED`.
- Resultado cualitativo: **AUDITADO**. Ver "Auditoría cualitativa", agregada
  después de la ejecución y sin tocar la salida bruta.

## Configuración

- Kimi Code CLI: `0.34.0`.
- Comando: una sesión nueva con `kimi -p` y
  `--output-format stream-json`.
- Alias predeterminado observable: `kimi-code/kimi-for-coding`.
- Modelo enviado por la CLI: `kimi-for-coding`.
- Nombre mostrado por la configuración de la CLI: `K2.7 Coding`.
- Alias solicitado explícitamente: ninguno.
- Tier: se usó el comportamiento predeterminado de la membresía; HighSpeed no
  fue seleccionado. La CLI no emitió un campo de tier en la sesión.
- Thinking: `on`.
- `thinkingKeep`: `all`.
- Máximo expuesto por la solicitud de la CLI: 262.144 tokens.
- Structured Output de API: no aplica; la estructura se exigió semánticamente
  en la instrucción y el contenido final fue JSON válido.
- Sesiones previas reanudadas: ninguna.
- Retries visibles: ninguno.

No se usó `KIMI_API_KEY` ni Kimi Open Platform pay-as-you-go.

## Diferencias de plataforma

- `DIFERENCIA_DE_PLATAFORMA`: Kimi Code resolvió el protocolo en una única
  sesión semántica. No se forzó la arquitectura HTTP de dos llamadas del
  workflow de Open Platform.
- `DIFERENCIA_DE_PLATAFORMA`: la configuración actual de herramientas de Kimi
  Code permite habilitar o deshabilitar herramientas globalmente, pero no
  garantiza por sí sola que `Read`, `Grep` y `Glob` queden confinadas a un path.
  Para sostener el aislamiento fuerte se deshabilitaron **todas** las
  herramientas y se incluyeron los seis inputs exactos en el agent-file.
- `DIFERENCIA_DE_PLATAFORMA`: la CLI informó uso agregado de output, pero no
  separó tokens de reasoning del contenido final visible.

## Integridad del input

El manifiesto y los seis archivos autorizados se validaron antes de iniciar la
única inferencia:

| Input | SHA-256 |
| --- | --- |
| `diff.patch` | `1d492c83267a45821467b2ec2fc80f7be3556731b2fcb7d1016a42d66fa78b7e` |
| `pr-metadata.json` | `e755a42bd6feb832e3e7030f5d88a82a32aa02a057197e5b4d9a74dbc9b2ce03` |
| `contexto/reviewer-policy.md` | `6b14a9435d2b6391d54878c55c3d1f121a6c6d76c3b94f7a31e66353e4718b27` |
| `contexto/vision-extracto.md` | `57cd6c643af2f9d42d5ed862b87861fe78a3253f32ab5de17e2b981956c21b20` |
| `contexto/reglas.md` | `52edcd7ce17d1670b19cf902822bc3a02bb106ff40e288e7f799a9596a64fb67` |
| `contexto/decision-0004.md` | `cf724a56ec4f398de6c04a6340790083ee17fb25e2086bd4e8d5e205f64ec861` |

- Base congelada: `62411360bf36aa649c94f5a0a109caeb9b887acc`.
- HEAD congelado: `2587b3cfd3db9831386b6a04fbfa3807444fd458`.
- Los hashes de origen y de las copias temporales coincidieron exactamente.
- El workspace temporal no contenía `.git`, resultados anteriores, auditorías,
  `actions-evidence.txt`, estado vivo de GitHub ni otros archivos del repo.
- El agent-file de instrucciones e inputs midió 107.304 bytes y su SHA-256 fue
  `23674225b3a375e77f695fce3953adc1f2b9e51d938b528ad0a1e50735040dbd`.

## Telemetría

- Inicio: `2026-08-10T14:32:29.3687358-03:00`.
- Fin: `2026-08-10T14:38:06.7320721-03:00`.
- Duración del comando: 337,360 s.
- Duración del turno informada por la CLI: 335,175 s.
- Primer token: 6,804 s.
- Tiempo del stream del modelo: 328,342 s.
- Tiempo de decodificación del servidor: 327,981 s.
- Consumo del cliente: 0,361 s.
- Exit code: `0`.
- `finishReason`: `end_turn`.
- `providerFinishReason`: `completed`.
- `rawFinishReason`: `stop`.
- Input (`usage.inputOther`): 26.792 tokens.
- Cache read: 0 tokens.
- Cache creation: 0 tokens.
- Output (`usage.output`): 25.267 tokens.
- Total derivado de los campos de usage: 52.059 tokens.
- Tokens de reasoning separados: **NO OBSERVABLE**.
- Registros `stream-json`: 3 (versión, respuesta y pista de reanudación).
- Mensajes finales del assistant: 1.
- Steps del modelo: 1.
- Tool calls: 0.
- Tools rechazadas: 0.
- Longitud del contenido final: 5.262 caracteres.
- SHA-256 del contenido final UTF-8:
  `77800590a3ceb97720ddb6a7659b3600110ea1d3fb470374d185fa60fab9327c`.
- JSON final: válido.
- Stderr: vacío.
- Intervención en la inferencia: ninguna después del disparo.

## Resultado bruto

Contenido completo del único mensaje final del reviewer:

```json
{
  "decision_preliminar": "COMMENT",
  "resumen": "La PR instala reviewers automáticos de Gemini y Kimi. Se detectaron seis hallazgos: uno M2 abierto sobre la publicación de reviews sin comentarios inline, y cinco M3/O observables en el diff relativos a timeouts inconsistentes, instalación redundante, contenedor sin digest SHA, job fallthrough ruidoso y duplicación de la política en el prompt.",
  "hallazgos": [
    {
      "id": "F1",
      "impacto": "M2",
      "estado_evidencia": "NEEDS_EVIDENCE",
      "origen_evidencia": "NONE",
      "path": ".github/workflows/kimi-review-test.yml",
      "line": 1178,
      "titulo": "Publicación de review sin array comments para REQUEST_CHANGES/APPROVE",
      "descripcion": "El workflow publica el review con github.rest.pulls.createReview usando solo body y event, sin construir ni enviar el array comments con ubicaciones en el diff. Si la decisión final es REQUEST_CHANGES o APPROVE, la API de GitHub podría rechazar la publicación o degradarla a COMMENT, invalidando la lógica de decisión calculada.",
      "solicitud_verificacion": {
        "pregunta_cerrada": "¿La API REST de GitHub acepta publicar un pull request review con event 'REQUEST_CHANGES' o 'APPROVE' sin proporcionar el array 'comments' con al menos un comentario asociado a una línea del diff?",
        "por_que_importa": "El workflow decide entre REQUEST_CHANGES, COMMENT y APPROVE pero solo envía body y event. Si la API exige comments para REQUEST_CHANGES/APPROVE, la publicación fallará o se degradará, invalidando la lógica de decisión.",
        "fuente_requerida": "OFFICIAL_DOCUMENTATION",
        "objetivo_concreto": "Confirmar en la documentación oficial de la API REST de GitHub los campos requeridos para POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews con event distinto de COMMENT."
      }
    },
    {
      "id": "F2",
      "impacto": "M3",
      "estado_evidencia": "SETTLED",
      "origen_evidencia": "DIFF",
      "path": ".github/workflows/kimi-review-test.yml",
      "line": 80,
      "titulo": "Llamadas secundarias a fetch sin timeouts explícitos",
      "descripcion": "Las llamadas a kimiRequest (estimación de tokens, lista de modelos y ronda 2) usan fetch global sin AbortController ni timeouts personalizados, mientras que kimiRound1Request implementa timeouts de conexión, headers y body. Si el transporte a la API de Moonshot se cuelga en esas llamadas secundarias, no hay cancelación controlada ni logging de timeout, a diferencia de ronda 1.",
      "solicitud_verificacion": null
    },
    {
      "id": "F3",
      "impacto": "M3",
      "estado_evidencia": "SETTLED",
      "origen_evidencia": "DIFF",
      "path": ".github/workflows/gemini-review.yml",
      "line": 44,
      "titulo": "Instalación global redundante de gemini-cli no fijada por SHA",
      "descripcion": "El paso 'Install pinned Gemini CLI' ejecuta npm install --global @google/gemini-cli@0.54.4 antes de usar google-github-actions/run-gemini-cli@f77273f4c914e4bf38440cf36a0369cb64a37489, que ya recibe gemini_cli_version: '0.54.4' y se encarga de instalar la CLI. La instalación global es redundante y no está fijada por SHA, a diferencia de las Actions.",
      "solicitud_verificacion": null
    },
    {
      "id": "F4",
      "impacto": "M3",
      "estado_evidencia": "SETTLED",
      "origen_evidencia": "DIFF",
      "path": ".github/workflows/gemini-review.yml",
      "line": 82,
      "titulo": "Contenedor MCP de GitHub sin digest SHA fijo",
      "descripcion": "El MCP server de GitHub se ejecuta con la imagen ghcr.io/github/github-mcp-server:v0.27.0, identificada solo por tag semántico. Aunque el cuerpo de la PR afirma que las Actions están fijadas por SHA, esta dependencia de contenedor no usa digest SHA, por lo que una reposición del tag podría alterar el código ejecutado sin cambiar el workflow.",
      "solicitud_verificacion": null
    },
    {
      "id": "F5",
      "impacto": "M3",
      "estado_evidencia": "SETTLED",
      "origen_evidencia": "DIFF",
      "path": ".github/workflows/gemini-dispatch.yml",
      "line": 102,
      "titulo": "Job fallthrough responde a comandos no reconocidos como fallos",
      "descripcion": "El job fallthrough publica un comentario de 'unable to process your review request' cuando needs.dispatch.outputs.command == 'fallthrough', es decir, para cualquier comentario o review que no empiece exactamente con '@gemini-cli /review'. Esto genera una respuesta automática en conversaciones ordinarias de la PR, aunque no haya habido una solicitud real de review.",
      "solicitud_verificacion": null
    },
    {
      "id": "F6",
      "impacto": "M3",
      "estado_evidencia": "SETTLED",
      "origen_evidencia": "DIFF",
      "path": ".github/workflows/kimi-review-test.yml",
      "line": 610,
      "titulo": "Política gobernante duplicada en el prompt de ronda 1",
      "descripcion": "El mensaje de sistema de ronda 1 incluye policyText completo, y luego el mensaje de usuario incluye el mismo policyText nuevamente dentro del bloque auxiliar 'Política gobernante'. Esto duplica la política en el prompt, consumiendo tokens de contexto que podrían usarse para el diff o la deliberación.",
      "solicitud_verificacion": null
    }
  ]
}
```

## Hallazgos

El reviewer emitió 6 hallazgos:

| ID | Impacto | Evidencia | Origen | Título |
| --- | --- | --- | --- | --- |
| F1 | M2 | `NEEDS_EVIDENCE` | `NONE` | Publicación de review sin array comments para REQUEST_CHANGES/APPROVE |
| F2 | M3 | `SETTLED` | `DIFF` | Llamadas secundarias a fetch sin timeouts explícitos |
| F3 | M3 | `SETTLED` | `DIFF` | Instalación global redundante de gemini-cli no fijada por SHA |
| F4 | M3 | `SETTLED` | `DIFF` | Contenedor MCP de GitHub sin digest SHA fijo |
| F5 | M3 | `SETTLED` | `DIFF` | Job fallthrough responde a comandos no reconocidos como fallos |
| F6 | M3 | `SETTLED` | `DIFF` | Política gobernante duplicada en el prompt de ronda 1 |

Esta sección transcribe y cuenta la salida; no determina si los hallazgos son
correctos, falsos positivos, útiles o materiales.

## Decisión

- Decisión preliminar emitida: `COMMENT`.
- Auditoría de la decisión: realizada. Ver "Calidad de la decisión".
- No se publicó review ni comentario en GitHub.
- No se propone merge a partir de esta ejecución.

## Herramientas utilizadas

- Herramientas expuestas al modelo: 0.
- Tool calls: 0.
- Acceso web, GitHub, Actions, shell, escritura, MCP y agentes: bloqueado por
  ausencia total de herramientas en el snapshot de la solicitud.
- El transporte HTTPS hacia Kimi Code fue la única comunicación externa del
  reviewer.

## Cuota / costo

- Plan o nombre comercial exacto: **NO OBSERVABLE** desde la CLI.
- Vía activa: OAuth administrado de Kimi Code/membresía.
- Cuota antes: **NO OBSERVABLE**.
- Cuota después: **NO OBSERVABLE**.
- Diferencia de cuota: **NO OBSERVABLE**.
- Costo monetario: **NO OBSERVABLE**; no se infiere equivalencia entre tokens,
  cuota de membresía y dólares.

## Limitaciones observables

- La CLI no expuso un identificador público más específico que el alias
  `kimi-code/kimi-for-coding`, el modelo de solicitud `kimi-for-coding` y el
  nombre mostrado `K2.7 Coding`. No se lo equipara a `kimi-k2.7-code` de Open
  Platform.
- El tier exacto no apareció en la telemetría de la sesión; sólo se observó que
  se usó el alias predeterminado y no se eligió HighSpeed.
- `usage.output` incluye el uso agregado informado por la CLI. Como la respuesta
  visible es mucho menor y no existe un campo separado de reasoning, no se puede
  descomponer ese total sin inventar datos.
- El stream público no incluyó usage; los contadores y latencias se recuperaron
  de los metadatos locales de la misma sesión.
- La calidad de los hallazgos y de la decisión no se evaluó durante la ejecución.
  Se evaluó después, en una tarea independiente, y quedó registrada más abajo.

## Auditoría cualitativa

Realizada después de la ejecución, como tarea separada. **No modifica la salida
bruta, los hashes ni la telemetría**: esta sección solo agrega el juicio sobre
hallazgos que arriba están transcritos tal como los emitió el reviewer.

Fuentes usadas para auditar: el Caso C congelado
`2587b3cfd3db9831386b6a04fbfa3807444fd458`, su `diff.patch`, la
`reviewer-policy.md` congelada, y para dos hallazgos la documentación oficial
del proveedor correspondiente. Sin fuentes secundarias.

### F1 — Publicación de review sin array `comments`

**Clasificación: `FALSO_POSITIVO_MATERIAL`.**

Verificado contra la documentación oficial de GitHub del endpoint *Create a
review for a pull request*:

- `body` es **Required when using `REQUEST_CHANGES` or `COMMENT` for the event
  parameter**;
- `event` admite `APPROVE`, `REQUEST_CHANGES` y `COMMENT`;
- `comments` es **opcional**, y sirve para comentarios de línea.

La documentación no exige `comments[]` para publicar `REQUEST_CHANGES` ni
`APPROVE`. La hipótesis que sostiene el hallazgo —que la API podría rechazar la
publicación o degradarla a `COMMENT`— queda **refutada**.

Lo que el reviewer hizo bien, y hay que decirlo: **no afirmó el hecho**. Lo dejó
en `NEEDS_EVIDENCE` con `origen_evidencia: NONE`, formuló una pregunta cerrada
correcta y pidió `OFFICIAL_DOCUMENTATION` señalando el endpoint exacto. El
protocolo funcionó: la incertidumbre se declaró en vez de inventarse.

Lo que se evalúa negativamente es distinto: **elevó a M2 una hipótesis que
resultó falsa**, y ese M2 fue el único de la corrida y el que sostiene la
decisión. Declarar impacto "si el hallazgo es cierto" es correcto por diseño,
pero acá el costo se materializó.

`DECISION_AFECTADA_POR_FALSO_POSITIVO_MATERIAL = SI`.

### F2 — Llamadas secundarias a `fetch` sin timeouts explícitos

**Clasificación: `CORRECTO_UTIL`.**

Verificado en el diff congelado: `kimiRequest()` usa `fetch` global para la
estimación de tokens, el listado de modelos y la ronda 2, mientras que
`kimiRound1Request()` implementa timeouts explícitos de conexión, headers y
body. La asimetría es real.

Existe un timeout global del job, así que el trabajo no queda colgado
indefinidamente. Pero la observación identifica una diferencia real en control
de transporte, cancelación y diagnóstico: un cuelgue en una llamada secundaria
no produce cancelación controlada ni un mensaje de timeout propio.

Severidad adecuada. **No corresponde elevarla por encima de M3.**

### F3 — Instalación global de `gemini-cli` redundante

**Clasificación: `CORRECTO_UTIL`.**

Verificado contra el `action.yml` oficial de `google-github-actions/run-gemini-cli`:
`gemini_cli_version` es *"The version of the Gemini CLI to install"*, con
`required: false` y default `latest`. La Action instala la CLI por su cuenta.

En el workflow congelado conviven un paso `npm install --global
@google/gemini-cli@0.54.4` y, más abajo, la Action con
`gemini_cli_version: '0.54.4'`. Hay instalación duplicada.

Precisión sobre el enunciado: **lo válido del hallazgo es la redundancia.** La
coletilla "no fijada por SHA" es secundaria y no debe leerse como si los
paquetes npm se fijaran normalmente por el mismo mecanismo de SHA que se usa
para las Actions de GitHub: son ecosistemas distintos y `@0.54.4` ya es una
versión exacta.

Matiz técnico que el hallazgo no menciona y que importa para actuar sobre él: la
instalación global **no es puramente sobrante**, porque el paso siguiente
—`gemini extensions install ... --ref dd1a10d2…`— necesita el binario `gemini`
en el PATH y corre antes de la Action. Quitar el `npm install` sin más rompería
ese paso. La corrección limpia pasa por usar el input `extensions` de la Action,
no por borrar la línea.

### F4 — Contenedor MCP de GitHub sin digest fijo

**Clasificación: `PARCIAL_SOBREDIMENSIONADO`.**

La parte técnica es cierta y se verifica en el diff:
`ghcr.io/github/github-mcp-server:v0.27.0` se referencia por tag y no por
digest inmutable. Un tag puede reapuntarse, así que fijar el digest sería una
mejora legítima de reproducibilidad de cadena de suministro.

Lo que se rebaja es la interpretación. El hallazgo apoya su fuerza en que el
cuerpo de la pull request afirma que "las Actions están fijadas por SHA", y de
ahí deduce una contradicción. No la hay: **una GitHub Action y una imagen de
contenedor son tipos de dependencia distintos**, con mecanismos de fijación
distintos. Que las Actions estén fijadas por SHA no implica ninguna promesa
sobre la imagen.

Se conserva la observación técnica; se descarta la contradicción alegada.

### F5 — El job `fallthrough` respondería a comentarios ordinarios

**Clasificación: `FALSO_POSITIVO`.**

Recorrido completo del `if` del job `dispatch` en el workflow congelado. Para los
eventos de comentario y review, la condición exige **las dos cosas a la vez**:

- `startsWith(github.event.comment.body || github.event.review.body,
  '@gemini-cli /review')`;
- `author_association` dentro de `["OWNER", "MEMBER", "COLLABORATOR"]`.

Un comentario ordinario que no empieza con esa invocación **no ejecuta
`dispatch`**. Al no ejecutarse `dispatch`, `fallthrough` queda `skipped` por
`needs` y nunca alcanza la rama `command == 'fallthrough'` del script.

La consecuencia descrita por el hallazgo —respuestas automáticas en
conversaciones ordinarias de la pull request— **no se produce** bajo las
compuertas reales del workflow congelado. La rama `else` del script es, en la
práctica, inalcanzable por esa vía.

Es exactamente el modo de error que la política gobernante advierte: el reviewer
razonó sobre el fragmento del script sin recorrer antes la compuerta que lo
precede. **No recorrió correctamente todas las compuertas previas.**

### F6 — Política gobernante duplicada en el prompt de ronda 1

**Clasificación: `CORRECTO_UTIL`.**

Verificado en el diff: el `policyText` completo aparece en el mensaje de sistema
de la ronda 1 y otra vez dentro del bloque auxiliar "Política gobernante" del
mensaje de usuario. La duplicación es real y consume contexto que podría
destinarse al diff o a la deliberación.

El mismo problema apareció en la corrida histórica de Open Platform.

## Resumen de la auditoría

| Clasificación | Cantidad | Hallazgos |
| --- | --- | --- |
| `CORRECTO_UTIL` | 3 | F2, F3, F6 |
| `PARCIAL_SOBREDIMENSIONADO` | 1 | F4 |
| `FALSO_POSITIVO` | 1 | F5 |
| `FALSO_POSITIVO_MATERIAL` | 1 | F1 |
| **Total** | **6** | |

No se calcula porcentaje global de precisión ni score agregado. Con una sola
corrida por vía, un número redondo daría una falsa sensación de medición.

## Calidad de la decisión

- Decisión preliminar emitida: `COMMENT`.
- ¿Afectada por un falso positivo material? **SÍ.**

F1 fue el **único** hallazgo de impacto M2 de la corrida, y es el que sostiene
la decisión: sin un M1 o M2 en juego, no habría motivo material para no aprobar.
Tras realizar la verificación que el propio reviewer pidió, ese hallazgo queda
refutado por la documentación oficial.

Lo que **no** se afirma, porque no es demostrable: qué decisión exacta habría
emitido el reviewer si nunca hubiese formulado F1. No se puede reconstruir su
deliberación interna a partir de la salida.

Lo que **sí** queda registrado: el único hallazgo material que sustentaba
`COMMENT` era falso.

## Comparación provisional con Open Platform Run 1

Coincidencias entre las dos ejecuciones sobre el mismo Caso C:

- el contenedor MCP sin digest apareció en las dos;
- la duplicación de la política en el prompt apareció en las dos.

Diferencias:

- Open Platform Run 1 emitió 8 hallazgos; Kimi Code membresía Run 1 emitió 6;
- cada ejecución produjo un falso positivo M2 material **distinto**;
- Kimi Code detectó además la falta de timeouts explícitos en las llamadas
  secundarias y la instalación redundante de Gemini CLI.

**No se concluye que una vía sea mejor que la otra.** Una corrida por vía no
alcanza para afirmar estabilidad, y las dos ejecuciones no son estrictamente
comparables entre sí.

## Señal a vigilar

`SEÑAL_A_VIGILAR` — no `PATRON_VALIDADO`.

En las dos ejecuciones completas de Kimi sobre el Caso C apareció un hallazgo M2
incorrecto que afectó la decisión, aunque los dos M2 fueron distintos entre sí.

Es una observación **provisional**. Todavía no se puede distinguir entre dos
explicaciones: que esos puntos del caso sean especialmente ambiguos, o que exista
una tendencia propia del reviewer a elevar hipótesis no verificadas a impacto
material. La comparación con reviewers distintos sobre el mismo caso congelado es
lo que puede separarlas.
