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

El sistema acompaña un ciclo completo, desde que un tema aparece hasta que se
convierte en algo aplicado.

**Descubrir**

- Ante un objetivo de aprendizaje o de ejecución, revisar lo que ya existe y
  distinguir lo aprendido, lo pendiente y lo que todavía no está representado.
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

El sistema se organiza en cinco entidades, deliberadamente en lugar de una lista
plana de tareas:

- **Nodos** — la unidad granular de aprendizaje. Un concepto entendido.
- **Categorías** — agrupan nodos por dominio y dan navegación.
- **Fuentes** — de dónde salió el conocimiento; sostienen la trazabilidad.
- **Proyectos** — dónde se aplica lo aprendido, con alcance definido.
- **Decisiones** — por qué el sistema es como es, una por archivo.

La separación entre nodo y proyecto es el principio central del modelo:
distingue lo que sé de lo que hice con eso. Un nodo puede existir sin proyecto,
y un proyecto puede exponer vacíos que generan nodos nuevos.

## Alcance actual

Herramienta de uso personal. No está pensada para usuarios externos, mercado ni
monetización. Las decisiones se toman según utilidad propia, no según adopción.

No se limita al desarrollo de software o de agentes. Puede organizar aprendizaje
y proyectos en generación de imágenes con IA, diseño gráfico 2D, video con IA,
audio y voz, sincronización labial, avatares, producción de contenido,
publicidad, marketing y los dominios que aparezcan más adelante.

Categorías, nodos, fuentes y proyectos se reutilizan igual en todos ellos, y una
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
