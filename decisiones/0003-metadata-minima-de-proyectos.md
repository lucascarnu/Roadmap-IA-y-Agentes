# 0003 — Metadata mínima de proyectos

- **Estado:** aceptada
- **Fecha:** 2026-08-06

## Contexto y problema

`vision.md` compromete un modo Hacer que recomiende qué proyecto atender según
urgencia, dependencias y tiempo disponible. Los proyectos son el lado Hacer de la
separación central del modelo, y sin metadata estructurada esa recomendación no
se puede computar.

La tensión es propia de esta entidad. Un nodo describe un concepto acotado y una
fuente un material fijo, pero un proyecto es largo, abierto y cambia de etapa
mientras avanza. Cualquier campo que intente describir *el proyecto completo*
envejece mal: una estimación total es ficción y un porcentaje de avance miente a
las pocas semanas. Lo único que se puede describir con precisión en cualquier
momento es **el paso siguiente**.

Todavía no existe ningún proyecto, así que este es el momento de fijar el
formato. La decisión `0001` ya estableció que es el proyecto quien declara los
nodos y no al revés; esta decisión conserva esa dirección pero angosta su
alcance.

## Decisión

### Principio general

`estado` es el único campo universal y determina qué otros campos deben estar
presentes. El frontmatter funciona como una unión etiquetada: conociendo el
estado se sabe exactamente qué esperar.

El frontmatter describe **la situación actual** del proyecto y se sobrescribe al
avanzar: no acumula historia. El cuerpo conserva el objetivo, el alcance, la
bitácora, las decisiones y el contexto histórico, complementado por el historial
de Git.

De ahí se desprende la regla que gobierna todo el formato: un campo existe
mientras existe aquello que describe. No hay excepciones.

### `estado`

`activo` · `pausado` · `terminado`

### `prioridad`

`alta` · `media` · `baja`

Obligatoria en `activo` y en `pausado`. Ausente en `terminado`: una vez cerrado,
la importancia relativa dejó de ser verdadera, y un `prioridad: alta` en algo
terminado se lee mal al recorrer la carpeta.

### `fecha_limite`

Campo opcional, presente en cualquier estado. Solo se usa cuando existe un plazo
externo real; la mayoría de los proyectos personales no tiene ninguno.

**Se conserva al terminar.** Es la única excepción al retiro de campos, y el
motivo distingue dos clases de dato: `prioridad` y el bloque de próxima acción
son juicios vigentes que dejan de ser verdaderos al cerrar el proyecto, mientras
que una fecha límite es un hecho registrado. "Esto tenía que estar para el 30 de
junio" sigue siendo cierto después. Borrarlo destruiría información.

La urgencia se deriva comparando `fecha_limite` con la fecha actual. No se guarda
un campo de urgencia: lo que era urgente en marzo dejó de serlo o se volvió
crítico, y nadie edita ese campo. Una fecha se recalcula sola.

### Bloque de próxima acción

Cuatro campos que forman una unidad indivisible, porque los cuatro describen el
mismo objeto —el paso siguiente— y ninguno tiene sentido sin los demás.

**`proxima_accion`** — texto libre. Representa una única acción concreta e
inmediata, no el plan completo. El plan vive en el cuerpo.

Se escribe siempre entre comillas dobles y las comillas dobles internas se
escapan como `\"`, siguiendo la misma convención de texto libre que `0002`
adoptó para `origen`.

```yaml
proxima_accion: "Revisar el módulo \"core\" del plugin"
```

**`duracion_proxima_accion`** — `corta` (<1h) · `media` (1-4h) · `larga` (>4h).
Mide el tiempo aproximado para ejecutar la próxima acción.

Lleva nombre propio y no reutiliza `estimacion` deliberadamente: en `0001` ese
campo mide cuánto lleva aprender un concepto desde cero. Reusar el nombre con
otro significado repetiría el error que `0002` ya evitó al no llamar `estado` al
campo de clasificación de las fuentes.

**`nodos_requeridos`** — lista de identificadores de nodos. Representa
únicamente los conocimientos que **el usuario** necesita antes de la próxima
acción para poder decidirla o dirigirla, y que no conviene delegar por completo.

No incluye el conocimiento técnico que un agente aplica para ejecutar. Que una
acción use Python, YAML, HTTP o desarrollo web no convierte esos temas en nodos
requeridos. Tampoco incluye lo que solo servirá para validar una vez que exista
un resultado: eso pertenece al criterio de finalización del proyecto y a la
prioridad propia del nodo.

