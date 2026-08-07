# Visión

Entorno personal y multidominio de aprendizaje, conocimiento y ejecución
asistido por IA. Organiza fuentes, conocimiento, roadmaps y proyectos propios en
desarrollo de software, creatividad audiovisual, marketing y otros dominios
futuros. La IA y los agentes son el medio con el que se opera el sistema, no su
único objeto de estudio.

Construido con mentalidad de producto: para un solo usuario, pero con la
estructura y la disciplina de algo que podría dejar de serlo.

## Qué problema resuelve

El conocimiento sobre IA llega disperso, rápido y en formatos que se olvidan.
El costo real no es acceder a la información, es retenerla, evaluarla y
aplicarla. El sistema cierra tres brechas:

- **Aprendizaje** — entender de verdad, no acumular material sin procesar.
- **Organización** — que lo aprendido quede consultable y conectado.
- **Ejecución** — que se traduzca en proyectos concretos, no en notas muertas.

Aprender aquí significa alcanzar competencia operativa: capacidad para dirigir
herramientas e IA, elegir entornos y flujos de trabajo eficientes, comprender lo
suficiente para tomar las decisiones que importan y validar lo que se produce, y
profundizar técnicamente cuando esa profundidad aporte valor práctico.

No es formarse como especialista tradicional de cada disciplina, y tampoco es
delegar: el criterio, la dirección y la evaluación siguen siendo propios. Según
el tema, lo que hay que saber puede ser qué problema resuelve una herramienta,
cuándo conviene usarla y cuándo no, cómo combinarla con otras, qué instrucciones
darle a una IA para que ejecute bien, qué decisiones no conviene delegar, qué
límites y riesgos reconocer, y cómo comprobar si el resultado es correcto.

El criterio vale en cualquier dominio —programación, agentes, diseño, imagen,
video, audio, marketing— porque en todos la pregunta es la misma: qué hace falta
saber para obtener un resultado de calidad y para reconocer cuándo no lo es.

## Experiencia central

El punto de entrada habitual es Hacer: qué quiero lograr. Aprender sigue siendo
una entrada legítima por sí misma, pero aparece con más frecuencia al servicio de
Hacer, cuando algo que hace falta todavía no se sabe.

Ante un objetivo el orden es: qué capacidades hacen falta, qué herramientas y
conocimientos ya existen para cubrirlas, y recién entonces qué falta. Reutilizar
y combinar lo que ya existe tiene precedencia sobre construir algo nuevo, que se
considera cuando queda un hueco real que nada disponible resuelve bien.

El sistema acompaña el ciclo completo, desde que aparece un objetivo o un tema
hasta que se convierte en algo aplicado.

**Descubrir**

- Ante un objetivo de aprendizaje o de ejecución, revisar lo que ya existe y
  distinguir lo aprendido, lo pendiente y lo que todavía no está representado.
- Identificar qué capacidades exige el objetivo y qué herramientas registradas
  las cubren, con qué clasificación para cada una.
- No proponer construir ni buscar algo nuevo cuando una herramienta ya
  registrada cubre bien la necesidad.
- Si ninguna la cubre suficientemente, investigar soluciones externas
  reutilizables antes de considerar construir una propia.
- Construir cuando el hueco persista, o cuando haya un motivo explícito que lo
  justifique. La investigación previa es proporcional al costo, la importancia y
  la naturaleza de lo que se pretende construir.
- Detectar conocimientos, herramientas o prerrequisitos faltantes, y sugerir qué
  conviene buscar y dónde: Find Skills, documentación oficial, GitHub,
  buscadores, cursos o plataformas de contenido.
- Investigar y proponer fuentes candidatas, sin recomendar material nuevo cuando
  una fuente existente ya cubre bien la necesidad.
- Los huecos detectados pueden originar propuestas de nodos nuevos.
- Una fuente descubierta puede clasificarse en la misma sesión cuando haya
  evidencia suficiente; si la evidencia no alcanza, queda pendiente. La
  clasificación depende de la evidencia, no de quién encontró la fuente, y puede
  revisarse cuando aparezca nueva evidencia o experiencia práctica.
