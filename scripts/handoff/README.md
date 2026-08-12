# Puente local KISS de handoffs

Experimento de [0012](../../decisiones/0012-handoffs-estructurados-y-ejecucion-local-por-suscripcion.md)
para transportar una unidad entre roles sin que el Director copie prompts,
contexto, HEAD, resultados ni el destinatario siguiente.

GitHub Issues es el bus. El proceso local hace una sola pasada, drena como máximo
tres unidades y admite como máximo dos relevos. No es un daemon, no usa Actions,
no introduce APIs PAYG y no participa del pipeline interno de reviewers de `0010`.

## Requisitos

- Node.js 20 o posterior.
- `git` y `gh` autenticado para `lucascarnu/Roadmap-IA-y-Agentes`.
- Claude Code y Codex autenticados por las suscripciones autorizadas.
- El Issue inicial creado directamente por el Arquitecto / Lead.

No hay dependencias npm. El comando operativo es:

```powershell
node scripts/handoff/handoff.mjs poll
```

`poll` recupera huérfanos seguros, toma la unidad `handoff:ready` más antigua y
continúa hasta vaciar la cola o alcanzar `max_unidades_por_corrida`.

## Bootstrap de labels

Las labels se crean o normalizan de forma idempotente con:

```powershell
node scripts/handoff/handoff.mjs setup-labels
```

El bootstrap separado debe ejecutarse antes de que el Arquitecto cree el primer
Issue ya marcado `handoff:ready`.

Estados de tránsito:

- `handoff:ready`
- `handoff:running`
- `handoff:done`

Fallos cerrados:

- `handoff:failed`
- `handoff:stale`
- `handoff:blocked`
- `handoff:blocked-via`

## Contrato del Issue inicial

El cuerpo contiene un único bloque JSON conforme a `handoff.schema.json`. El
Arquitecto debe producir el Issue inicial; el Ejecutor no puede fabricarlo en su
nombre. Ejemplo para la tarea acordada:

```json
{
  "handoff_version": "1",
  "tarea": "Auditar si sigue vigente, tras la integración de 0013, el pendiente que pide definir criterios objetivos de integración automática por clase de riesgo.",
  "destinatario": "codex",
  "head_sha": "SHA_COMPLETO_DE_MAIN",
  "head_ref": "main",
  "contexto_autorizado": [
    "AGENTS.md",
    "reglas.md",
    "decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md",
    "equipo.md",
    "decisiones/README.md",
    "pendientes.md",
    "decisiones/0013-delegar-cierre-operativo-y-merge-rutinario.md"
  ],
  "resultado_previo": null,
  "origen": {
    "tipo": "agente",
    "ejecutor": "claude",
    "rol": "arquitecto",
    "modelo": "MODELO_CONFIGURADO_POR_CLAUDE",
    "esfuerzo": "ESFUERZO_CONFIGURADO_POR_CLAUDE",
    "issue_origen": null
  },
  "salida_requerida": "Estado, veredicto, resumen, evidencia, archivos leídos, acción recomendada, siguiente_destinatario=claude y firma.",
  "modo": "solo_lectura",
  "profundidad_cadena": 1
}
```

`head_ref` amplía el mínimo de `0012` porque un SHA aislado permite demostrar que
el commit existe, pero no detectar que la referencia remota se movió durante la
corrida. Si se omite, usa `main`.

`contexto_autorizado` debe incluir el punto de entrada del destinatario
(`AGENTS.md` para Codex o `CLAUDE.md` para Claude), `reglas.md`, `0009`,
`equipo.md`, `decisiones/README.md` y `pendientes.md`. El schema y el bridge
exigen ese canon antes de inferencia; las decisiones y archivos específicos de la
tarea se agregan a ese mínimo. Al crear un segundo relevo, el bridge conserva el
contexto y agrega de forma determinista el adaptador del nuevo destinatario.

`origen` registra la firma de apertura producida por el Arquitecto. En el primer
Issue debe declarar Claude/Arquitecto y modelo/esfuerzo concretos; en el segundo
Issue lo completa el puente con el número del Issue anterior. Como ambos agentes
usan la misma identidad GitHub, es trazabilidad estructural, no autenticación
criptográfica, y debe auditarse junto con el registro de creación del Issue.

## Congelado e idempotencia

El puente no lee el contexto autorizado desde el working tree. Por cada path usa
`git show <head_sha>:<path>`, guarda el paquete y calcula:

- SHA-256 y bytes de cada bloque;
- hash del prompt;
- `input_fingerprint` del manifiesto completo.

El resultado validado se persiste antes de publicar. La publicación usa:

```text
<!-- handoff:<issue>:<head_sha>:<input_fingerprint> -->
```

Si GitHub falla después de la inferencia, la recuperación reutiliza el JSON
persistido y busca el marcador antes de comentar. No vuelve a consumir inferencia
ni duplica un resultado.

Cuando el resultado indica `siguiente_destinatario`, el puente crea el segundo
Issue con un puntero verificable al comentario anterior y continúa procesándolo
en la misma corrida. En profundidad 2 se exige `siguiente_destinatario=null`.

## Vía y entorno explícitos

Los procesos hijos reciben una allowlist de variables del sistema. No heredan
automáticamente `*_API_KEY`, `*_AUTH_TOKEN`, `*_BASE_URL` ni configuraciones de
Bedrock, Vertex o Foundry.

La vía se observa antes y después de inferencia mediante el propio cliente:

- Claude: `claude auth status --json` debe informar `claude.ai`, `firstParty` y
  una suscripción.
- Codex: `codex login status` debe informar una sesión ChatGPT.

Una vía distinta, indeterminable o un cliente que no pueda exponerla termina en
`handoff:blocked-via`; no publica resultado válido. La mera presencia o ausencia
de una API key nunca decide la vía.

## Recuperación y exclusión

Un lock de proceso evita dos polls concurrentes y un lock por Issue impide dos
reclamos locales. Ambos se crean con `mkdir`, que es atómico. Un `running` cuyo
PID local ya no existe se recupera una vez. Si vuelve a quedar huérfano antes de
persistir resultado, termina `handoff:blocked`.

## Evidencia local

Los artefactos no se versionan y viven en:

- `scripts/handoff/artifacts/`
- `scripts/handoff/.handoff/`

Incluyen manifiesto, contexto congelado, prompt y hash, salida cruda, resultado
validado, vía observada, telemetría, transiciones y errores. No deben contener
secretos de sesión.

## Pruebas deterministas

```powershell
node --test scripts/handoff/handoff.test.mjs
```

La batería no usa modelos ni GitHub. Cubre contrato/salida, canon gobernante
obligatorio antes de inferencia, contexto específico adicional, una cadena feliz
de dos relevos, recuperación y reintento único, doble proceso, HEAD movido,
contrato inválido, salida inválida, profundidad excedida y vía no demostrable.

Pasar estos tests demuestra la lógica local. No demuestra el experimento real:
para `HANDOFF_AUTOMATICO_PROBADO_LOCALMENTE` siguen siendo obligatorios el Issue
inicial auténtico del Arquitecto y una corrida real completa de ambos CLIs.