`[]` significa que no se identificó ningún conocimiento previo del usuario
necesario para esa próxima acción. **No** significa que el proyecto completo no
requiera conocimiento nuevo.

El alcance acotado es lo que vuelve correcto el algoritmo: si el campo listara
todo lo que el proyecto va a necesitar alguna vez, cualquier conocimiento de una
etapa lejana bloquearía la acción de hoy y casi ningún proyecto avanzaría nunca.
Los nodos de etapas futuras no deben bloquear la acción actual.

**`capacidades_requeridas`** — lista de identificadores de capacidades
existentes en `capacidades/`. Representa las capacidades que **esa** próxima
acción necesita, no todas las que el proyecto usará alguna vez.

`[]` significa que no se identificaron capacidades necesarias para esa próxima
acción. **No** implica que el proyecto completo no use ninguna.

A diferencia de `nodos_requeridos`, este campo **no bloquea**. Es información
declarativa: permite expresar qué hace falta poder hacer. Cruzarla con el
inventario de herramientas para detectar huecos o proponer una combinación
pertenece al recomendador, que queda fuera de esta decisión.

### Obligatoriedad por estado

| | `activo` | `pausado` | `terminado` |
|---|---|---|---|
| `estado` | obligatorio | obligatorio | obligatorio |
| `prioridad` | obligatoria | obligatoria | ausente |
| Bloque de próxima acción | obligatorio | completo o ausente | ausente |
| `fecha_limite` | opcional | opcional | opcional |

En `pausado` el bloque aparece completo o completamente ausente. Un proyecto
pausado puede conservar una acción preparada para facilitar su reanudación, pero
no entra en las recomendaciones del modo Hacer hasta volver a `activo`.

"Ausente" significa que la clave no está en el frontmatter, no que esté vacía.

### Ejemplos

**Activo**

```yaml
---
estado: activo
prioridad: alta
fecha_limite: 2026-09-15
proxima_accion: "Definir el esquema de la tabla de prospectos"
duracion_proxima_accion: corta
nodos_requeridos:
  - mcp-servidores-locales
capacidades_requeridas:
  - modelado-de-datos
---
```

**Pausado, con acción preparada**

```yaml
---
estado: pausado
prioridad: media
proxima_accion: "Migrar los shortcodes al editor de bloques"
duracion_proxima_accion: media
nodos_requeridos:
  - wordpress-bloques
capacidades_requeridas: []
---
```

**Pausado, sin acción preparada**

```yaml
---
estado: pausado
prioridad: baja
---
```

**Terminado, con fecha límite**

```yaml
---
estado: terminado
fecha_limite: 2026-06-30
---
```

**Terminado, sin fecha límite**

```yaml
---
estado: terminado
---
```

### Identificador

El nombre del archivo es el identificador estable del proyecto, en kebab-case e
inmutable después de crearlo. Ante colisiones se agrega un sufijo numérico, y los
identificadores existentes nunca se renumeran.

### Cuerpo

Debe incluir un `# H1` legible. Puede contener objetivo, alcance, criterio de
finalización, plan, bitácora, decisiones y los conocimientos utilizados
históricamente. Ninguna sección es obligatoria.

## Modo Hacer

Algoritmo mínimo:

1. Filtrar proyectos con `estado: activo`.
2. Verificar si todos sus `nodos_requeridos` están en `estado: aprendido`.
3. Si alguno no está aprendido, recomendar primero ese aprendizaje.
4. Si está listo, filtrar por `duracion_proxima_accion` según el tiempo
   disponible.
5. Ordenar por urgencia derivada de `fecha_limite`.
6. A igualdad de urgencia, ordenar por `prioridad`.

Un nodo `en-curso` todavía bloquea la acción, igual que uno `pendiente`.

`capacidades_requeridas` no interviene en este algoritmo. Es declarativa: expresa
qué hace falta poder hacer, pero no condiciona si la acción puede iniciarse.
Cruzarla con el inventario de herramientas pertenece al recomendador.

El paso 3 es el puente entre modo Hacer y modo Aprender, y no necesita ningún
campo propio. Cuando deriva a un nodo, el filtro de tiempo del paso 4 pasa a usar
el `estimacion` de ese nodo en lugar de `duracion_proxima_accion`: son campos
distintos porque miden cosas distintas.

