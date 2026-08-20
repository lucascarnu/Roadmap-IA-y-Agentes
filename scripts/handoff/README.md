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
- Claude Code, Codex y Kimi Code autenticados por las suscripciones autorizadas.
- El Issue inicial creado directamente por el Arquitecto / Lead.

No hay dependencias npm. El comando operativo es:

```powershell
node scripts/handoff/handoff.mjs poll
```

`poll` recupera huérfanos seguros, toma la unidad `handoff:ready` más antigua y
continúa hasta vaciar la cola o alcanzar `max_unidades_por_corrida`.

Al terminar cada pasada, el orquestador puede enviar notificaciones push por
ntfy cuando queda una unidad `handoff:ready`, una unidad termina en un estado de
fallo o se completa una cadena sin siguiente destinatario. El topic se configura
fuera del repositorio mediante `ROADMAP_NTFY_TOPIC` o la propiedad `topic` de
`scripts/handoff/notify.local.json`, que está ignorado por Git. La base puede
sobrescribirse con `ROADMAP_NTFY_BASE_URL`; por defecto usa `https://ntfy.sh`.
Estas variables las lee el orquestador y no se agregan al entorno permitido de
los procesos hijos.
Si no hay topic, ntfy queda desactivado. Un timeout, error de red o respuesta no
exitosa se registra pero no cambia el resultado ni el código de salida de `poll`.

## Bootstrap de labels

Las labels se crean o normalizan de forma idempotente con:

```powershell
node scripts/handoff/handoff.mjs setup-labels
```

El bootstrap separado debe ejecutarse antes de que el Arquitecto cree el primer
Issue ya marcado `handoff:ready`.

Estados de tránsito:

- `handoff:waiting`
- `handoff:ready`
- `handoff:running`
- `handoff:done`

Fallos cerrados:

- `handoff:failed`
- `handoff:stale`
- `handoff:blocked`
- `handoff:blocked-via`

## Espera durable y `tick`

Una unidad que espera una condición externa conserva su contrato normal, cambia
a `handoff:waiting` y recibe exactamente un comentario con este marcador:

```text
<!-- handoff-wait:<issue>:<head_sha> -->
```

El Arquitecto / Lead u operador que pone la unidad en espera aplica la label y
publica ese comentario. `tick` consume el estado; ni `tick` ni `poll` lo crean.

El marcador va seguido por un único bloque `json` con
`handoff_wait_version`, `condicion`, `parametros`, `intervalo_segundos`,
`max_intentos` y `blocked_since`, sin campos adicionales. Las condiciones
admitidas forman un registro cerrado:

- `tiempo`, con `parametros: {}`;
- `check_run`, con `parametros: { "pr": <entero>, "nombre": "<check exacto>" }`.

Los datos mutables no se duplican en GitHub: `intentos`, `next_check_at`,
`ultimo_error` y el flag de aviso prolongado reutilizan el `state.json` local de
cada Issue. Si el archivo todavía no existe, `next_check_at` se inicializa como
`blocked_since + intervalo_segundos`.

```powershell
node scripts/handoff/handoff.mjs tick
```

`tick` toma el mismo `poll.lock`, recorre `handoff:waiting` por antigüedad y no
invoca agentes. Omite checks futuros; para un check no satisfecho incrementa los
intentos y aplica `intervalo_segundos × 2^(intentos-1)`, con techo de una hora.
Un descriptor inválido o desconocido falla cerrado en `handoff:blocked`. Cuando
se supera `max_intentos`, también bloquea y pide intervención humana.

Si una condición se cumple, `tick` registra una única transición a
`handoff:ready`, libera el lock y recién entonces delega en el `poll()` existente.
En pasadas posteriores también delega en `poll` cuando encuentra al menos una
unidad rescatable: debe tener el label `handoff:ready` y su `state.json` local
debe declarar `phase: "ready"`, marca que sólo escribe una promoción de `tick`.
Por diseño, una unidad etiquetada `handoff:ready` a mano no es despachada sola
por el scheduler. Sin promociones ni unidades rescatables termina con
`poll: null`, por lo que no despierta ningún LLM.

