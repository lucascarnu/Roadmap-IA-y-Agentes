---
formato: conversacion
plataforma: chatgpt
origen: "Proyecto Roadmap skills plugins etc — conversación del 2026-08-06 sobre reglas permanentes y tareas puntuales"
autor: Lucas y ChatGPT
categoria: agentes-de-desarrollo
clasificacion: oro
---

# Separación entre reglas permanentes y tareas puntuales

Conversación de trabajo en la que se definió cómo repartir las instrucciones
entre archivos permanentes y prompts, y de dónde salió la estructura de reglas
que hoy rige el proyecto.

## Síntesis

Cuatro definiciones concretas:

- **`reglas.md` como fuente neutral.** Un único archivo con las reglas que valen
  siempre, redactado sin dirigirse a ningún agente ni herramienta en particular.
- **`CLAUDE.md` y `AGENTS.md` como adaptadores.** Cada herramienta carga por
  convención un archivo con nombre distinto, así que esos dos identifican al
  destinatario y apuntan a `reglas.md` sin contener reglas propias.
- **Reglas permanentes separadas de tareas puntuales.** Lo que vale siempre va
  al archivo; el prompt se queda solo con el pedido del momento.
- **Consulta distinta de ejecución.** Revisar, analizar, verificar o explicar son
  operaciones de solo lectura; crear, modificar o integrar son de ejecución.

## Por qué oro

No aportó información sino criterios, y los criterios se aplicaron de inmediato
y siguen vigentes. Las cuatro definiciones se convirtieron en la sección
"Alcance y autorización de cambios" de `reglas.md`, y los adaptadores `CLAUDE.md`
y `AGENTS.md` tienen la forma que tienen por esta conversación.

Se validó además en la práctica: antes de escribir la regla había que aclarar
"no modifiques nada" en cada pedido de revisión; después dejó de hacer falta. Es
material al que se vuelve cada vez que haya que decidir dónde vive una regla
nueva.

## Conocimiento extraído

Las cuatro definiciones se incorporaron al sistema ya procesadas, junto con dos
cosas que la conversación dejó implícitas: por qué repetir instrucciones produce
versiones divergentes, y la señal práctica de que una aclaración repetida en
varios prompts es una regla permanente todavía no escrita.

Acá queda solo el origen: cuándo, con quién y en qué contexto se decidió cada
cosa.

## Trazabilidad

*Sección agregada el 2026-08-08 por la ampliación de trazabilidad de `0002`. La
fuente se capturó antes de que esa exigencia existiera.*

- **Fecha de consulta:** 2026-08-06, el mismo día de la conversación.
- **Versión o contexto:** no aplica. Es una conversación de trabajo cerrada, sin
  versión ni edición posterior.
- **Qué sustenta:** el nodo
  [reglas-permanentes-y-tareas-puntuales](../nodos/reglas-permanentes-y-tareas-puntuales.md)
  y, a través de él, la estructura de `reglas.md` como archivo neutral y la de
  `CLAUDE.md` y `AGENTS.md` como adaptadores delgados.
- **Condición de revalidación:** ninguna por antigüedad. Una conversación no
  envejece ni cambia sola. Habría que revisarla solo si la práctica contradijera
  alguno de sus criterios, y en ese caso lo que se revisa es el criterio, no la
  fuente.
