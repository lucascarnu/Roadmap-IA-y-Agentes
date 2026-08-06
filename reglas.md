# Reglas de Trabajo

Define cómo trabajamos paso a paso, sin saltar etapas ni agregar complejidad innecesaria.

## Alcance y autorización de cambios

- Distinguir entre tareas de consulta y tareas de ejecución.
- Las solicitudes de revisar, analizar, inspeccionar, verificar, explicar o confirmar son de solo lectura.
- En tareas de solo lectura, no modificar archivos, estructura, configuración ni Git.
- Solo realizar cambios persistentes cuando la tarea los solicite explícitamente.
- No ampliar el alcance por iniciativa propia.
- Crear la rama temporal de una tarea de ejecución no cuenta como ampliar el alcance ni requiere autorización adicional: es parte del flujo normal definido en [Estrategia de ramas](#estrategia-de-ramas).
- Si una ambigüedad pudiera producir cambios no solicitados, preguntar antes de actuar.

## Estrategia de ramas

- `main` contiene únicamente trabajo revisado y aceptado.
- Solo se trabaja directamente en `main` cuando el usuario lo autorice de forma explícita.
- Toda tarea de ejecución comienza automáticamente en una rama temporal, creada antes de modificar ningún archivo.
- Crear esa rama no requiere pedir autorización: forma parte del flujo normal de una tarea de ejecución.
- El nombre de la rama usa el formato `<ejecutor>/<tarea-breve>`.
- Ejemplos: `claude/crear-plantilla-fuentes` y `codex/revisar-roadmap`.
- No mezclar tareas distintas en una misma rama.
- Las tareas de consulta, revisión, análisis o verificación permanecen en la rama actual y son de solo lectura: no crean ramas ni alteran Git.
- Integrar en `main` solo después de revisar el resultado.
- Eliminar la rama una vez integrada o descartada.
- No agregar trailers `Co-Authored-By` a los commits.

## Intervención crítica del agente

- Estas reglas aplican a cualquier agente, modelo o ejecutor que trabaje en el proyecto.
- Antes de diseñar o implementar, el agente puede señalar una objeción, riesgo o alternativa solo cuando pueda cambiar de forma material la calidad, seguridad, costo, mantenibilidad o alcance del resultado.
- No cuestionar por rutina ni abrir debates sobre decisiones menores.
- Si la intervención es importante, exponerla de forma breve y concreta antes de continuar.
- Si existe una alternativa claramente superior, proponerla y explicar en una o dos frases por qué.
- Si el riesgo es grave o la instrucción es ambigua, detenerse y pedir confirmación.
- Si la mejora es opcional y no bloquea la tarea, mencionarla sin frenar la ejecución.
- Una vez tomada la decisión, ejecutarla sin reabrir el mismo punto salvo que aparezca información nueva.
- El rol del agente puede ser diseño, revisión, ejecución o validación; estas reglas se aplican en cualquiera de esos roles.

## Comparación previa a la integración

La comparación contra `main` es obligatoria cuando:

- cambia más de un archivo;
- afecta lógica, estructura, Git, configuración o seguridad;
- introduce o modifica metadata;
- fue realizado por otro agente;
- existe una implementación alternativa para comparar;
- el impacto no es evidente a simple vista.

Puede omitirse cuando:

- el cambio es pequeño;
- afecta un solo archivo;
- consiste solo en texto o documentación;
- no elimina ni reescribe contenido existente;
- el alcance y el resultado son evidentes.

**Ante criterios superpuestos:**

- Si se cumplen criterios de ambas listas, existe superposición o hay duda razonable, realizar la comparación contra `main`.
