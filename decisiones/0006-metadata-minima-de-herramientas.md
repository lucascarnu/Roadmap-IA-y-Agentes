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
fuentes:
  - articulo-comparativo-generadores
---
```

Tres campos obligatorios —`tipo`, `capacidades`, `origen`— más `fuentes`, que es
opcional. A eso se suma el `# H1` legible obligatorio y un cuerpo Markdown libre
y opcional. El identificador estable es el nombre del archivo sin extensión, en
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

### `fuentes`

Opcional. Lista de identificadores de fuentes existentes en `fuentes/`, que
sustentan lo que se afirma de la herramienta y su clasificación.

Dirección única, de la herramienta hacia la fuente: ninguna fuente enumera
herramientas. Una herramienta puede citar muchas fuentes, y una misma fuente
puede sustentar muchas herramientas, sin conflicto, porque solo un lado guarda la
relación. La vista inversa —qué herramientas se apoyan en una fuente— se obtiene
escaneando `herramientas/`.

Una lista plana alcanza inicialmente. No se estructura la evidencia por
capacidad: cuando haga falta explicar por qué la herramienta es `oro` para una
capacidad y `plata` para otra, ese matiz vive en el cuerpo, que es donde el
sistema ya deja lo que necesita prosa.

### Clasificación por capacidad

**No existe una clasificación global de herramienta.** La clasificación
pertenece a cada relación entre una herramienta y una capacidad.

| Valor | Significado |
|---|---|
| `oro` | opción principal actual para esa capacidad |
| `plata` | opción actualmente útil, que justifica su presencia por un valor incremental real |
| `pendiente` | evidencia insuficiente para decidir, incluidas las candidatas prometedoras que todavía no justifican entrar en las opciones activas |
| `descartada` | evaluada y actualmente sin valor suficiente para consideración normal |

`plata` **no significa "la segunda mejor" ni "promete"**. Significa que aporta
**hoy** un valor incremental relevante para esa capacidad: complementa a una
`oro`, es mejor opción en un contexto determinado, tiene una ventaja concreta de
automatización, integración o fricción, o es una alternativa realmente utilizable
que aporta algo distinto.

No alcanza para ser `plata` ser nueva, parecer prometedora, estar evolucionando
rápido o poder convertirse algún día en una opción importante. Una herramienta
que merece seguimiento por su potencial pero todavía no tiene valor actual
suficiente se queda en `pendiente`, y el cuerpo explica por qué interesa, qué
falta comprobar y qué evolución conviene observar.

Ser buena tampoco alcanza. Si no aporta nada frente a una `oro` que ya cubre esa
capacidad, no justifica el ruido que agrega al catálogo activo.

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

### La clasificación es revisable

Una clasificación refleja la evaluación **actual** del sistema, no un veredicto
permanente. Puede revisarse cuando aparece nueva evidencia externa, cuando la
herramienta evoluciona materialmente, cuando la experiencia práctica propia dice
otra cosa, cuando aparece un competidor claramente mejor, o cuando cambia el
contexto de uso.

La experiencia real puede confirmar una clasificación, subirla, bajarla,
llevarla a `descartada`, o justificar volver a evaluar algo previamente
descartado.

Registrar experiencia después de usar una herramienta es **opcional** y nunca es
requisito de integridad. Cuando se registra, la que generaliza —para qué sirvió
bien, dónde flaqueó, con qué se complementa— vive en el cuerpo de la herramienta.
La que fue particular de un trabajo concreto pertenece a la bitácora de ese
proyecto. El criterio de reparto: si sirve para elegir esa herramienta en otro
objetivo, va en la herramienta.

No hay campos estructurados para experiencia, ni fechas de revisión, ni
caducidad, ni estados de vigencia.

### Curaduría del acervo

El objetivo no es un catálogo exhaustivo. Es un acervo **curado**: alta
diversidad entre capacidades distintas, baja redundancia dentro de una misma
capacidad, y sobre todo las opciones que realmente vale la pena considerar.

