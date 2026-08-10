### Decisión 0004 — 2587b3cfd3db9831386b6a04fbfa3807444fd458
# 0004 — Stack y ubicación del prototipo

- **Estado:** aceptada
- **Fecha:** 2026-08-07

## Contexto y problema

La próxima acción de `implementar-roadmap-como-app` era elegir el stack del
primer prototipo. El alcance de ese prototipo ya está escrito: un visor local de
solo lectura sobre los seis tipos de entidad del modelo, con búsqueda, filtros,
relaciones y detección de errores de integridad.

Dos preguntas había que resolver juntas. La primera es con qué construirlo. La
segunda, dónde vive la aplicación, que parece independiente pero no lo es: de
ella dependen cómo se ejecuta el programa y cómo encuentra los archivos, que son
consecuencias directas de la elección técnica.

Todavía no existe una sola línea de código, así que decidir ahora no cuesta nada
y decidir después costaría reescribir.

## Decisión

### Stack

- **Python 3** como lenguaje y runtime. Se usará inicialmente la versión 3.13,
  disponible y verificada en el entorno actual. Esta decisión no establece una
  política de versiones mínimas ni máximas.
- **Flask** como servidor web local.
- **HTML renderizado en el servidor** mediante Jinja.
- Markdown sigue siendo la fuente de verdad. La aplicación no genera contenido
  ni lo transforma en otro formato.
- El índice de entidades y relaciones se construye **en memoria** al leer.
- Sin base de datos.
- Aplicación exclusivamente local y de solo lectura.

Sobre Flask: queda fijado para este prototipo, y sustituirlo en una evolución
futura requeriría revisar esta decisión. A cambio, **la capa que lee los
archivos y construye el índice debe permanecer desacoplada de Flask**, sin
importar nada del framework. Es lo que permite que un cambio de capa de
presentación no arrastre al resto.

### Alcance temporal de tres exclusiones

Para el primer prototipo no se usa SPA separada, no se separan frontend y
backend, y no hay paso de build ni bundler.

Las tres son decisiones **para este prototipo**, no prohibiciones permanentes.
Ninguna cierra la puerta a que una evolución posterior exponga el índice como
JSON o incorpore un frontend distinto; simplemente hoy no hay ningún requisito
que lo justifique, y agregarlo multiplicaría las piezas sin resolver nada.

### YAML y frontmatter

- Debe usarse un **parser YAML conforme**.
- **No debe implementarse el parseo mediante división manual por líneas.** Las
  decisiones `0001`, `0002` y `0003` definen escalares entrecomillados con
  escapes internos, listas vacías y claves ausentes cuyo significado difiere de
  una lista vacía. Un lector por líneas rompe esos casos en silencio, que es el
  peor modo de fallo posible para una aplicación cuyo trabajo incluye detectar
  errores.
- **PyYAML** es la opción inicial razonable. Sustituirla por otro parser
  conforme no viola esta decisión.
- No queda fijado el uso de `python-frontmatter`. La separación entre
  frontmatter y cuerpo puede resolverse con esa librería o de forma controlada
  antes de entregar el bloque al parser.

### Renderizado de Markdown

Se necesita una librería de renderizado compatible para mostrar el cuerpo de las
entidades. La elección concreta no forma parte de esta decisión.

### Ubicación

- La aplicación vive en **`app/`**, una única carpeta dedicada en la raíz de
  este mismo repositorio.
- `app/` es hermana de `categorias/`, `capacidades/`, `nodos/`, `fuentes/`,
  `herramientas/`, `proyectos/` y `decisiones/`, y no colisiona con ninguna de
  ellas.
- **`app/` no forma parte del modelo de entidades.** No se le aplica ninguna de
  las reglas de metadata de `0001`, `0002`, `0003`, `0005` o `0006`, y su
  contenido no se lee como ninguna de las seis entidades.
- El lector continúa considerando únicamente las seis carpetas de entidades,
  según la lista explícita que define el alcance del prototipo en
  `implementar-roadmap-como-app`. `app/` queda fuera sin necesidad de ninguna
  regla nueva.
- La aplicación encuentra el contenido mediante rutas relativas al propio
  repositorio, sin configuración externa de ubicación.
