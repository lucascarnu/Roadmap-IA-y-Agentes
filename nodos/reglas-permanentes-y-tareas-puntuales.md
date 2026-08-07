---
estado: aprendido
prioridad: alta
estimacion: corta
categoria: agentes-de-desarrollo
depende_de: []
fuentes:
  - separacion-reglas-y-tareas
---

# Reglas permanentes y tareas puntuales

Trabajar con un agente mejora mucho cuando se separan dos cosas que suelen
mezclarse en el prompt: las reglas que valen siempre y la tarea que se pide hoy.
Las primeras van a un archivo; el prompt se queda solo con la segunda.

## Una fuente única y neutral

Las reglas permanentes viven en un solo archivo, `reglas.md`, escrito de forma
neutral: no se dirige a ningún agente en particular ni menciona una herramienta
concreta. Habla del trabajo, no del ejecutor.

Esa neutralidad es lo que permite que sirva para Claude Code, Codex o cualquier
otro sin reescribirla. Una regla redactada como "Claude debe..." obliga a
duplicarla el día que entra otra herramienta, y desde ese momento hay dos
versiones que se van separando.

## CLAUDE.md y AGENTS.md como adaptadores

Cada herramienta carga por convención un archivo con un nombre distinto: Claude
Code lee `CLAUDE.md`, Codex lee `AGENTS.md`. No se puede unificar en un solo
archivo porque ninguna de las dos encontraría el nombre de la otra.

La solución es que esos archivos sean adaptadores delgados: identifican al
destinatario y apuntan a `reglas.md`, sin contener reglas propias. Todo lo que
se escriba dentro de ellos se convierte en contenido que hay que mantener por
duplicado.

## El prompt lleva solo la tarea

Si las reglas ya están escritas, repetirlas en cada pedido no agrega nada y
genera un problema concreto: cuando la regla se refina en el archivo, la versión
que quedó en los prompts viejos deja de coincidir. Pasan a existir dos fuentes
que dicen cosas distintas, y no hay forma de saber cuál gana.

Un prompt bien formado describe la tarea puntual y nada más. Es más corto, más
fácil de revisar y no compite con el archivo de reglas.

## Consulta y ejecución

La distinción más útil de todas: revisar, analizar, verificar, explicar o
confirmar son tareas de solo lectura; crear, modificar o integrar son tareas de
ejecución.

Sin esa regla escrita, el modo de falla por defecto es que el agente "mejore"
archivos cuando solo se le pidió mirarlos, y hay que agregar "no modifiques
nada" a mano en cada consulta. Con la regla escrita, esa aclaración desaparece
del prompt porque ya está cubierta.

## Señal de que falta una regla

Un indicador práctico: **si te encontrás repitiendo la misma aclaración en
varios prompts, esa aclaración es una regla permanente que todavía no
escribiste.**

Funciona también en sentido inverso. A medida que las reglas se consolidan, los
prompts se acortan solos: dejan de tener cláusulas defensivas y quedan solo con
la tarea. La longitud del prompt es un termómetro de cuán completo está el
archivo de reglas.

## Origen

Este conocimiento surgió de la práctica durante la construcción de este mismo
repositorio: `reglas.md`, sus cuatro secciones y los adaptadores `CLAUDE.md` y
`AGENTS.md`. La conversación de trabajo en la que se definieron esos criterios
quedó registrada como fuente interna del sistema; no proviene de material externo
publicado.
