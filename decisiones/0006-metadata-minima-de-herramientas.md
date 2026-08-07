# 0006 — Metadata mínima de herramientas

- **Estado:** aceptada
- **Fecha:** 2026-08-07

## Contexto y problema

El sistema tiene que poder responder, para una capacidad concreta, cuáles son
las mejores opciones disponibles antes de proponer construir algo nuevo. Nada
del modelo anterior podía responderlo.

Una herramienta no encaja como fuente ni como nodo. Una fuente es material que
se consume para aprender y cuyo ciclo termina; una herramienta se usa
repetidamente para producir. Un nodo es conocimiento, y una herramienta existe
como opción aunque nadie la haya aprendido todavía: el sistema necesita poder
recomendarla antes de que exista ningún nodo sobre ella.

Falta además un eje de consulta. Ni fuentes ni nodos declaran qué capacidad
cubren, y la categoría no sirve para eso: agrupa dominios de conocimiento, no
capacidades.

## Decisión

`herramientas/` es un tipo de entidad del modelo. Una herramienta expresa **con
qué puede realizarse una capacidad**.

```yaml
---
tipo: servicio
capacidades:
  generacion-de-imagenes: oro
  generacion-de-video: plata
  lip-sync: descartada
origen: "https://ejemplo.com"
---
```

Tres campos, más el `# H1` legible obligatorio y un cuerpo Markdown libre y
opcional. El identificador estable es el nombre del archivo sin extensión, en
kebab-case, e inmutable después de crearlo.

### `tipo`

Ocho valores permitidos, sin sinónimos ni variantes:

`herramienta` · `skill` · `plugin` · `mcp` · `servicio` · `agente` ·
`repositorio` · `app`

`repositorio` significa aquí un repositorio que puede utilizarse como solución
reutilizable, no un repositorio estudiado como material de aprendizaje. Ese
segundo caso es una fuente.

### `capacidades`

Es un **mapa YAML**, no una lista. Cada clave es el identificador de una
capacidad existente en `capacidades/`; cada valor es la clasificación de esa
herramienta **para esa capacidad**.

Cada clave debe corresponder a un archivo real de `capacidades/`, con la misma
regla de integridad que `0001` y `0002` aplican a `categoria`.

Un mapa vacío significa que la herramienta está registrada pero todavía no se
identificó qué capacidades cubre.

### Clasificación por capacidad

**No existe una clasificación global de herramienta.** La clasificación
pertenece a cada relación entre una herramienta y una capacidad.

| Valor | Significado |
|---|---|
| `oro` | una de las primeras opciones a considerar para esa capacidad |
| `plata` | alternativa útil que aporta valor, pero no es primera opción |
| `pendiente` | todavía no hay evidencia suficiente para clasificar esa capacidad |
| `descartada` | no merece ser considerada para esa capacidad con la evidencia disponible |

Herramientas y fuentes reutilizan el mismo conjunto de etiquetas —`pendiente`,
`oro`, `plata`, `descartada`—, pero eso no las convierte en una semántica
universal compartida. En una fuente se evalúa el material como evidencia; en una
herramienta se evalúa su utilidad respecto de **una capacidad concreta**. El
sujeto evaluado es distinto, y de ahí también la diferencia de forma: una fuente
lleva un veredicto, una herramienta uno por cada capacidad que cubre.

`bronce` no es un valor permitido. Su eventual incorporación no queda decidida
aquí.

El motivo de que la clasificación sea por capacidad y no global es que una misma
herramienta puede ser la primera opción para una cosa e inservible para otra. Un
campo único obligaría a elegir entre recomendarla donde no sirve o
subestimarla donde sí.

### Vista inversa

La relación se declara solo del lado de la herramienta. Ninguna capacidad
enumera herramientas.

La vista inversa —qué herramientas cubren una capacidad— se obtiene escaneando
`herramientas/`, filtrando las que tienen esa clave, y ordenando `oro` antes que
`plata`. Es una vista completa, no parcial: el mapa describe la herramienta
entera.

## Frontera entre fuente y herramienta

El criterio es la función, no el objeto:

- si un recurso **se consume como evidencia o material** para aprender o
  evaluar, actúa como fuente;
- si un recurso **se utiliza para producir, ejecutar o prestar** una capacidad,
  actúa como herramienta.

Un mismo recurso puede cumplir ambos papeles. Un repositorio puede estudiarse
para entender cómo está hecho y además usarse como solución.

En ese caso existen dos registros, uno en `fuentes/` y otro en `herramientas/`,
con identificadores independientes. **No son duplicados accidentales**:
representan funciones distintas del mismo recurso, con metadata distinta y
ciclos de vida distintos. Intentar unificarlos obligaría a un formato que sirva
mal para las dos cosas.

## Campos excluidos y por qué

**`acceso`, `precio`, `modelo de costo`, `disponibilidad`.** Son las condiciones
económicas de uso. Cambian con frecuencia y por causas ajenas al sistema, y el
prototipo solo necesita mostrar el inventario. Entran cuando exista un
recomendador que deba descartar opciones inaccesibles.

**`proveedor`, `autor`.** Se leen de `origen` en la práctica y no discriminan
nada que el sistema necesite consultar.

**`categoria`.** Las categorías organizan conocimiento, y una herramienta no es
conocimiento. Su eje de organización es la capacidad. Agregarle categoría serían
dos taxonomías compitiendo sobre el mismo archivo.

**`version`, fechas.** La versión cambia sola y quedaría desactualizada de
inmediato. Las fechas del archivo ya están en Git, como en `0001`.

**Proyecto de origen.** Todavía no existe ningún anexo propio construido, así
que cualquier diseño de esa relación sería especulación. Cuando exista, el campo
iría del lado de la herramienta, que es el lado estable.

**Clasificación global.** Reemplazada por la clasificación por capacidad, que es
más expresiva y además ahorra un campo.

## Razones

- Tres campos son el mínimo que responde la consulta que justifica la entidad:
  para una capacidad dada, qué opciones hay y cuáles son mejores.
- El mapa lleva a la vez la relación y el veredicto, de modo que no hacen falta
  dos campos ni una lista de objetos más verbosa.
- Reutiliza mecanismos ya probados: identificador por nombre de archivo,
  validación por existencia del archivo referenciado, reglas de `origen` de
  `0002`, y el mismo conjunto de etiquetas de clasificación, aplicado a otro
  sujeto.

## Costos conocidos

- Es el primer campo del sistema con forma de mapa. Todas las demás relaciones
  son listas de identificadores. El lector tiene que contemplar esa forma.
- Un recurso que sea fuente y herramienta a la vez se registra dos veces, y las
  dos entradas pueden divergir en su descripción. Es el precio de que cada
  registro sirva bien a su función.
- El vocabulario de capacidades depende de que se creen los archivos
  correspondientes en `capacidades/` antes de poder referenciarlos.

## Queda abierto

- Las capacidades requeridas por un proyecto, que son una enmienda a `0003`.
- La relación entre una herramienta y el proyecto que la originó.
- El recomendador: seleccionar automáticamente herramientas para un objetivo,
  detectar huecos y proponer construir. Esta decisión define el inventario, no
  cómo se decide con él.