Si se borra el directorio de estado local, el scheduler pierde esa prueba de
procedencia y el rescate degrada al comportamiento anterior: la unidad espera un
`poll` manual, con aviso `ready_pending`, sin ejecución indebida. Una unidad
promovida que el `poll` inmediato no procesa se rescata como máximo en la pasada
siguiente, es decir, dentro de un intervalo de planificación. `transitions.log`
registra `scheduler_retry_dispatch` al reintentar el despacho y
`poll_no_proceso_promocion` cuando el `poll` inmediato no cubre una promoción.
La salida es `{ "status", "promovidas", "poll" }`; un lock vivo devuelve
`status: "locked"` y un fallo no controlado conserva `FAIL_CLOSED` y exit code 1.
Los eventos `resumed`, `dispatch_gap`, `blocked_long`, `wait_check_error`,
`fallback_available`, `terminal_error` y `needs_human` reutilizan el notifier ntfy
tolerante a fallos. Una entrada de agente en `config.json` puede declarar
`authorized_fallback_via`: es estado explícito para notificar una contingencia
autorizada, no una orden de routing ni una credencial. Si una unidad termina
`blocked-via` con ese campo, el notifier emite `fallback_available` con prioridad
informativa y no emite `needs_human`; sin ese campo conserva la escalación
terminal y pide intervención.

## Windows Task Scheduler (procedimiento PRE-MVP)

La semántica de estas opciones está **DOCUMENTADA** por Microsoft y su
trazabilidad vive en
[la fuente registrada](../../fuentes/documentacion-task-scheduler-windows.md).
El alta todavía no se ejecuta ni se presenta como validada operativamente.

En Task Scheduler, crear una sola tarea bajo la cuenta del usuario que posee las
sesiones OAuth de `gh` y de los CLIs, con **Run only when user is logged on**; no
usar `SYSTEM`. Configurar:

1. un trigger temporal que repita la tarea cada 15 minutos durante la duración
   configurada para la fase PRE-MVP;
2. un trigger adicional **At log on** para ese mismo usuario;
3. **Run task as soon as possible after a scheduled start is missed**;
4. **If the task is already running: Do not start a new instance**;
5. una acción que ejecute `cmd.exe`, con el directorio raíz absoluto del
   repositorio en **Start in** y estos argumentos:

   ```text
   /d /s /c "node scripts/handoff/handoff.mjs tick >> scripts\handoff\.handoff\tick.log 2>&1"
   ```

Antes de registrar o ejecutar esa acción, crear una vez el directorio local
ignorado con `New-Item -ItemType Directory -Force scripts/handoff/.handoff`; `cmd`
resuelve la redirección antes de iniciar Node. La redirección conserva
stdout/stderr en un archivo local ignorado. El resultado
de la última ejecución y la definición efectiva se inspeccionan desde Task
Scheduler o con `schtasks /query /tn <NOMBRE> /fo LIST /v`; no se oculta el exit
code del comando. Antes de aceptar el mecanismo hay que ejecutar el QA con
reinicio definido por la unidad: cerrar agentes y terminales, reiniciar, no abrir
agentes, observar el tick antes y después del vencimiento y comprobar promoción,
`poll`, ausencia de duplicados, evidencia en GitHub y ntfy.

Hasta completar ese QA independiente, el registro real, el contexto OAuth tras
reinicio y el circuito Task Scheduler → `tick` → `poll` quedan
**NO VALIDADOS OPERATIVAMENTE**.

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

Para una unidad de review, `base_sha` puede declarar el commit base con 40
hexadecimales. El bridge calcula `diff.patch` entre esa base y `head_sha`, lo
incluye en el paquete congelado y lo cubre con el manifiesto y el fingerprint.
Si se omite, el paquete conserva el comportamiento anterior.

