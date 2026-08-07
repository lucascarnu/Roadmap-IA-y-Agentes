---
estado: activo
prioridad: alta
proxima_accion: "Definir el alcance del primer prototipo de solo lectura"
duracion_proxima_accion: corta
nodos_requeridos: []
---

# Implementar el roadmap como aplicación

## Objetivo

Convertir este repositorio Markdown en una aplicación utilizable, sin dejar de
que los archivos sigan siendo la fuente de verdad.

Es el paso que `vision.md` anticipa como evolución natural del sistema, y el
motivo por el cual la portabilidad se adoptó como principio desde el primer día
en lugar de dejarse para después. El costo ya está pagado: el contenido es texto
plano con frontmatter estructurado, sin dependencias propietarias.

Las decisiones `0001`, `0002` y `0003` funcionan como especificación del modelo
de datos: las tres entidades tienen formato definido y cada una fue ejercitada
al menos con un caso real. El modelo todavía necesita más contenido,
dependencias entre nodos, roadmaps y validaciones antes de considerarse maduro,
así que el prototipo parte de un esquema escrito, no de uno probado a fondo.

## Alcance inicial

El primer prototipo se limita a:

- leer los archivos Markdown y su frontmatter;
- mostrar categorías, nodos, fuentes y proyectos;
- permitir búsqueda y filtros;
- mostrar relaciones y dependencias;
- funcionar en modo de solo lectura.

## Fuera del primer prototipo

Todo lo excluido comparte un rasgo: asume escritura, red o más de un actor. Cada
una de esas cosas multiplica el trabajo sin mejorar la consulta diaria, que es lo
único que el prototipo tiene que resolver.

- edición desde la app;
- agentes autónomos;
- múltiples usuarios;
- autenticación;
- sincronización en la nube;
- base de datos externa;
- aplicación móvil nativa.

Si la edición se incorpora más adelante, se decidirá después de probar el visor
si corresponde a este proyecto o a uno separado.

## Criterio de finalización

El proyecto termina cuando el prototipo:

- implementa correctamente el alcance de solo lectura;
- permite consultar categorías, nodos, fuentes y proyectos;
- permite búsqueda, filtros y visualización de relaciones;
- fue usado en consultas reales durante un período breve;
- resulta una alternativa útil y preferible para las consultas habituales.

No se exige que reemplace toda apertura de los archivos Markdown: seguir
abriéndolos para leerlos o editarlos es esperable y no invalida el criterio.

## Plan general

No vinculante. Solo la próxima acción del frontmatter compromete algo.

1. Definir el alcance del prototipo de solo lectura.
2. Elegir cómo leer Markdown y frontmatter, y sobre qué stack.
3. Listados por entidad: categorías, nodos, fuentes, proyectos.
4. Búsqueda y filtros por los campos ya definidos en las decisiones.
5. Vista de relaciones: dependencias entre nodos, fuentes citadas, nodos
   requeridos por proyecto.
6. Uso real durante algunas semanas antes de evaluar el criterio de
   finalización.

Las etapas 2 y 5 probablemente exijan conocimiento que todavía no está en
`nodos/` —parseo de frontmatter, elección de stack, representación de grafos—.
Mientras sigan siendo vagas quedan acá como prosa; cuando alguna se convierta en
la próxima acción, sus nodos se incorporan a `nodos_requeridos`.

## Bitácora

**2026-08-06 — Proyecto creado.**

El repositorio alcanzó una primera estructura funcional: tres decisiones de
metadata (`0001` nodos, `0002` fuentes, `0003` proyectos), una categoría
(`agentes-de-desarrollo`), un nodo y una fuente. Las tres entidades tienen
formato definido y al menos un caso real cada una —este proyecto es el primero
de la tercera—. No está completo: faltan contenido, dependencias entre nodos,
roadmaps y validaciones.

La primera acción es de alcance, no de código: sin un límite escrito, un
prototipo de solo lectura tiende a crecer hacia la edición antes de haber
demostrado que la consulta sirve.