Una herramienta no merece entrar ni permanecer en el catálogo activo solo por ser
buena. Cuando una capacidad ya está bien cubierta, una opción nueva debe
justificar **valor incremental relevante**: resuelve algo que la principal no
cubre, funciona mejor en otro contexto, automatiza más, reduce intervención
humana, integra mejor con otras herramientas o agentes, o aporta una vía
significativamente distinta.

Una evolución prometedora justifica registrarla y seguirla, no incorporarla al
catálogo activo: eso es `pendiente`, no `plata`.

No hay un máximo de herramientas por capacidad. Puede haber capacidades donde
alcance una sola y otras donde cuatro opciones realmente diferentes sean útiles.
Lo que se evita es acumular equivalentes.

La ventaja debe producir un beneficio práctico neto para el caso, en la línea del
principio de eficiencia del conjunto de `vision.md`. No basta con que una
herramienta ahorre tokens, sea más barata, sea local, sea nueva o tenga más
funciones.

### Catálogo activo y memoria

Registrar una herramienta no es lo mismo que recomendarla.

`oro` y `plata` son las clasificaciones que pueden entrar en la consideración
normal del modo Hacer. `pendiente` y `descartada` permanecen en memoria: la
primera porque todavía no hay con qué decidir, la segunda porque ya se decidió
que no. Ninguna de las dos se recomienda como solución normal mientras siga en
ese estado.

Una `pendiente` prometedora puede pasar a `plata` o a `oro` en cuanto exista
evidencia suficiente. Esa es la vía de entrada al catálogo activo, y no requiere
ningún estado intermedio.

Una herramienta `descartada` sigue siendo útil como memoria: evita volver a
investigarla desde cero si reaparece, conserva por qué se descartó, y permite
reevaluarla si cambió. Eso no implica que aparezca entre las recomendaciones
normales del modo Hacer.

Cuando una herramienta ya evaluada vuelve a presentarse, lo esperable es
reconocer que ya fue evaluada: si no cambió materialmente, se mantiene la
evaluación anterior sin repetir la investigación; si evolucionó, se reabre. Una
`plata` puede pasar a `oro`, una `oro` puede degradarse y una `descartada` puede
volver a ser relevante. El motivo queda en el cuerpo y en el historial de Git.

Las vistas y filtros que distingan catálogo activo de memoria no se diseñan aquí.

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

- Tres campos obligatorios son el mínimo que responde la consulta que justifica
  la entidad: para una capacidad dada, qué opciones hay y cuáles son mejores.
  `fuentes` se suma como opcional porque una clasificación sin evidencia es una
  opinión sin respaldo, y esa evidencia no se reconstruye después.
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
- El valor incremental es un juicio, no una regla verificable. Dos personas
  pueden discrepar sobre si una herramienta aporta algo frente a la `oro`
  existente, y nada en el formato lo dirime. Es deliberado: cuantificarlo
  exigiría scores que envejecerían peor que el juicio.
- Distinguir catálogo activo de memoria queda como criterio escrito, sin
  representación en la metadata. Hoy se deduce de la clasificación; si alguna vez
  hace falta filtrarlo de otra forma, habrá que decidirlo.

## Queda abierto

- Las capacidades requeridas por un proyecto, que son una enmienda a `0003`.
  *Resuelto: esa enmienda ya está incorporada en
  [0003](0003-metadata-minima-de-proyectos.md), que define
  `capacidades_requeridas` para la próxima acción de un proyecto. Cruzarlas con
  este inventario para detectar huecos sigue siendo tarea del recomendador, que
  continúa fuera de alcance.*
- La relación entre una herramienta y el proyecto que la originó.
- El recomendador: seleccionar automáticamente herramientas para un objetivo,
  detectar huecos y proponer construir. Esta decisión define el inventario, no
  cómo se decide con él.