- De toda evaluación se conservan el origen y los motivos.

**Capturar**

- Registrar y clasificar temas de interés en el momento en que surgen.
- Guardar fuentes con tipo, URL accesible y trazabilidad hacia dónde se usaron.
- Puntuar cada fuente personalmente: qué tan útil me resultó a mí.

**Estudiar**

- Escribir notas generales del tema y notas específicas por fuente.
- Conservar resúmenes y síntesis de lo estudiado, en mis propias palabras.

**Evaluar**

- Revisar qué aprendí realmente y detectar los vacíos que quedaron abiertos.

**Decidir y ejecutar**

- Elegir entre modo **Aprender** y modo **Hacer**, según el momento.
- Generar un roadmap dinámico que ordene el trabajo según dependencias entre
  temas, tiempo disponible y urgencia real.
- Conectar el aprendizaje con proyectos concretos en curso.

## Principios

- **Estructura antes que herramienta.** El modelo de datos se define primero;
  la interfaz, si llega, se adapta a él.
- **Portable por diseño.** Markdown plano y Git. Sin dependencias de
  aplicaciones externas ni formatos propietarios. Todo debe poder migrarse a
  una base de datos o una app sin reescribir el contenido.
- **Una entidad principal por archivo.** Cada archivo tiene un sujeto claro que
  lo identifica, sin impedir que incluya material de apoyo relacionado.
- **Capturar no es aprobar.** Guardar una fuente solo registra que existe y me
  interesó. No implica haberla validado, ni estar de acuerdo, ni convertirla en
  nodo de conocimiento. La promoción a nodo es un acto deliberado y posterior,
  que exige haber entendido.
- **Sin complejidad anticipada.** Se agrega estructura cuando una necesidad real
  la justifica, no por simetría.

## Modelo

El sistema se organiza en seis tipos de entidad, deliberadamente en lugar de una
lista plana de tareas:

- **Categorías** — agrupan nodos y fuentes por dominio y dan navegación.
- **Capacidades** — qué se necesita poder hacer.
- **Nodos** — la unidad granular de aprendizaje. Un concepto entendido.
- **Fuentes** — de dónde salió el conocimiento; sostienen la trazabilidad.
- **Herramientas** — con qué puede realizarse una capacidad.
- **Proyectos** — qué resultado concreto se quiere conseguir, con alcance
  definido.

Las **decisiones** no son entidades del modelo. Son documentación arquitectónica
que registra por qué el sistema es como es, una por archivo, y no se indexan
junto al contenido.

La separación entre nodo y proyecto sigue siendo central: distingue lo que sé de
lo que quiero conseguir. Un nodo puede existir sin proyecto, y un proyecto puede
exponer vacíos que generan nodos nuevos.

Capacidades y herramientas agregan el otro eje: qué hace falta poder hacer y con
qué. Muchas veces un objetivo se resuelve combinando herramientas que ya existen,
sin aprender nada nuevo.

## Alcance actual

Herramienta de uso personal. No está pensada para usuarios externos, mercado ni
monetización. Las decisiones se toman según utilidad propia, no según adopción.

No se limita al desarrollo de software o de agentes. Puede organizar aprendizaje
y proyectos en generación de imágenes con IA, diseño gráfico 2D, video con IA,
audio y voz, sincronización labial, avatares, producción de contenido,
publicidad, marketing y los dominios que aparezcan más adelante.

Los seis tipos de entidad se reutilizan igual en todos ellos, y una
categoría nueva se crea cuando existe contenido o una necesidad real que la
justifique. Los modos Aprender y Hacer pueden combinar conocimientos de dominios
distintos. Trabajar hoy sobre desarrollo de aplicaciones no especializa el
sistema en programación.

## Hacia dónde puede evolucionar

Si el modelo demuestra servir en el uso diario, el siguiente paso natural es una
aplicación que lo consuma: búsqueda, relaciones navegables entre nodos,
seguimiento de proyectos y una interfaz propia. Esa posibilidad no cambia las
prioridades de hoy, pero sí justifica mantener el contenido limpio y
estructurado desde el principio.