- Nada de la aplicación vive fuera de `app/`, salvo lo que Git exige en la raíz
  por convención.

### Principio de independencia

Borrar `app/` debe dejar intacto y utilizable el sistema de conocimiento en
Markdown. Si el contenido comienza a depender de la aplicación para existir,
interpretarse o migrarse, se habrá violado esta decisión.

Es el criterio que hace verificable la convivencia: no alcanza con que la
aplicación sea de solo lectura, tiene que ser prescindible.

## Razones

- Es la solución más simple que satisface el alcance actual del prototipo.
- Python ya está disponible y verificado en el entorno de trabajo.
- El alcance no necesita JavaScript de cliente: listados, búsqueda y filtros se
  resuelven con HTML generado en el servidor y parámetros de consulta.
- Evita instalar y mantener un segundo runtime.
- Evita separar prematuramente frontend y backend, que multiplicaría las piezas
  sin resolver ningún requisito.
- Mantiene juntas la especificación del modelo y su implementación: las
  decisiones que definen el formato son literalmente la especificación del
  lector.
- Evita coordinar dos repositorios y configurar la ruta de uno hacia el otro,
  que es configuración creada por la separación y no por una necesidad del
  sistema.
- El requisito de portabilidad de `vision.md` aplica al contenido, no a que el
  repositorio contenga exclusivamente Markdown. Ninguna regla del repositorio
  exige lo segundo.

## Alternativas descartadas

**Node con Express.** Equivalente en resultado y en dificultad, pero exige
instalar y mantener un runtime que no está presente, sin resolver nada que
Python no resuelva.

**Un framework de contenido como Astro.** Aporta modelado de contenido y
validación por esquema, a cambio de un paso de build y de muchas más piezas para
ocho entidades sin requisitos de escala. Su validación por esquema competiría
además con las reglas de `0001`, `0002` y `0003`, que son la fuente de verdad.

**Repositorio separado para la aplicación.** Resolvería un desacoplamiento que
el diseño ya garantiza —la aplicación es de solo lectura y el contenido no la
menciona— al precio de configurar rutas entre repositorios, coordinar dos
historias y dejar esta misma decisión separada de aquello que decide.

Descartarlo tiene un costo conocido y aceptado: **al vivir la aplicación en el
mismo repositorio, el historial de Git mezclará commits de conocimiento y
documentación con commits de código.** Se mitiga con los prefijos de commit que
el repositorio ya usa y con filtros por ruta al leer el historial, y es un costo
menor que mantener dos repositorios coordinados.

## Consecuencias

### Queda decidido

- El lenguaje y el runtime del prototipo.
- Flask como servidor del primer prototipo, con la capa de lectura e índice
  desacoplada de él.
- Que la aplicación es un único proceso local que devuelve HTML.
- Que no hay base de datos ni escritura sobre el contenido.
- Que el parseo de YAML se hace con un parser conforme y nunca a mano.
- Que la aplicación vive en `app/`, dentro de este repositorio y fuera del
  modelo de entidades.
- Que el contenido se localiza por rutas relativas, sin configuración.
- Que borrar `app/` debe dejar el sistema de conocimiento intacto.

### Queda abierto

Detalles de implementación que esta decisión no congela:

- `python-frontmatter` frente a separación controlada más PyYAML;
- la librería concreta de renderizado de Markdown;
- el puerto en el que escucha la aplicación;
- releer los archivos en cada petición o cachear con control de modificación;
- el enfoque de CSS, incluida la opción de no tener ninguno;
- la estructura interna de `app/`;
- la estrategia de pruebas;
- el mecanismo de entorno virtual y la forma de declarar dependencias.

## Relación con el proyecto

Una vez aprobada e integrada esta decisión, la próxima acción de
`implementar-roadmap-como-app` pasa a ser **construir el lector de archivos del
repositorio**.

Al escribirse esta decisión se esperaba que esa acción quedara bloqueada por un
nodo de aprendizaje. No ocurrió: `0003` redefinió después `nodos_requeridos` como
el conocimiento que el usuario necesita para decidir o dirigir, y el detalle
técnico de implementación no entra en esa definición. La acción quedó con
`nodos_requeridos: []` y con `capacidades_requeridas` declarando qué hace falta
poder hacer.
