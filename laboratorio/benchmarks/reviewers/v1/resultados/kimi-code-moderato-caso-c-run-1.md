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
- Resultado cualitativo: **NO AUDITADO**.

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
- Auditoría de la decisión: **PENDIENTE**.
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
- La calidad de los hallazgos y de la decisión no se evaluó en esta tarea.
