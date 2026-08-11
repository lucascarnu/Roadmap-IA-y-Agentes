# 0012 — Handoffs estructurados y ejecución local por suscripción

- **Estado:** aceptada
- **Fecha:** 2026-08-10

## Contexto y problema

El pipeline de reviewers definido en `0010` ya está implementado para cubrir el
tramo interno `principal → shadow → fusión determinista → resultado`, con su
lógica determinista **PROBADA LOCALMENTE** y su integración real todavía sin
validar. El circuito completo de desarrollo asistido aún depende de que el
director transporte contexto y resultados entre agentes.

El flujo real que falta automatizar es más amplio:

`Arquitecto / Lead → Ejecutor → pull request → Reviewer → corrección → re-review → cierre`.

Ese transporte manual tiene dos costos: consume tiempo del director y aumenta el
riesgo de pegar una instrucción en el agente equivocado, perder contexto o dejar
fuera evidencia relevante. Sin embargo, reemplazarlo por conversación libre entre
modelos introduciría un problema peor: estado implícito, difícil de auditar y fácil
de contaminar.

A la vez, `0011` fija que el proyecto prioriza las suscripciones ya pagadas antes
que APIs PAYG. Por eso la automatización del handoff no debe asumir que la
inferencia ocurrirá en servicios cloud por API.

## Decisión

### GitHub sigue siendo el bus y la fuente de verdad

El estado de trabajo no vive en mensajes privados entre agentes. Vive en objetos
auditablemente accesibles desde GitHub: ramas, commits, pull requests, reviews,
checks y artefactos estructurados.

Cada handoff debe poder reconstruirse sin depender de una conversación previa.
Como mínimo, el trabajo transferido debe identificar:

- tarea o unidad de trabajo;
- HEAD objetivo;
- rol destinatario;
- contexto autorizado;
- resultado previo relevante;
- salida requerida;
- estado del trabajo.

No se crea una base de datos, cola ni servicio de mensajería adicional mientras
GitHub alcance para representar ese estado.

### No hay chat libre entre agentes

Los agentes no se hacen preguntas abiertas entre sí ni mantienen una conversación
persistente. Cada transición es un handoff estructurado con entrada y salida
acotadas.

La coordinación de orden, espera, triggers, validaciones, hashes y cambios de
estado debe ser determinista siempre que sea posible. Un modelo sólo se invoca
cuando la tarea requiere razonamiento, revisión o modificación real.

### Separar coordinación de inferencia

Que GitHub indique que una etapa terminó y habilite la siguiente no requiere
consumir tokens de Claude, Codex ni otro modelo. La inferencia paga empieza sólo
cuando un modelo procesa contexto o produce trabajo.

Esta separación es obligatoria para evaluar costo correctamente y para evitar que
la comodidad de una implementación cloud convierta coordinación simple en gasto
PAYG.

### Suscripción primero también para la automatización

La primera vía a evaluar para Claude Code y Codex es usar sus CLIs autenticados
con las suscripciones existentes del director.

La arquitectura objetivo a probar es:

`GitHub (estado/orquestación) ↔ ejecución local (Claude Code / Codex por suscripción)`.

No se configura `ANTHROPIC_API_KEY` ni `OPENAI_API_KEY` como solución por defecto.
Una API PAYG sólo entra si cumple `0011`.

### Experimento KISS antes de construir infraestructura

Antes de implementar un orquestador propio completo se comparan dos alternativas
mínimas:

1. **Puente local pequeño.** Un proceso local detecta trabajo pendiente en
   GitHub, ejecuta el CLI correspondiente con la sesión ya autenticada y devuelve
   el resultado estructurado a GitHub.
2. **Framework existente.** Evaluar OpenHands u otra herramienta equivalente sólo
   si puede reutilizar de forma razonable los CLIs/sesiones locales y reducir
   código propio sin forzar API PAYG ni agregar infraestructura difícil de
   mantener.

No se migra a GitLab ni se monta un GitHub Actions self-hosted runner por defecto.
Ambas opciones amplían superficie operativa y de seguridad, y sólo se justifican
si el experimento mínimo demuestra una necesidad concreta que GitHub + puente
local no resuelven.

### Automatización incremental

El circuito se automatiza en este orden, sin construir todo de una vez:

1. detectar una unidad de trabajo pendiente y asignada;
2. ejecutar el agente destinatario;
3. registrar resultado y HEAD exacto;
4. disparar reviewer cuando corresponda;
5. ante `REQUEST_CHANGES`, devolver un handoff estructurado al ejecutor;
6. tras una corrección material, re-review sobre el nuevo HEAD;
7. cuando la evidencia permita integrar, dejar el trabajo listo para cierre.

`0010` conserva autoridad exclusiva sobre el tramo interno del reviewer principal
y shadow. Este protocolo no duplica ni reimplementa esa lógica.

## Intervención humana

El objetivo es eliminar transporte rutinario, no eliminar al director.

Se escala a una persona cuando hay elección de producto o alcance, gasto nuevo,
credenciales, privacidad, seguridad, irreversibilidad, evidencia insuficiente o
una preferencia que no pueda resolverse por reglas ya documentadas.

Una intervención manual simple es preferible a agregar infraestructura recurrente
sólo para eliminar un paso ocasional.

## Criterios de aceptación del experimento local

La alternativa elegida debe demostrar, en una tarea real pequeña:

- ejecución de al menos uno de los CLIs usando la suscripción existente y sin API
  PAYG;
- identificación inequívoca de destinatario y HEAD;
- input reconstruible y acotado;
- resultado estructurado devuelto a GitHub;
- ausencia de secretos de sesión persistidos en el repositorio;
- recuperación segura ante caída del proceso local;
- complejidad operativa suficientemente baja para un proyecto personal.

Si ninguna alternativa cumple esto sin complejidad desproporcionada, se conserva
el handoff manual como fallback y recién entonces se reevalúa API PAYG según
`0011`.

## Qué no decide todavía

Esta decisión no elige OpenHands, no especifica un daemon, no define polling ni
webhooks, no adopta GitLab y no convierte la PC del director en runner
self-hosted.

Tampoco modifica la aplicación del MVP. Todo este mecanismo pertenece al proceso
de desarrollo y debe poder retirarse sin tocar `app/`.

## Relación con decisiones existentes

- `0009` define los roles, autoridades y la independencia entre ellos.
- `0010` define el pipeline principal + shadow dentro del rol Reviewer.
- `0011` fija suscripciones primero y API PAYG sólo con justificación explícita.
- `0012` define cómo transportar trabajo entre roles sin conversación libre y qué
  arquitectura mínima evaluar para ejecutar agentes locales por suscripción.
