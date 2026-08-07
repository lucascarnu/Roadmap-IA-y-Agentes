---
estado: activo
prioridad: alta
proxima_accion: "Construir el lector de archivos del repositorio"
duracion_proxima_accion: media
nodos_requeridos:
  - lectura-de-markdown-y-frontmatter
---

# Implementar el roadmap como aplicación

## Objetivo

Convertir este repositorio Markdown en una aplicación utilizable, sin dejar de
que los archivos sigan siendo la fuente de verdad.

Es el paso que `vision.md` anticipa como evolución natural del sistema, y el
motivo por el cual la portabilidad se adoptó como principio desde el primer día
en lugar de dejarse para después. El costo ya está pagado: el contenido es texto
plano con frontmatter estructurado, sin dependencias propietarias.

Las decisiones `0001`, `0002` y `0003` funcionan como especificación del modelo
de datos: las tres entidades tienen formato definido y cada una fue ejercitada
al menos con un caso real. El modelo todavía necesita más contenido,
dependencias entre nodos, roadmaps y validaciones antes de considerarse maduro,
así que el prototipo parte de un esquema escrito, no de uno probado a fondo.

## Alcance inicial

### Qué problema resuelve

Hoy la única forma de consultar el sistema es abrir archivos en el editor. Con
ocho entidades eso todavía es manejable, y no es ahí donde está el problema. El
problema son las preguntas que no se pueden responder mirando un archivo, porque
exigen cruzar varios:

- qué nodos puedo aprender ahora, que obliga a leer el estado y las dependencias
  de todos los nodos y resolver la cadena a mano;
- qué proyectos están listos para avanzar, que obliga a leer los nodos requeridos
  de cada proyecto y después el estado de cada nodo listado;
- qué nodos citan una fuente, que solo se responde buscando, porque la relación
  se guarda en una sola dirección;
- si hay alguna referencia rota, que hoy no verifica nada.

### Quién lo usa

Un solo usuario, en su máquina. Sin cuentas, sin red, sin acceso compartido.

### Entidades que muestra

Seis tipos: categorías, capacidades, nodos, fuentes, herramientas y proyectos.

Las decisiones y los documentos operativos no se convierten en entidades. Son
documentación del sistema, no contenido del sistema. Las decisiones especifican
el formato y por eso son insumo para construir la aplicación, pero no material
que la aplicación tenga que mostrar.

### Consultas

- Listar cada tipo de entidad y abrir el detalle de cualquiera, con su cuerpo
  renderizado.
- Buscar texto en el título y en el cuerpo de cualquier entidad.
- Filtrar nodos por estado, prioridad, estimación y categoría.
- Filtrar fuentes por clasificación, formato, plataforma y categoría.
- Filtrar herramientas por tipo y por capacidad, y dentro de una capacidad por
  su clasificación para esa capacidad.
- Filtrar proyectos por estado y prioridad.
- Qué puedo aprender ahora: nodos disponibles, ordenados por prioridad y
  filtrables por estimación según el tiempo del que se dispone.
- Qué puedo hacer ahora: proyectos activos y listos, con su próxima acción
  visible.

### Relaciones

Directas, tal como están declaradas: de un nodo a su categoría, a sus fuentes y a
sus dependencias; de una fuente a su categoría; de un proyecto a sus nodos
requeridos; de una herramienta a las capacidades que cubre, con su clasificación
para cada una.

Inversas, calculadas: de una categoría a lo que la referencia; de una fuente a
los nodos que la citan; de un nodo a los nodos que dependen de él y a los
proyectos que lo requieren; de una capacidad a las herramientas que la cubren,
ordenadas por su clasificación para esa capacidad.

La última se muestra marcada como parcial. La decisión `0003` acotó
`nodos_requeridos` a la próxima acción, así que esa vista responde quién necesita
el nodo hoy, no quién lo usó alguna vez.

### Información derivada

Nada de esto se guarda en ningún archivo; todo se recalcula al leer.

- Disponibilidad de cada nodo, según la regla de `0001`.
- Cadena de bloqueo: las dependencias pendientes que bloquean a un nodo y las
  relaciones de precedencia que se desprenden del grafo. Cuando varias
  dependencias pueden resolverse en paralelo o en cualquier orden, la aplicación
  no inventa una prioridad entre ellas.
- Preparación de cada proyecto, según la regla de `0003`.
- Las vistas inversas enumeradas arriba.
- Conteo de nodos por categoría, como dato informativo frente al umbral que las
  propias categorías mencionan.

Sobre `fecha_limite`, el prototipo se limita a mostrarla cuando existe,
distinguir los proyectos que la tienen de los que no, y permitir ordenar por
proximidad temporal. No define umbrales ni niveles de urgencia, porque ninguna
decisión los establece.