Como `activo` garantiza el bloque completo, el algoritmo nunca encuentra un campo
sin referente y no necesita comprobaciones de existencia.

El orden por urgencia y prioridad, junto con el procedimiento para mover
conocimientos entre etapas, podrán trasladarse a la documentación operativa del
modo Hacer cuando esa documentación exista.

## Conocimientos futuros

Los conocimientos de etapas futuras viven como nodos ya identificados que
todavía no se agregan a `nodos_requeridos`, o como ideas vagas en prosa dentro
del cuerpo. Cuando pasan a ser necesarios para la próxima acción, se incorporan
manualmente a `nodos_requeridos`.

## Campos excluidos y por qué

**`categoria`.** Las categorías organizan conocimiento, y un proyecto es una
unidad de trabajo, no de conocimiento. Un proyecto cruza varios dominios a la vez
y forzar una etiqueta única produce un valor arbitrario que después nadie usa
para navegar. Si hiciera falta, es derivable de las categorías de sus nodos.

**Porcentaje de avance.** No hay forma honesta de calcularlo, y mantenido a mano
miente siempre.

**Estimación total del proyecto.** Estimar cuánto lleva un proyecto completo es
ficción; lo estimable con precisión es la próxima acción, y para eso está
`duracion_proxima_accion`.

**Fechas de creación y última actividad.** Git ya las registra, igual que en
`0001`.

**`contexto`** (`cliente` · `personal` · `trabajo`). No cambia nada de lo que el
modo Hacer recomienda. Si un proyecto de cliente importa más, eso ya se expresa
en `prioridad` y `fecha_limite`.

**Un estado adicional para proyectos todavía no asumidos.** Los proyectos no
asumidos permanecen en `inbox.md`; crear el archivo en `proyectos/` es el acto de
compromiso, igual que en `0002` crear el archivo de la fuente es el acto de
aprobación.

**Herramientas elegidas o candidatas, orden entre ellas, cobertura, porcentajes,
intervención manual y flujos de trabajo.** Un proyecto declara qué capacidades
necesita, no con qué se resolverán ni en qué secuencia. Elegir y combinar
herramientas pertenece al recomendador, y modelarlo ahora sería diseñar contra
casos que todavía no existen.

## Costos conocidos

Se aceptan junto con la decisión:

- `nodos_requeridos` y `capacidades_requeridas` son volátiles: cambian cada vez
  que avanza la próxima acción, y esa edición es manual.
- **La vista inversa desde un nodo hacia proyectos es parcial.** `0001` afirma
  que se obtiene escaneando, y esta decisión no modifica ese texto. Con el
  alcance acotado, escanear `nodos_requeridos` solo recupera los proyectos que
  requieren actualmente ese nodo para su próxima acción; no reconstruye todos los
  que utilizaron el conocimiento históricamente. La dirección de la relación no
  cambia, sí lo que puede reconstruirse. La trazabilidad histórica completa debe
  registrarse en la bitácora del cuerpo del proyecto y complementarse con Git. La
  precisión correspondiente en `0001` deberá evaluarse en una tarea separada.
- El frontmatter tiene forma variable según `estado`, a diferencia de nodos y
  fuentes, que siempre llevan seis campos.
- Terminar un proyecto deja de ser una edición de una palabra: hay que quitar
  `prioridad` y las cuatro claves del bloque.
- Un proyecto pausado con acción preparada envejece. Conviene revalidar el bloque
  al reactivarlo en lugar de confiar en él a ciegas.

## Cuestiones futuras

Pendiente y no decidido aquí: el validador de integridad, que ya estaba anotado
en `0001` y `0002` y que en esta decisión gana una clase de regla nueva. Deberá
comprobar:

- que los valores estén dentro de los permitidos;
- que los identificadores de `nodos_requeridos` correspondan a nodos existentes;
- que los identificadores de `capacidades_requeridas` correspondan a capacidades
  existentes;
- la presencia o ausencia de cada campo según `estado`;
- la coherencia del bloque de próxima acción, según la regla definida arriba;
- la ausencia de campos operativos en proyectos terminados.

Las tres últimas son reglas entre campos, no sobre un campo aislado. `0001` y
`0002` solo requerían verificar que un campo existiera y que su valor fuera
válido; acá la validez depende de la combinación.