`contexto_autorizado` debe incluir el punto de entrada del destinatario
(`AGENTS.md` para Codex o `CLAUDE.md` para Claude), `reglas.md`, `0009`,
`equipo.md`, `decisiones/README.md` y `pendientes.md`. El schema y el bridge
exigen ese canon antes de inferencia; las decisiones y archivos específicos de la
tarea se agregan a ese mínimo. Al crear un segundo relevo, el bridge conserva el
contexto y agrega de forma determinista el adaptador del nuevo destinatario.
Cuando el destinatario es Kimi como reviewer, su adaptador obligatorio es
`reviewer-policy.md`.

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

La salida cruda completa se persiste inmediatamente después de terminar el
proceso externo y antes de intentar parsear el JSON. A continuación se escriben
`invocation-receipt.json` —proveedor, modelo solicitado, duración, exit code y
uso observable— y `via-observada.json`. Recién después se parsea, se valida
contra el esquema efectivo y se aplican las reglas semánticas. Un JSON inválido,
recortado o excesivo conserva esos tres artefactos, falla de forma terminal y no
se trunca, repara ni reintenta automáticamente. Sólo un resultado válido puede
publicarse.

`via-observada.json` demuestra la ruta autenticada observada después de la
invocación. Por sí sola no prueba facturación ni consumo efectivo, salvo que la
telemetría recibida los exponga.

El resultado validado se persiste antes de publicar. La publicación usa:

```text
<!-- handoff:<issue>:<head_sha>:<input_fingerprint> -->
```

Si GitHub falla después de la inferencia, la recuperación reutiliza el JSON
persistido y busca el marcador antes de comentar. No vuelve a consumir inferencia
ni duplica un resultado.

`RESULT_LIMITS` es la única fuente numérica de los límites de salida y
`RESULT_SAFETY_RATIO` deriva también el porcentaje textual del objetivo de
seguridad: no hay un `75 %` duplicado en el template ni en la instrucción final.
`materializeResultSchema` aplica esos valores al schema base —que no duplica
máximos— y produce el schema efectivo con `maxLength`, `maxItems` y
`uniqueItems`. El mismo resultado materializado viaja en el paquete y su
manifiesto, aparece completo en el prompt, integra el agent file de Kimi y
gobierna siempre la validación local posterior. La recuperación rematerializa
ese schema desde `manifest.result_limits`, es decir, desde los límites congelados
de la corrida y no desde los globales que pudieran existir al recuperarla.

El schema de wire se proyecta separadamente mediante una tabla declarada por
proveedor. Claude recibe por `--json-schema` una copia sin `maxLength`,
`maxItems` ni `uniqueItems`; Codex recibe por `--output-schema` una copia que
conserva `maxItems` pero no `maxLength` ni `uniqueItems`; Kimi no recibe schema
de wire porque su CLI no ofrece ese flag. Toda restricción removida se incorpora
a la `description` de su campo. La proyección elimina además `$schema`, conserva
todos los objetos cerrados con `additionalProperties: false` y se valida contra
un subconjunto específico del proveedor antes de invocar el cliente.

