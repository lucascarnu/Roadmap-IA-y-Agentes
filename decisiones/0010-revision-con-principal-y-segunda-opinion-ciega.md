# 0010 — Revisión con reviewer principal y segunda opinión ciega

- **Estado:** aceptada
- **Fecha:** 2026-08-10

## Contexto y problema

`0009` fija que el Reviewer independiente responde si un cambio está bien
construido, y que su indisponibilidad no habilita saltear el gate. Lo que no fija
es **cuántos reviewers corren, cuándo, y quién resuelve si no coinciden**.

Tres hechos hacen que eso ya no pueda quedar sin definir:

- El ocupante asignado del rol dejó de poder ejecutar por cuota durante cuatro
  pull requests consecutivas, y el circuito siguió gracias a que el director
  transportaba paquetes a mano. Eso es exactamente lo que el circuito automático
  existe para eliminar.
- Las dos corridas completas registradas en el Reviewer Benchmark v1 produjeron
  cada una **un hallazgo material incorrecto que afectó la decisión**. Un solo
  reviewer, por bueno que sea, emite falsos positivos materiales.
- Nada de lo que hay hoy permite detectar el error opuesto: un `APPROVE` que
  dejó pasar algo material. Un reviewer que solo se consulta cuando ya encontró
  algo nunca revela lo que no encontró.

El riesgo de sobrecorregir es real. Correr dos reviewers siempre duplica costo y
latencia para el caso común, que es el cambio sin materialidad.

## Decisión

**Un solo pipeline, con tres perillas.** No hay una arquitectura de calibración y
otra de operación: hay la misma, configurada distinto. Las perillas son:

- **`principal`** y **`shadow`** — identificadores intercambiables. La
  arquitectura no nombra proveedores.
- **`shadow_trigger`** — `always`, o la combinación de `material`, `muestreo` y
  `riesgo`.
- **`publish`** — `none` o `consolidada`.

La fase de calibración es `shadow_trigger=always` con `publish=none`. La
operación normal es `shadow_trigger=material|muestreo|riesgo` con
`publish=consolidada`. **Terminar la calibración es cambiar una variable**, no
borrar código, que es lo que hace que la fase sea realmente eliminable.

### Cuándo corre el shadow

En operación normal, el reviewer principal revisa el 100% de las pull requests
elegibles. El shadow corre solo si se cumple alguna de estas tres condiciones:

1. **Gate material.** El principal emitió al menos un hallazgo de impacto M1 o
   M2.
2. **Muestreo.** El principal no emitió materialidad y `número de pull request
   mód 5 == 0`. Es determinista, auditable y no necesita estado; un muestreo
   aleatorio no controlaría ningún riesgo adicional.
3. **Riesgo declarado.** El diff toca permisos, credenciales, workflows de
   integración continua o infraestructura de ejecución. La lista se mantiene
   corta a propósito: si todo es de alto riesgo, la categoría no discrimina nada.

El muestreo es lo único que puede detectar **falsos negativos** del principal, y
por eso no se elimina cuando el sistema parece estable: se espacia.

### Estatus del shadow: capacidad medida, no gate de integración

Esta decisión describía **cuándo corre** el shadow, pero no decía **qué pasa cuando no
corre**. `0013` define el gate de integración remitiendo a "la revisión independiente
exigida por las reglas vigentes", y `0014` remite a esta decisión para todo lo relativo
al shadow. Ese triángulo admitía dos lecturas razonables: que el shadow formaba parte
del gate, o que era una capacidad del pipeline. La práctica posterior del proyecto no lo
aplicó como gate de forma sistemática, y sobre las mismas reglas distintos agentes
resolvieron la ambigüedad de manera distinta.

Es una ambigüedad real del texto, no un malentendido de quien lo leyó. Por eso se
resuelve de forma explícita y **hacia adelante**: lo ya ocurrido no se reinterpreta.

- El **reviewer independiente** —el rol que fija `0009` y que esta decisión instancia
  como `principal`— es el **gate ordinario de revisión**, y sigue siendo obligatorio
  donde el canon ya lo exige.
- **La ausencia de shadow, por sí sola, no bloquea la integración.**
- **La ausencia de shadow no constituye un hallazgo M1 ni M2, ni un defecto técnico**,
  ni de la unidad ni del circuito, y no se registra como tal.
- Los hallazgos **M1 o M2 materiales siguen bloqueando**, exactamente como fija la regla
  de fusión, y vengan del reviewer que vengan.
