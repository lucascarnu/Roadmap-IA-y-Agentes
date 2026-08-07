---
estado: pendiente
prioridad: alta
estimacion: media
categoria: desarrollo-de-aplicaciones
depende_de:
  - lectura-de-markdown-y-frontmatter
fuentes: []
---

# Índice de entidades y relaciones

## Objetivo de aprendizaje

A partir de un conjunto de archivos ya leídos, construir en memoria un índice
que identifique cada entidad, resuelva las referencias entre ellas y detecte las
inconsistencias.

## Qué incluye

- Delimitar qué entra en el índice: seis tipos de entidad —categorías,
  capacidades, nodos, fuentes, herramientas y proyectos— y nada más. Estar
  dentro de una de esas carpetas no alcanza: el `README.md` que las describe no
  es una entidad.
- Identificar cada entidad por el nombre de su archivo.
- Incorporar las categorías y las capacidades, que no tienen frontmatter, a
  partir de su identificador y su `# H1`.
- Resolver las referencias entre entidades: la categoría de un nodo o una
  fuente, las dependencias entre nodos, las fuentes que un nodo cita, los nodos
  que un proyecto requiere y las capacidades que una herramienta cubre.
- Construir las vistas inversas donde correspondan, como qué nodos citan una
  fuente determinada o qué herramientas cubren una capacidad.
- Detectar referencias rotas: identificadores que no corresponden a ningún
  archivo.
- Detectar ciclos de dependencias entre nodos.
- Calcular estados derivados: qué nodos están disponibles y qué proyectos están
  listos para avanzar.

## Qué queda fuera

- Las decisiones y los documentos operativos del repositorio. No entran al
  índice de entidades, aunque más adelante puedan consultarse por separado.
- Otros orígenes de datos, como bases de datos o APIs. Este nodo se limita a
  índices construidos sobre las seis entidades almacenadas como archivos
  Markdown: nodos, fuentes, herramientas y proyectos aportan su frontmatter, y
  las categorías y capacidades aportan identificador y `# H1` sin frontmatter.
- Presentar el índice en una interfaz.
- Persistirlo en una base de datos.
- Escribir o corregir los archivos de origen.

## Criterio para considerarlo aprendido

Dado el repositorio completo, producir el índice y responder sin abrir ningún
archivo a mano: qué nodos están disponibles, qué proyectos están listos, y qué
referencias están rotas. El índice debe contener exactamente las entidades
reales, sin colar documentación ni archivos descriptivos.

## Práctica

Construir el índice y listar los nodos disponibles. Después, introducir a
propósito una referencia rota y un ciclo en una copia del repositorio, y
comprobar que ambos se detectan.

## Fuentes

Ninguna registrada todavía. Buena parte de las reglas a implementar ya están
escritas en las decisiones `0001`, `0002` y `0003`, que definen qué referencia a
qué. Falta descubrir material externo sobre representación de grafos y detección
de ciclos.

Aprender este nodo produce, como subproducto, el validador de integridad que las
tres decisiones dejan anotado como pendiente.