Esta tabla está **DOCUMENTADA** a nivel de API por las guías oficiales de
[Structured Outputs de Anthropic](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
y [Structured Outputs de OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs).
Su comportamiento exacto dentro de cada CLI permanece **NO_VERIFICADO**: los
clientes podrían transformar el schema antes de enviarlo. La proyección es
defensiva y no reemplaza ni debilita la validación local contra el schema
efectivo completo.

El prompt congelado incluye ese esquema efectivo, reglas explícitas para sus
claves y enums, los límites generados y un ejemplo mínimo válido adaptado al
destinatario y al HEAD. La instrucción final de Kimi vuelve a colocar los límites
junto al pedido de salida, declara que excederlos invalida toda la inferencia,
fija un objetivo de seguridad del 75 % para campos extensos y separa síntesis de
evidencia breve.

Los flags estructurados de Claude y Codex pueden fortalecer esas vías. Kimi Code
CLI no recibe un output schema equivalente: para Kimi el esquema y los límites
siguen siendo instrucciones textuales, no enforcement demostrado. Esta
materialización no habría evitado por sí sola el exceso observado en Issue #117,
porque Kimi ya había recibido los límites correctos; elimina deriva y mejora
consistencia, pero no corrige causalmente la falta de enforcement durante su
generación.

La salida solicitada es JSON crudo, aunque el transporte de Kimi tolera como red
de compatibilidad un único bloque completo etiquetado `json`. Si el agente no
puede observar su modelo o esfuerzo efectivo usa `NO_OBSERVABLE`; la telemetría
del puente, cuando existe, es la fuente autoritativa y la firma del agente no la
reemplaza.

El orden del cierre también es fail-closed: la vía posterior se verifica antes
de validar el JSON y sus límites. Por eso una misma respuesta con vía posterior
inválida y formato inválido termina `handoff:blocked-via`, no `handoff:failed`.
La prueba textual histórica `G4.12` sólo **DOCUMENTA** el orden del código; las
pruebas conductuales comprueban separadamente que un fallo de parseo o un exceso
de límites no publican comentarios.

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
- Kimi: `kimi provider list --json` debe exponer `managed:kimi-code`, su referencia
  OAuth y el alias configurado; cualquier endpoint directo o una vía no
  demostrable queda bloqueada.

En Windows, si el nombre configurado no tiene extensión y el sistema no lo
encuentra, el runner hace un único segundo intento mediante
`%COMSPEC% /d /s /c <launcher.cmd + argumentos>` (`cmd.exe` como respaldo). El
intérprete se ejecuta explícitamente con `shell: false`; en otras plataformas no
aplica ese fallback.

Una vía distinta, indeterminable o un cliente que no pueda exponerla termina en
`handoff:blocked-via`; no publica resultado válido. La mera presencia o ausencia
de una API key nunca decide la vía.

Kimi se inicia siempre con `--model kimi-code/k3-256k`, esfuerzo `high` fijado
por el switch oficial de runtime y un agent file sin herramientas. El prompt
congelado vive en ese agent file para evitar límites de longitud del argv; la
invocación usa una sesión nueva, no reanuda sesiones y reemplaza los directorios
de skills por uno vacío. Kimi Code CLI 0.34.0 no ofrece un flag equivalente a
`--no-session-persistence`: conserva su traza diagnóstica local por diseño, pero
el bridge nunca la reutiliza como contexto de otra corrida.

**DOCUMENTADO:** la [documentación oficial de agentes de Kimi
Code](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/agents)
indica actualmente que `--agent-file` bajo `kimi -p` requiere el motor v2
habilitado mediante `KIMI_CODE_EXPERIMENTAL_FLAG=1`.

**PROBADO LOCALMENTE:** una sonda controlada de CLI 0.34.0 confirmó que
`tools: []` produce un snapshot de cero herramientas, `toolSelect=false` y sólo
eventos `meta`/`assistant` en `stream-json`. Si apareciera un evento de
herramienta, el parser lo rechaza antes de aceptar el resultado. La misma versión
ejecutó `--agent-file` y `--skills-dir` sin `KIMI_CODE_EXPERIMENTAL_FLAG` en las
sondas y corridas reales registradas. El bridge conserva esa configuración para
0.34.0 y no habilita globalmente el conjunto de funciones experimentales.

### Sonda local de Kimi (2026-08-13)

La implementación se decidió después de una inferencia mínima real desde este
repositorio, sin variables `KIMI_*` ambientales ni Open Platform:

- CLI `0.34.0`; modo no interactivo `kimi --model <alias> --prompt <texto>
  --output-format stream-json`;
- `provider list --json` informó el proveedor gestionado `managed:kimi-code`,
  OAuth en almacenamiento local y el endpoint de membresía;
- exit code `0` y respuesta real de Assistant; los fallos pre-inferencia
  observados usan exit code `1`;
- el request trace de la sonda registró modelo `k3-256k`, alias
  `kimi-code/k3-256k`, `thinkingEffort=high` y `toolSelect=false`;
- no existen flags `--output-schema` ni `--json-schema`; el bridge pide JSON y
  aplica después el mismo `validateResult` fail-closed;
- cuota y reset no son observables por esa interfaz sin forzar agotamiento, por
  lo que no se intentó agotarla.

## Recuperación y exclusión

Un lock de proceso evita dos polls concurrentes y un lock por Issue impide dos
reclamos locales. Ambos se crean con `mkdir`, que es atómico. Un `running` cuyo
PID local ya no existe se recupera una vez. Si vuelve a quedar huérfano antes de
persistir resultado, termina `handoff:blocked`.

## U1A: contrato v2 y validación pura

`handoff-contract-v2.mjs`, `handoff-v2.schema.json`,
`handoff-result-v2.schema.json` y `actores.json` representan el contrato v2 y
validan sus invariantes sin ejecutar el contrato. El módulo recibe por inyección
el registro de actores, la resolución de referencias canónicas y la resolución
de evidencia; no lee archivos, no consulta Git o GitHub, no invoca agentes y no
está importado por `poll`, `tick`, `processIssue` ni `invokeAgent`.

La validación cubre versión, canon gobernante, roles, adapters, capacidades,
modos, mutaciones declaradas, objetos de entrada y salida, economía, reintentos,
delegaciones humanas, estado canónico, evidencia, decisiones, transiciones y
firma. Los valores `acumulado_observable` y `remanente` no son autoritativos en
el contrato: el gasto histórico y el remanente deberán provenir del ledger
durable del futuro runtime U1B.

El resultado separa `resumen`, narrativo, de `decision`, mecánico. El vocabulario
nuevo es `SIN_OBJECIONES`, `OBJECION_MATERIAL`, `REQUIERE_ARBITRAJE`,
`BLOQUEADO_POR_LIMITE` y `BLOQUEADO_POR_GATE`. Sus conceptos se anclan en
[Intervención crítica del agente](../../reglas.md#intervencion-critica-del-agente),
[Autoridad y escalación](../../decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md#autoridad-y-escalacion),
[Servicios fuera del camino crítico](../../decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md#servicios-fuera-del-camino-critico)
y [Cuándo sí se escala al Director](../../decisiones/0013-delegar-cierre-operativo-y-merge-rutinario.md#cuando-si-se-escala-al-director).
Las delegaciones humanas usan las ocho categorías cerradas de `0013` y la
acción física documentada en `pendientes.md`; una referencia inexistente, una
categoría incompatible o una operación rutinaria delegada fallan cerradas.

`actores.json` sólo declara el confinamiento conocido. Ningún actor actual tiene
confinamiento `PROBADO_LOCALMENTE`; por eso el validador puro rechaza
`modo: ejecucion` para todos ellos. Probar o configurar el confinamiento real
pertenece a U5. U1A no implementa locks, ledger, efectos, recuperación ni un
runtime v2, y ninguna de sus pruebas demuestra autonomía.

Los schemas y artefactos históricos v1 permanecen legibles y el camino
operativo v1 continúa temporalmente sin cambios. Leer un artefacto histórico no
lo migra ni lo reinterpreta como v2; el validador v2 rechaza explícitamente
`handoff_version: "1"`.

> El contrato v2 y sus invariantes son representables y están validados determinísticamente; no existe todavía un runtime autónomo habilitado para ejecutarlo.

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
de dos relevos, recuperación y reintento único, doble worker sin procesos hijos, HEAD movido,
contrato inválido, salida inválida, profundidad excedida y vía no demostrable.

Pasar estos tests demuestra la lógica local. No demuestra una nueva cadena real:
para validar operativamente una combinación de destinatarios siguen siendo
obligatorios el Issue inicial auténtico del Arquitecto y una corrida completa de
los CLIs involucrados.