- **QA y las verificaciones reforzadas de la clase Riesgo declarado de `0014` quedan
  intactas.** Esta sección no toca ningún piso de verificación.
- El shadow queda como **capacidad**: segunda opinión cuando aporta señal, medición, y
  evaluación del reviewer principal.
- El **muestreo** puede seguir usándose para detectar falsos negativos del principal.
  Que no corra, o que su ocupante no esté disponible, **no convierte una pull request en
  no integrable**.
- Cuando exista una **razón observable** para pensar que una segunda opinión habría
  aportado señal en una unidad concreta, se registra como evidencia, **sin bloquear esa
  unidad**, para poder evaluar más adelante si el shadow merece una función más fuerte.

Nada de esto contradice a `0009`. Su regla de que la indisponibilidad de un revisor
nunca cuenta como aprobación, y de que un gate obligatorio que no puede cubrirse detiene
el circuito de forma segura, sigue rigiendo con toda su fuerza **para el reviewer
independiente y para QA**, que son los gates obligatorios. Lo que esta sección fija es
que el shadow no es uno de ellos.

Tampoco decide otras tres cosas, que siguen abiertas y se tratan por separado: los
disparadores del shadow, el cierre de la calibración, y con qué evidencia el shadow
podría ascender a una función más fuerte.

### La segunda opinión es ciega

El shadow recibe el mismo HEAD, el mismo material permitido y las mismas reglas.
**No recibe nada de la review del principal**: ni hallazgos, ni títulos, ni
severidades, ni la decisión, ni pista alguna sobre qué archivo o línea disparó el
gate. Revisa desde cero.

Una segunda opinión que conoce la sospecha de la primera tiende a confirmarla. Es
el mismo principio de independencia que `0009` ya aplica al reviewer.

### Las dos reviews se funden con una regla determinista

Cuando hay dos reviews, **no se las hace discutir**. Se aplica la misma regla de
decisión que `0009` fija para una sola, sobre la unión de sus hallazgos:

- bloquea si existe un hallazgo de impacto M1 o M2 con evidencia `SETTLED` y
  anclaje válido, **venga del reviewer que venga**;
- si dos hallazgos apuntan al mismo archivo y línea con severidad distinta,
  **gana la más alta**;
- un hallazgo material sin evidencia suficiente no bloquea y se publica como
  pregunta abierta.

**Coincidir no prueba que algo sea cierto, y ser exclusivo no prueba que sea un
error.** Por eso la fusión no pondera por acuerdo: pondera por evidencia, que es
lo único verificable.

### Desacuerdo persistente

No se fuerza consenso. Si queda un hallazgo material sin resolver, el sistema
**no emite `APPROVE`**: publica el estado no aprobatorio equivalente, registra el
desacuerdo y sigue. El sesgo por defecto es conservador y automático.

Se escala a una persona en tres casos, y solo en tres: el caso no puede
resolverse con la evidencia accesible; hay riesgo irreversible, de seguridad o de
credenciales; o el mismo tipo de desacuerdo material se repite y revela un
problema sistémico en vez de un caso difícil.

### Publicación única

Ningún reviewer publica por su cuenta. Sale **una sola review consolidada**, y es
concisa. La trazabilidad completa —ambas reviews en crudo, la fusión, la
telemetría— queda en artefactos de la corrida, no en el cuerpo visible.

La consolidada se publica **sin comentarios inline**. Cada comentario inline crea
un hilo de conversación, y el ruleset de `0008` exige resolver todos los hilos
antes de integrar: con inline, cada pull request con hallazgos quedaría esperando
que una persona resuelva hilos uno por uno. Los anclajes van como texto dentro
del cuerpo. Es la diferencia entre una intervención humana y varias.

### Esquema común

Ambos reviewers usan el esquema del Reviewer Benchmark v1: impacto `M1`/`M2`/
`M3`/`O`, estado de evidencia, origen de evidencia, `path`, `line`, título,
descripción, solicitud de verificación y decisión preliminar. **No se crean
formatos por proveedor**: sin un esquema común la fusión determinista sería
imposible y la comparación no significaría nada.

### Elección del reviewer principal

Se decide por evidencia acumulada durante la calibración, con este orden de
prioridad: falsos positivos materiales; omisiones materiales que el otro
reviewer sí detectó; hallazgos materiales exclusivos confirmados después;
necesidad de intervención; confiabilidad operacional; latencia; consumo
observable.

**No se construye un score.** Si ninguno domina en los tres primeros criterios,
la elección la toma el director sobre la evidencia registrada, y queda
documentada con esa evidencia.

### Detección de deriva

