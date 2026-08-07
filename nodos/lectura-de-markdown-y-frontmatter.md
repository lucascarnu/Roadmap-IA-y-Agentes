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

Poder dirigir la construcción de un lector de Markdown y frontmatter para este
repositorio, y validar correctamente su resultado.

No exige escribir personalmente el parser ni el código. Exige entender qué tiene
que pasar al leer estos archivos y reconocer cuándo no está pasando.

## Qué incluye

- Por qué el frontmatter se interpreta con un parser YAML conforme y nunca con
  parsing manual improvisado: las decisiones definen escalares entrecomillados
  con escapes, listas vacías y claves ausentes, y un lector por líneas los rompe
  en silencio.
- Separar el bloque delimitado por `---` del resto del archivo cuando está
  presente, y tratar correctamente el caso en que no lo está.
- Parsear YAML y obtener los tipos que el sistema usa: cadenas, listas y fechas.
- Los casos borde ya documentados en las decisiones: texto entrecomillado con
  escapes internos, listas vacías `[]`, y claves ausentes, que en proyectos
  significan algo distinto de una lista vacía.
- Leer el cuerpo como texto y extraer su `# H1`.
- Distinguir los tres tratamientos que conviven en el repositorio:
  - `nodos/`, `fuentes/`, `herramientas/` y `proyectos/`, cuyos archivos llevan
    frontmatter definido por las decisiones `0001`, `0002`, `0003` y `0006`;
  - `categorias/` y `capacidades/`, cuyos archivos son Markdown sin frontmatter;
  - la documentación del repositorio —`decisiones/`, `README.md`, `vision.md`,
    `reglas.md` y los demás archivos de la raíz—, que no debe interpretarse
    como entidad del modelo.
- Recorrer un directorio aplicando a cada archivo el tratamiento que
  corresponde, y excluir los `README.md` que describen cada carpeta.
- Leer explícitamente como UTF-8. El repositorio está lleno de vocales
  acentuadas y el valor por defecto del sistema puede corromperlas sin avisar.
- Cómo se ve una salida correcta del lector, con detalle suficiente para
  reconocer una incorrecta.

## Qué queda fuera

- Renderizar Markdown a HTML.
- Validar reglas de negocio sobre los datos leídos.
- Escribir o modificar archivos.
- Funciones de YAML que el sistema no usa: anclas, referencias, documentos
  múltiples.

## Criterio para considerarlo aprendido

No alcanza con que el código funcione. El nodo está aprendido cuando se puede:

- explicar qué tratamientos conviven en el repositorio y por qué;
- dirigir a una IA para construir o corregir el lector;
- revisar su salida y juzgar si es correcta;
- detectar los errores que pasan en silencio: una clave ausente leída como lista
  vacía, y el contenido corrompido por encoding.

No exige memorizar APIs, escribir el código sin IA, dominar Python ni dominar
YAML en profundidad.

## Práctica

Obtener un lector —escribiéndolo o dirigiendo a una IA para que lo escriba— que
recorra `categorias/`, `capacidades/`, `nodos/`, `fuentes/`, `herramientas/` y
`proyectos/`, e imprima por archivo su identificador y lo que haya podido leer.

Comprobarlo después contra casos concretos:

- una entidad con frontmatter y una sin él se leen ambas sin error;
- un archivo donde una clave está ausente se distingue de uno donde esa misma
  clave es una lista vacía;
- un archivo con acentos se lee sin corromperse;
- los `README.md`, `decisiones/` y los archivos sueltos de la raíz quedan fuera.

Para cerrar, introducir a propósito una salida incorrecta —una clave ausente
tratada como lista vacía, o un texto leído con el encoding equivocado— y
explicar por qué está mal.

El medio con el que se produzca el lector no determina si el nodo fue aprendido.

## Fuentes

Ninguna registrada todavía. Hay que descubrir y evaluar material adecuado; los
candidatos naturales son la documentación de la librería de YAML y de la de
frontmatter del stack que se elija. Como ese stack todavía no está decidido, las
fuentes concretas dependen de esa decisión previa.