### Entidades inválidas

Un visor sobre archivos escritos a mano se encuentra con frontmatter mal formado,
campos faltantes o valores fuera del conjunto permitido.

- Una entidad inválida nunca desaparece en silencio.
- Sigue siendo visible siempre que pueda leerse algo de ella.
- Queda marcada como inválida de forma evidente.
- Se muestra el motivo concreto del error.

Si el archivo no puede parsearse ni leerse como entidad, aparece igual mediante
su ruta o su nombre de archivo, junto con el error. Si además puede recuperarse
un identificador válido, se muestra también.

No hay reparación automática ni corrección sugerida: el prototipo informa,
corregir es trabajo del editor.

### Integridad

Todas las comprobaciones provienen de reglas ya escritas en las decisiones. No se
agrega ninguna regla nueva.

Comunes a las entidades con frontmatter:

- presencia de los campos obligatorios;
- valores dentro del conjunto permitido.

Cuando una entidad declara `categoria`, ese identificador debe corresponder a una
categoría existente.

De `0001`, sobre nodos:

- `estado` en `pendiente`, `en-curso` o `aprendido`;
- `prioridad` en `alta`, `media` o `baja`;
- `estimacion` en `corta`, `media` o `larga`;
- los identificadores de `depende_de` existen como nodos;
- los identificadores de `fuentes` existen como fuentes;
- no hay ciclos de dependencias entre nodos.

De `0002`, sobre fuentes:

- `formato` dentro de sus ocho valores;
- `clasificacion` en `pendiente`, `oro`, `plata` o `descartada`;
- `plataforma` es un token en minúsculas y sin espacios.

De `0006`, sobre herramientas:

- `tipo` dentro de sus ocho valores;
- cada clave de `capacidades` existe como capacidad;
- cada valor de `capacidades` en `pendiente`, `oro`, `plata` o `descartada`.

De `0003`, sobre proyectos:

- `estado` en `activo`, `pausado` o `terminado`;
- `prioridad` presente en activos y pausados, ausente en terminados;
- `duracion_proxima_accion` en `corta`, `media` o `larga`;
- coherencia del bloque de próxima acción, según la regla de esa decisión;
- ausencia de campos operativos en proyectos terminados;
- los identificadores de `nodos_requeridos` existen como nodos.

Las categorías no se validan por frontmatter porque no lo tienen. Lo único
verificable en ellas es que exista el archivo al que otras entidades apuntan.

## Fuera del primer prototipo

Todo lo excluido comparte un rasgo: asume escritura, red o más de un actor. Cada
una de esas cosas multiplica el trabajo sin mejorar la consulta diaria, que es lo
único que el prototipo tiene que resolver.

- edición desde la app;
- agentes autónomos;
- múltiples usuarios;
- autenticación;
- sincronización en la nube;
- base de datos externa;
- aplicación móvil nativa.

A eso se agregan, ya con el alcance definido:

- las decisiones y los documentos operativos como entidades navegables;
- cualquier funcionalidad atada a un dominio concreto: el modelo es neutral y la
  aplicación también, sin vistas especiales para programación, diseño o
  marketing;
- umbrales o niveles de urgencia que las decisiones no definen;
- reparación automática de entidades inválidas;
- reconstrucción histórica de qué nodos usó un proyecto a lo largo del tiempo,
  que el frontmatter no puede responder;
- la elección del stack, que es la acción siguiente y no parte del alcance.

Y con la incorporación de capacidades y herramientas, queda explícitamente
fuera todo lo que sería decidir por el usuario en lugar de mostrarle el
inventario:

- recomendación automática de herramientas para un objetivo;
- detección automática de huecos;
- búsqueda web automática;
- capacidades requeridas por proyectos, que serían una enmienda a `0003`;
- construcción automática de soluciones;
- la relación entre una herramienta y el proyecto que la originó;
- el ranking `bronce`;
- precios, suscripciones y disponibilidad;
- cualquier arquitectura de plugins o anexos.

El prototipo lee, valida, indexa, relaciona y muestra. Decidir sigue siendo del
usuario.

Si la edición se incorpora más adelante, se decidirá después de probar el visor
si corresponde a este proyecto o a uno separado.

## Criterio de finalización

El proyecto termina cuando el prototipo:

- implementa correctamente el alcance de solo lectura;
- permite consultar los seis tipos de entidad;
- permite búsqueda, filtros y visualización de relaciones;
- fue usado en consultas reales durante un período breve;
- resulta una alternativa útil y preferible para las consultas habituales.

Comprobaciones concretas que hacen verificables esos criterios:

1. Los seis tipos de entidad se listan y cada uno abre su detalle con el cuerpo
   renderizado.
