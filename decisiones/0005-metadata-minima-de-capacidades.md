# 0005 — Metadata mínima de capacidades

- **Estado:** aceptada
- **Fecha:** 2026-08-07

## Contexto y problema

El sistema necesita responder, ante un objetivo concreto, qué hace falta poder
hacer y con qué se puede hacer. Eso son dos cosas distintas: la primera es una
capacidad, la segunda una herramienta.

Las herramientas declaran qué capacidades cubren, y esa declaración solo sirve
si el nombre de la capacidad es estable. Si conviven `generar-imagenes`,
`generacion-de-imagenes` y `crear-imagenes` como si fueran cosas distintas, el
inventario queda partido y una consulta por capacidad devuelve resultados
incompletos sin avisar.

Una regla de forma no alcanza. `0002` ya reconoce por escrito ese límite para
`plataforma`: exigir un token en minúsculas evita variantes de mayúsculas, pero
no impide sinónimos. En `plataforma` es tolerable porque es descriptiva; en una
capacidad no, porque es la clave que une herramientas con necesidades.

El sistema ya resolvió este problema una vez, con `categorias/`: un vocabulario
controlado donde cada término es un archivo, validable por existencia. Esta
decisión aplica el mismo mecanismo a las capacidades.

## Decisión

`capacidades/` es un tipo de entidad del modelo. Una capacidad expresa **qué se
necesita poder hacer**.

- El identificador estable es el nombre del archivo sin extensión, en
  kebab-case, e inmutable después de crearlo.
- Cada capacidad es un archivo Markdown con un `# H1` legible obligatorio.
- **Sin frontmatter**, igual que las categorías.
- El cuerpo es libre y opcional, y puede contener una definición breve de qué
  entra y qué no entra en esa capacidad.

Ejemplos de la forma que toma un identificador: `generacion-de-imagenes`,
`generacion-de-video`, `lip-sync`, `investigacion-de-competidores`.

### Se crean por necesidad, no por anticipación

Una capacidad se crea cuando aparece una necesidad real, normalmente porque una
herramienta concreta la cubre y hay que registrarla. No se construye una
taxonomía por adelantado.

Es el mismo criterio con el que se creó la segunda categoría: el vocabulario
crece desde el contenido, no desde un plan.

### Ninguna capacidad enumera herramientas

La relación se declara únicamente del lado de la herramienta, según `0006`. Un
archivo de capacidad nunca lista qué herramientas la cubren.

La vista inversa —qué herramientas cubren una capacidad— se obtiene escaneando
`herramientas/`. A diferencia de la vista inversa de proyectos descrita en
`0001`, esta es completa: el mapa `capacidades` de una herramienta describe la
herramienta entera y no una acción puntual.

## Razones

- Da referencias estables sin inventar ningún mecanismo: la validación es la
  misma regla que ya se aplica a `categoria`, comprobar que exista el archivo.
- Permite crecimiento progresivo, un archivo por vez, sin taxonomía anticipada.
- Si alguna capacidad necesita cuerpo propio —cómo se evalúa un buen resultado,
  qué alternativas se compararon, qué criterios de elección aplican— el archivo
  ya existe y se escribe adentro. No hace falta ninguna migración.
- Un documento único con una lista de capacidades habría exigido inventar un
  mini-formato para que el validador lo leyera, y no habría dado a ninguna
  capacidad un lugar donde crecer.

## Costos conocidos

- El modelo pasa de cuatro tipos de entidad a seis, contando también
  `herramientas/`. Es el mayor crecimiento estructural desde que el sistema
  existe, y se acepta porque no agrega mecanismos nuevos: reutiliza el patrón
  de `categorias/` en todo, incluida la ausencia de frontmatter.
- Una capacidad sin herramientas que la cubran es invisible salvo que alguien
  abra la carpeta. Hoy no importa; cuando exista la relación entre proyectos y
  capacidades, esa capacidad sin cobertura será justamente un hueco detectable.

## Queda abierto

- Las relaciones desde proyectos hacia capacidades. No se diseñan todavía.
- Si una capacidad llega a necesitar frontmatter. Hoy no hay ningún dato
  estructurado que le haga falta.
- Cualquier jerarquía o agrupación entre capacidades.
