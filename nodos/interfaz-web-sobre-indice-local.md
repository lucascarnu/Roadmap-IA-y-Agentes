---
estado: pendiente
prioridad: alta
estimacion: larga
categoria: desarrollo-de-aplicaciones
depende_de:
  - indice-de-entidades-y-relaciones
fuentes: []
---

# Interfaz web sobre un índice local

## Objetivo de aprendizaje

Construir una interfaz web local que presente un índice ya existente en memoria,
aprendiendo en el camino los fundamentos de desarrollo web que esa construcción
requiere. El objetivo no es dominar el desarrollo web en general, sino saber
levantar, entender y extender esta interfaz.

## Qué incluye

Fundamentos, acotados a lo que esta interfaz necesita:

- Estructura básica de una aplicación web que corre localmente, y cómo servirla.
- Componentes y vistas: cómo se dividen y cómo se reutilizan.
- Navegación entre vistas.
- El estado necesario para sostener búsqueda y filtros.
- Renderizado de contenido, incluido el cuerpo Markdown de cada entidad.
- Conexión entre la interfaz y el índice en memoria.

Aplicación a este sistema:

- Listados por tipo de entidad: categorías, capacidades, nodos, fuentes,
  herramientas y proyectos.
- Vista de detalle de una entidad, con su cuerpo renderizado.
- Búsqueda por texto y filtros por los campos del frontmatter.
- Navegación por las relaciones: de un nodo a sus fuentes, de un proyecto a los
  nodos que requiere, de una categoría a lo que agrupa.
- Representación de dependencias y estados.

## Qué queda fuera

- Editar cualquier cosa desde la interfaz.
- Autenticación, múltiples usuarios y acceso por red.
- Despliegue remoto.
- Diseño visual elaborado o sistemas de diseño.
- Comparar frameworks o stacks alternativos: se aprende el elegido, no un
  panorama.
- Rendimiento, accesibilidad avanzada y posicionamiento, que un curso general
  cubriría y esta interfaz no necesita.
- Construir el índice, que pertenece al nodo del que este depende.

## Criterio para considerarlo aprendido

La interfaz funciona y se puede extender sin volver a empezar: agregar una vista
nueva, un filtro nuevo o un campo a una vista existente es una modificación
localizada y comprensible, no una reescritura.

En términos de uso: navegar el sistema completo desde el navegador sin abrir el
editor, encontrar un nodo buscando una palabra de su cuerpo, y llegar desde él a
las fuentes que lo respaldan y a los proyectos que lo requieren.

## Práctica

Partir de una vista mínima que liste los nodos leyendo el índice en memoria.
Agregarle después un filtro por estado, la navegación al detalle de cada nodo, y
desde ahí los enlaces a sus fuentes. Cada paso ejercita uno de los fundamentos
de la lista.

## Fuentes

Ninguna registrada todavía. Las fuentes útiles dependen del stack que se elija,
así que conviene descubrirlas después de esa decisión y no antes. Con el alcance
ampliado a fundamentos, es probable que hagan falta dos tipos de material: la
documentación del framework y algo introductorio sobre estructura de una
aplicación web.
