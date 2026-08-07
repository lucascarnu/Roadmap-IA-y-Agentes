# 0001 — Metadata mínima de nodos

- **Estado:** aceptada
- **Fecha:** 2026-08-06

## Contexto y problema

`vision.md` compromete un roadmap dinámico que ordene el trabajo según
dependencias, tiempo disponible y urgencia. Ese cálculo solo es posible si cada
nodo declara esos datos de forma estructurada; con prosa libre no se computa.

Todavía no existe ningún nodo, así que este es el momento correcto para fijar el
formato: agregar metadata a nodos ya escritos obliga a inventar valores
retroactivos. El riesgo opuesto —un frontmatter con campos por si acaso— choca
con el principio "sin complejidad anticipada" de `vision.md`. El problema es
encontrar el conjunto mínimo que habilite el roadmap sin adelantar estructura.

## Decisión

Cada nodo lleva un frontmatter YAML —texto plano, portable y mapeable a columnas
si el sistema migra a una base de datos— con seis campos:

```yaml
---
estado: pendiente
prioridad: media
estimacion: corta
categoria: <slug-de-categoria-existente>
depende_de: []
fuentes: []
---
```

### Valores permitidos

| Campo | Valores |
|---|---|
| `estado` | `pendiente` · `en-curso` · `aprendido` |
| `prioridad` | `alta` · `media` · `baja` |
| `estimacion` | `corta` (<1h) · `media` (1-4h) · `larga` (>4h) |

Se usan categorías cerradas y no números: una escala numérica invita a retocar
valores sin que el orden mejore, y pierde significado al releerla meses después.

`estimacion` mide el tiempo aproximado que lleva aprender el concepto desde
cero, no cuánto tiempo le llevó históricamente a quien lo estudió. El valor
conserva su significado aunque el nodo ya esté en `aprendido`: describe el costo
del tema, no el recorrido de una persona.

Para el mínimo viable, `prioridad` representa también la urgencia. Son el mismo
eje, y separarlos obligaría a inventar una fórmula que los combine.

### Nombre del archivo como identificador

El identificador de un nodo es el nombre de su archivo sin extensión:
`transformers-atencion.md` tiene el identificador `transformers-atencion`. Los
campos `depende_de` y `fuentes` referencian esos identificadores. No se agrega un
campo `id`: el nombre del archivo ya es único, legible y navegable con búsqueda
de texto.

### `categoria` como referencia obligatoria

Un nodo pertenece a una categoría principal, y el valor debe corresponder a una
categoría existente en `categorias/`. No es texto libre: sin esa restricción
conviven `agentes`, `Agentes` y `agente` como categorías distintas, y la
navegación por categoría deja de servir.

Como corolario, definir al menos una categoría es prerrequisito para crear el
primer nodo. Hoy `categorias/` no contiene ninguna.

### `depende_de` como dependencia de conocimiento

`depende_de` representa una dependencia de conocimiento, no de tareas. Un nodo A
depende de B solamente cuando comprender o practicar A presupone haber aprendido
B.

No debe usarse para expresar el orden circunstancial de tareas dentro de un
proyecto. Ese orden operativo se representa en el proyecto mismo, mediante su
próxima acción, su plan y `nodos_requeridos`.

El criterio para distinguirlos es la reutilización: una dependencia debe seguir
siendo válida aunque el nodo se reutilice en otro proyecto diferente. Si deja de
tener sentido al cambiar de contexto, era orden de implementación.

- "Construir un índice de entidades" puede depender de "Leer Markdown y
  frontmatter" si el primero presupone saber extraer esos datos.
- "Crear una pantalla bonita después del índice" no constituye por sí solo una
  dependencia de conocimiento; podría ser solamente orden de implementación.

### Relaciones, en una sola dirección

Un nodo no declara a qué proyectos alimenta: es el proyecto el que lista los
nodos que aplica. Guardar la relación en ambos lados la desincroniza en la
primera edición apurada. Se elige el lado del proyecto porque son menos archivos
y cambian con menos frecuencia; la vista inversa se obtiene escaneando.

La relación con fuentes sigue el mismo criterio de dirección única, pero se
guarda del lado del nodo: al leer un nodo se quiere ver de dónde salió.

## Campos excluidos y por qué

**`modo`.** Un nodo es siempre modo Aprender y un proyecto es siempre modo Hacer,
porque esa es la separación central del modelo descrita en `vision.md`. Un campo
que solo puede tomar un valor no es metadata.

**Fechas (`creado`, `actualizado`).** Git ya las registra. Duplicarlas en el
frontmatter crea estado que hay que mantener a mano y que se desactualiza.

**`aprobado`.** El principio "capturar no es aprobar" queda resuelto por la
ubicación: lo capturado sin procesar vive en `inbox.md`, y crear el archivo en
`nodos/` es el acto de aprobación.

**`desbloqueado`.** Es derivable: un nodo está disponible cuando su `depende_de`
está vacío o cuando todas sus dependencias tienen `estado: aprendido`.
Almacenarlo obligaría a recalcularlo en cascada con cada cambio de estado.

**Vacíos de aprendizaje.** Se describen en prosa dentro del cuerpo del nodo. Un
vacío concreto no se representa en un enum sin perder la información útil.

## Costos conocidos

Se aceptan junto con la decisión:

- Renombrar el archivo de un nodo rompe en silencio las referencias que otros
  nodos le hagan. Se asume por tratarse de un repositorio personal, donde los
  renombres son poco frecuentes y Git los deja registrados; si el costo resulta
  mayor al previsto, se reconsidera un campo `id` inmutable.
- Un nodo que cruza dos dominios debe elegir una sola categoría principal. El
  paso de string a lista en YAML sería mecánico y compatible hacia atrás.
- `estimacion: media` cubre un rango de 1 a 4 horas, así que no discrimina bien
  frente a un hueco de 90 minutos. Los rangos se revisarán con el uso real.

## Cuestiones futuras

Pendiente y no decidido aquí: las validaciones de integridad. Hoy nada verifica
que `categoria` apunte a una categoría real, que los identificadores usados en
`depende_de` y `fuentes` existan, ni que no haya ciclos de dependencias. Las
reglas quedan definidas en este documento; falta automatizar su verificación.

## Nota sobre `skills`

El valor `skills` apareció como ejemplo durante la discusión previa a esta
decisión. No es una categoría aprobada y no debe tomarse como tal.
