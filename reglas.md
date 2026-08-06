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