2. Una búsqueda por una palabra del cuerpo encuentra la entidad que la contiene.
3. Los filtros de las cuatro entidades con frontmatter funcionan.
4. La vista de nodos disponibles coincide con el cálculo manual sobre el
   repositorio.
5. Desde un nodo se llega a sus fuentes, a sus dependencias y a los nodos que
   dependen de él, y desde una capacidad a las herramientas que la cubren, sin
   escribir rutas.
6. Una referencia rota introducida a propósito aparece señalada, y la entidad que
   la contiene sigue siendo visible.
7. Después de un período breve de uso real, consultar el sistema por la
   aplicación resulta preferible a abrir el editor.

La séptima es un juicio propio y no una casilla. Es deliberado: las otras seis se
pueden cumplir con una aplicación que funciona y no sirve.

No se exige que reemplace toda apertura de los archivos Markdown: seguir
abriéndolos para leerlos o editarlos es esperable y no invalida el criterio.

## Plan general

No vinculante. Solo la próxima acción del frontmatter compromete algo.

1. Definir el alcance del prototipo de solo lectura.
2. Elegir el stack y registrar la decisión.
3. Construir el lector de archivos del repositorio.
4. Listados por entidad: categorías, capacidades, nodos, fuentes, herramientas,
   proyectos.
5. Búsqueda y filtros por los campos ya definidos en las decisiones.
6. Vista de relaciones: dependencias entre nodos, fuentes citadas, nodos
   requeridos por proyecto, herramientas por capacidad.
7. Uso real durante algunas semanas antes de evaluar el criterio de
   finalización.

El conocimiento que exigen las etapas 3 y 6 ya existe en `nodos/`:
`lectura-de-markdown-y-frontmatter` e `indice-de-entidades-y-relaciones`. El
primero ya está en `nodos_requeridos` porque bloquea la acción actual; el segundo
se incorporará cuando su etapa se convierta en la próxima acción.

## Bitácora

**2026-08-06 — Proyecto creado.**

El repositorio alcanzó una primera estructura funcional: tres decisiones de
metadata (`0001` nodos, `0002` fuentes, `0003` proyectos), una categoría
(`agentes-de-desarrollo`), un nodo y una fuente. Las tres entidades tienen
formato definido y al menos un caso real cada una —este proyecto es el primero
de la tercera—. No está completo: faltan contenido, dependencias entre nodos,
roadmaps y validaciones.

La primera acción es de alcance, no de código: sin un límite escrito, un
prototipo de solo lectura tiende a crecer hacia la edición antes de haber
demostrado que la consulta sirve.

**2026-08-07 — Alcance definido.**

Queda escrito qué problema resuelve el prototipo, qué entidades muestra, qué
consultas y relaciones permite, qué calcula sin almacenar, cómo trata las
entidades inválidas y con qué comprobaciones se considera terminado.

Dos límites que la definición fija y conviene recordar: la aplicación no
introduce reglas de negocio que las decisiones no tengan —de ahí que
`fecha_limite` solo se muestre y se ordene, sin niveles de urgencia—, y no asume
ningún dominio, para no romper el alcance multidominio de la visión.

La acción siguiente es elegir el stack y registrarlo como decisión. No requiere
aprender nada nuevo, y desbloquea la búsqueda de fuentes del nodo
`lectura-de-markdown-y-frontmatter`, que dependen de esa elección. Recién la
acción posterior, construir el lector, incorporará ese nodo a
`nodos_requeridos`.

**2026-08-07 — Stack elegido, proyecto bloqueado.**

El stack quedó elegido y registrado en la decisión `0004`: Python 3 con Flask,
HTML renderizado en el servidor, y la aplicación viviendo en `app/` dentro de
este mismo repositorio.

La próxima acción pasa a ser construir el lector de archivos del repositorio, y
`nodos_requeridos` incorpora por primera vez un nodo:
`lectura-de-markdown-y-frontmatter`.

Con eso el proyecto queda bloqueado mientras ese nodo siga en `pendiente`. Es el
primer caso real del puente entre los dos modos: lo que corresponde ahora no es
avanzar el proyecto sino aprender lo que la acción requiere.

**2026-08-07 — El modelo pasa a seis tipos de entidad.**

Se incorporaron `capacidades/` y `herramientas/`, definidas en las decisiones
`0005` y `0006`. Una capacidad expresa qué se necesita poder hacer; una
herramienta, con qué puede realizarse.

En consecuencia, el primer prototipo deberá leer, validar, indexar y mostrar
también esas dos entidades. El recomendador automático —elegir herramientas para
un objetivo, detectar huecos y proponer construir— continúa fuera del alcance.
