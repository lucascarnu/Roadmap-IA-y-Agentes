# 0002 — Metadata mínima de fuentes

- **Estado:** aceptada
- **Fecha:** 2026-08-06

## Contexto y problema

`vision.md` describe la captura de fuentes como el punto de entrada del sistema:
guardar tipo, URL y trazabilidad, puntuarlas personalmente y recuperarlas
después. Todo el conocimiento entra por ahí, así que el formato de una fuente
condiciona lo que más adelante se podrá consultar.

La tensión es específica de esta entidad. `vision.md` establece que capturar es
barato y curar es caro: si registrar un enlace exige demasiado trabajo, se deja
de registrar y el sistema se vacía. Pero una fuente capturada sin estructura es
irrecuperable seis meses después, cuando ya no se recuerda de dónde salió.

Todavía no existe ninguna fuente, así que este es el momento de fijar el formato.
La decisión `0001` ya resolvió la dirección de la relación entre nodos y fuentes;
esta decisión no puede contradecirla.

## Decisión

Cada fuente lleva un frontmatter YAML con seis campos obligatorios:

```yaml
---
formato: video
plataforma: youtube
origen: "https://www.youtube.com/watch?v=abc123"
autor: Andrej Karpathy
categoria: agentes-de-desarrollo
clasificacion: pendiente
---
```

### `formato`

Describe cómo se consume la fuente. Valores iniciales:

`video` · `articulo` · `documentacion` · `repositorio` · `curso` · `libro` ·
`publicacion` · `conversacion`

`publicacion` representa posts, hilos y carruseles. Los TikToks, reels y demás
contenido audiovisual usan `video`, no `publicacion`: se consumen mirando, igual
que cualquier otro video, y la red donde viven se identifica con `plataforma`.

`documentacion` se separa de `articulo` porque es material de referencia al que
se vuelve, mientras que un artículo es lineal y se termina.

### `plataforma`

Identifica el servicio o medio donde vive la fuente. Se escribe como un token en
minúsculas y sin espacios.

Ejemplos iniciales: `youtube`, `tiktok`, `instagram`, `x`, `github`, `udemy`,
`web`, `local`, `ninguna`.

- `local` se usa para archivos accesibles localmente, sean propios o no.
- `web` se usa para sitios sin un servicio o plataforma identificable. Si existe
  un servicio reconocible —Medium, Substack, GitHub—, se usa su nombre.
- `ninguna` se usa solo cuando no existe una plataforma: una conversación
  presencial o un libro físico. Una conversación por Slack, WhatsApp, Meet u
  otro servicio usa la plataforma real.
- Los nombres de editoriales, autores o instituciones no se usan como
  plataforma, salvo que sean realmente el servicio donde se accede al contenido.

Es un campo propio y no un dato deducible de la URL. Con una URL acortada no hay
forma de saber a qué servicio apunta, y un curso comprado o un libro no tienen
URL de la cual deducir nada. La regla del token en minúsculas evita que convivan
`Udemy`, `udemy` y `UDEMY` como plataformas distintas.

### `origen`

Obligatorio. Contiene la URL, la referencia bibliográfica, la identificación de
una conversación o la ruta localizable del material.

Se escribe **siempre entre comillas dobles**. Es el único campo de texto libre
del frontmatter, y sin comillas hay tres formas de romperlo sin advertirlo: un
`: ` interno corta el escalar, un ` #` inicia un comentario y trunca el valor, y
varios caracteres iniciales reservados alteran el parseo. Una regla incondicional
evita tener que evaluar caso por caso.

Las rutas son relativas a la raíz del repositorio y usan barras normales. Las
comillas dobles internas se escapan con `\"`.

```yaml
origen: "https://www.youtube.com/watch?v=abc123&t=90"
origen: "ISBN 978-1449373320 — O'Reilly"
origen: "Conversación con Martín sobre MCP, 2026-08-06"
origen: "fuentes/adjuntos/paper-agentes.pdf"
origen: "Charla \"Agentes en producción\", 2026-05"
```

### `autor`

Contiene la persona, canal o institución responsable. Debe estar siempre
presente; cuando no pueda identificarse durante la captura se escribe
`desconocido`.

Puede completarse o corregirse más adelante sin consecuencias: el identificador
del archivo no depende de él.

### `categoria`

Referencia obligatoriamente una categoría existente en `categorias/`, con la
misma regla de integridad que la decisión `0001` fijó para los nodos.

### `clasificacion`

`pendiente` · `oro` · `plata` · `descartada`

`pendiente` representa una fuente todavía no evaluada; los otros tres valores
implican que ya fue revisada. Un solo campo cubre revisión y valoración, de modo
que no puedan contradecirse entre sí.

`bronce` queda fuera del mínimo viable. Los tres veredictos corresponden a las
tres acciones reales —volver a ella, tenerla a mano, no volver— y un cuarto nivel
agrega deliberación sin cambiar ninguna decisión.

### Identificador

El nombre del archivo es el identificador estable de la fuente. Usa un tema breve
de dos a cuatro palabras en kebab-case, y no depende del título original ni del
autor.

Es inmutable después de crear el archivo. Solo puede construirse con información
disponible al capturar, y el autor no cumple esa condición: podría desconocerse
en ese momento y completarse después, lo que obligaría a renombrar y rompería en
silencio las citas desde los nodos.

Ante una colisión se agrega un sufijo numérico —`mcp-servidores-locales-2.md`— y
los identificadores existentes nunca se renumeran.

### Cuerpo

El título legible se guarda como `# H1`.

Notas, síntesis, resumen y transcripción viven en el cuerpo. Ninguna de esas
secciones es obligatoria, y su presencia se deriva del contenido en lugar de
declararse con campos booleanos: un indicador que espeja el cuerpo queda
desactualizado la primera vez que alguien edita uno de los dos.

### Relaciones

Las fuentes no enumeran los nodos relacionados. Son los nodos los que declaran
sus fuentes mediante `fuentes: []`, según lo decidido en `0001`.

Los nodos relacionados con una fuente se obtienen buscando qué nodos citan su
identificador. Guardar la relación en ambos lados la desincronizaría.

## Flujo mínimo

**Al capturar:** los seis campos, con `clasificacion: pendiente` y
`autor: desconocido` cuando corresponda, más el título como `# H1`. Ningún campo
exige una decisión, así que capturar no se interrumpe.

**Al revisar:** se completa o corrige `autor` y se cambia `clasificacion`. No
aparece ningún campo nuevo.

**Al estudiar:** se agregan notas, síntesis, resumen o transcripción en el
cuerpo. El frontmatter no cambia.

## Costos conocidos

Se aceptan junto con la decisión:

- Cuando hay URL, `plataforma` repite lo que el dominio ya indica. Es redundancia
  deliberada.
- `autor: desconocido` puede quedar olvidado, porque nada obliga a completarlo al
  revisar. Es preferible a bloquear la captura.
- `plataforma` es vocabulario abierto: la regla del token no impide que convivan
  sinónimos como `x` y `twitter`. Si aparecen, se resuelve fijando un vocabulario
  canónico.
- El identificador no es adivinable a partir del título, así que citar una fuente
  desde un nodo requiere buscarla antes. Es el precio de que sea inmutable.

## Cuestiones futuras

Pendiente y no decidido aquí: las validaciones de integridad, que ahora alcanzan
también a las fuentes. Nada verifica que `categoria` apunte a una categoría real
ni que `formato` y `clasificacion` usen valores permitidos. Las reglas quedan
definidas; falta automatizar su verificación.
