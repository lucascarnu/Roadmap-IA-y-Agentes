---
estado: pendiente
prioridad: alta
estimacion: corta
categoria: desarrollo-de-aplicaciones
depende_de: []
fuentes: []
---

# Lectura de Markdown y frontmatter

## Objetivo de aprendizaje

Poder leer los archivos Markdown del repositorio y obtener su frontmatter donde
exista, sin asumir que todo archivo lo tiene ni que todo archivo representa una
entidad del modelo.

## Qué incluye

- Separar el bloque delimitado por `---` del resto del archivo cuando está
  presente, y tratar correctamente el caso en que no lo está.
- Parsear YAML y obtener los tipos que el sistema usa: cadenas, listas y fechas.
- Los casos borde ya documentados en las decisiones: texto entrecomillado con
  escapes internos, listas vacías `[]`, y claves ausentes, que en proyectos
  significan algo distinto de una lista vacía.
- Leer el cuerpo como texto y extraer su `# H1`.
- Distinguir los tres tratamientos que conviven en el repositorio:
  - `nodos/`, `fuentes/` y `proyectos/`, cuyos archivos llevan frontmatter
    definido por las decisiones `0001`, `0002` y `0003`;
  - `categorias/`, cuyos archivos son Markdown sin frontmatter;
  - la documentación del repositorio —`decisiones/`, `README.md`, `vision.md`,
    `reglas.md` y los demás archivos de la raíz—, que no debe interpretarse
    como entidad del modelo.
- Recorrer un directorio aplicando a cada archivo el tratamiento que
  corresponde, y excluir los `README.md` que describen cada carpeta.

## Qué queda fuera

- Renderizar Markdown a HTML.
- Validar reglas de negocio sobre los datos leídos.
- Escribir o modificar archivos.
- Funciones de YAML que el sistema no usa: anclas, referencias, documentos
  múltiples.

## Criterio para considerarlo aprendido

Leer cualquier archivo Markdown del repositorio sin que el proceso falle:
obtener el frontmatter tipado donde existe, resolver sin error el caso de un
archivo que no lo tiene, y distinguir una clave ausente de una lista vacía, que
es la diferencia sobre la que se apoya el formato variable de los proyectos.

## Práctica

Escribir un script que recorra `categorias/`, `nodos/`, `fuentes/` y
`proyectos/` e imprima, por archivo, su identificador y lo que haya podido leer.
Debe parsear el frontmatter en las tres carpetas que lo tienen, aceptar sin
error las categorías que no lo tienen, omitir el `README.md` de cada carpeta, y
no recorrer `decisiones/` ni los archivos sueltos de la raíz.

## Fuentes

Ninguna registrada todavía. Hay que descubrir y evaluar material adecuado; los
candidatos naturales son la documentación de la librería de YAML y de la de
frontmatter del stack que se elija. Como ese stack todavía no está decidido, las
fuentes concretas dependen de esa decisión previa.