El muestreo sigue corriendo después de elegir principal. Se abre una
reevaluación cuando aparecen **dos omisiones materiales del principal dentro de
las últimas diez corridas con shadow**, o dos fallos operativos del principal en
esa misma ventana.

Un incidente aislado no reabre la calibración. La reevaluación tampoco significa
volver a dual permanente: significa volver a `shadow_trigger=always` por una
ventana acotada.

## Razones

- Correr dos reviewers siempre es la opción cara y no controla ningún riesgo que
  el gate más el muestreo no controlen: el caso común es el cambio sin
  materialidad, y ahí la segunda opinión casi nunca cambia el resultado.
- Un gate que solo se activa ante materialidad es ciego a los falsos negativos.
  El muestreo cubre ese punto ciego con un costo bajo y fijo.
- La ceguera del shadow es lo único que hace que su coincidencia signifique algo.
  Sin ella, la segunda opinión mide sugestión y no calidad.
- La fusión determinista mantiene la decisión en la capa que sí es verificable, y
  no en la deliberación de un modelo.

## Simplificaciones deliberadas

Dos capas del diseño original se eliminaron. Se registran porque no reaparezcan
por inercia es parte de la decisión.

**Sin ronda de adjudicación cruzada.** La propuesta incluía devolver las
discrepancias a ambos reviewers para que confirmaran, retiraran o cambiaran
severidad, en hasta dos rondas. Se descarta: el shadow es ciego, así que cuando
no menciona un hallazgo del principal **no lo está refutando, simplemente no lo
encontró**, y el silencio no es contraevidencia. Devolverle a un reviewer su
propio hallazgo señalando que el otro no lo vio es un empujón a retirarlo, que es
el sesgo de confirmación al revés. Además duplica llamadas y agrega un modo de
falla —análisis huérfano sin veredicto— para un caso que la fusión determinista
ya resuelve de forma conservadora. Queda como candidata a reevaluar solo si la
salida fusionada resulta ruidosa en la práctica.

**Sin harness separado de calibración.** La fase dual no es una arquitectura
distinta: es este mismo pipeline con `shadow_trigger=always` y `publish=none`.
Construir dos circuitos para tirar uno después habría sido trabajo destinado a la
basura, y habría hecho que la fase fuera difícil de terminar en vez de fácil.

## Costos conocidos

- Un hallazgo material bloquea la integración hasta que una persona lo atienda.
  Es intencional, pero significa que el sistema no queda enteramente sin
  intervención humana: queda sin intervención **rutinaria**.
- El muestreo gasta en pull requests donde probablemente no había nada. Es el
  precio de poder afirmar algo sobre los falsos negativos, y sin él esa
  afirmación no existiría.
- La fusión determinista puede publicar dos hallazgos parecidos con títulos
  distintos cuando ambos reviewers detectan lo mismo por caminos diferentes. Se
  acepta: deduplicar por semántica exigiría otro modelo, y equivocarse ahí sería
  peor que la redundancia.
- La ventana de calibración retrasa la operación normal. Es un costo por única
  vez.

## Relación con 0009

`0009` sigue siendo el modelo: define el rol, la independencia, cuándo una review
cuenta y la convergencia. Esta decisión no lo supera; **fija cómo se instancia
ese rol cuando hay más de un reviewer disponible**, que es lo que `0009` dejaba
abierto.

Que los ocupantes concretos de `principal` y `shadow` cambien no altera nada de
lo escrito acá: son identificadores, y su asignación vigente vive en `equipo.md`.

## Desacople del MVP

Todo esto pertenece al proceso de desarrollo, no al producto. Vive en workflows y
artefactos de integración continua, y **borrarlo entero no debe tocar una sola
línea de la aplicación**. La misma condición que `0004` le impone a `app/`,
aplicada en el sentido inverso.

## Queda abierto

- Qué reviewers ocupan `principal` y `shadow`. Lo decide la calibración.
- Cuántas pull requests sustantivas necesita la calibración. Se propone cinco, con
  un máximo de diez antes de decidir con la evidencia disponible aunque no haya
  señal clara: alargarla indefinidamente sería no decidir.
- Si el muestreo puede espaciarse a una de cada diez, y con qué evidencia.
- Si la deduplicación de hallazgos equivalentes llega a hacer falta.
- Con qué evidencia acumulada el shadow podría pasar de capacidad medida a una
  función más fuerte, y qué datos mínimos habría que registrar para poder
  decidirlo. No se fija ningún umbral acá: fijarlo sin evidencia sería inventar
  una regla en vez de derivarla.
