# 0009 — Modelo operativo de desarrollo con IA

- **Estado:** aceptada
- **Fecha:** 2026-08-08

## Contexto y problema

`0007` fijó el sustrato del trabajo asistido —Git, GitHub, la pull request como
canal entre agentes— y nombró a Claude Code como ejecutor y a Copilot como
revisor complementario. Lo que no fijó es **quién decide qué**: cuándo un agente
resuelve solo, cuándo consulta, qué puede declarar por su cuenta y qué necesita
otro entorno para demostrarse.

Esa ausencia se volvió costosa al aumentar la autonomía del ejecutor, y se vuelve
crítica ahora que el ejecutor puede cambiar. Un agente nuevo que llega al
repositorio no tiene forma de saber qué se espera de él.

El error a evitar es escribir el modelo alrededor de las herramientas actuales.
Una decisión que diga "Claude revisa y Codex ejecuta" hay que reescribirla entera
cada vez que cambia una herramienta, y con ella se pierde el criterio.

## Decisión

El modelo se escribe en **dos niveles separados**: las funciones, que son
relativamente estables, y quién las ocupa hoy, que es provisional.

## Nivel A — Roles

Neutrales respecto de proveedor. Describen responsabilidades, no productos.

1. **Director / Product Owner.** Define intención, prioridades, experiencia
   buscada, restricciones, presupuesto y tolerancia al riesgo. Conserva el veto.
2. **Arquitecto / Lead.** Autoridad técnica delegada: diseño, coherencia del
   sistema y arbitraje técnico entre agentes. **Recibe la implementación, sus
   pruebas y los hallazgos de la revisión, los audita en conjunto y decide** si
   hay que corregir, si la unidad de trabajo puede cerrarse o si corresponde
   entregar la siguiente tarea al ejecutor.
3. **Ejecutor.** Implementa, prueba lo que puede probar y publica el trabajo para
   revisión.
4. **Reviewer independiente.** Responde si el cambio está bien construido,
   revisando lo ya publicado en la pull request y produciendo hallazgos. **Eso es
   todo lo que hace**: no define tareas, no decide arquitectura, no coordina al
   ejecutor, no implementa, no ejecuta QA y no decide el cierre de una unidad de
   trabajo.
5. **QA / Validación.** Responde si funciona realmente, ejecutándolo.
6. **Consultor / Auditor de Continuidad y Coherencia.** Detecta y reconcilia
   huecos transversales y emite hallazgos o propuestas para arbitraje. No
   implementa, no decide arquitectura, no ocupa los roles de Arquitecto,
   Ejecutor ni Reviewer independiente, no integra ni tiene autoridad de merge,
   y no crea gates por sí mismo. Su participación es selectiva: no es
   obligatoria en toda pull request.
7. **Especialistas bajo demanda.** Product Design y UI/UX, seguridad, datos y
   otros, cuando el trabajo lo justifique.

Los roles son estables; **sus ocupantes, herramientas y entornos son
reemplazables**. Es el principio de reemplazabilidad de `0007`, aplicado a la
organización del trabajo.

## Nivel B — Quién ocupa cada rol

**La asignación vigente vive en [equipo.md](../equipo.md), y solo ahí.** No se
enumera en esta decisión, a propósito: cambiar de ocupante es un cambio de
estado, y no debería obligar a reescribir un documento estructural.

Ninguna herramienta, modelo, proveedor, sistema operativo ni lenguaje concreto es
requisito permanente del modelo. Ninguno aparece en el Nivel A, y ninguno debería
aparecer. **La lista de ocupantes es un estado, no una lista cerrada de
candidatos admisibles**: cualquier proveedor puede ocupar cualquier rol si lo
justifican los criterios de abajo, sin trato preferencial ni exclusión previa.

### Roles combinados

Arquitecto / Lead y Ejecutor pueden recaer **provisionalmente en el mismo
ocupante**, cuando el tamaño y el riesgo del cambio no justifiquen separar las
dos funciones. Separarlas siempre, en un proyecto de una persona y un MVP local,
agregaría coordinación sin agregar seguridad.

**La independencia obligatoria es la del Reviewer independiente y la de QA cuando
participan.** Diseñar e implementar puede hacerlo el mismo ocupante; juzgar si el
resultado está bien construido o si funciona corresponde a roles que no deben
recaer en quien lo implementó.

La proporcionalidad puede omitir esos dos roles en cambios pequeños, y conviene
decirlo sin adornos: en esos casos **no hay juicio independiente**, solo el gate
de cierre del Arquitecto / Lead, que puede ser el mismo ocupante que implementó.
Es un intercambio deliberado, no una garantía. Si un cambio no tolera quedarse sin
juicio independiente, entonces no es un cambio pequeño.

### Servicios fuera del camino crítico

**Ningún servicio interactivo cuya disponibilidad no está garantizada puede ser
una dependencia obligatoria del circuito automático.** Aplica a cualquier
servicio externo de consulta.

Si ese servicio no está disponible, el circuito continúa, siempre que los gates
obligatorios puedan satisfacerse con los ejecutores, revisores y pipeline
autorizados. Lo que **no** se hace es saltear un gate obligatorio porque quien
solía cubrirlo no responde: o existe un reemplazo que lo cubre, o el circuito se
detiene de forma segura.

### Cómo se decide una asignación

Por competencia demostrada para la tarea, acceso al entorno necesario, capacidad
de producir evidencia, calidad, eficiencia, costo y rendimiento observado. No por
marca ni por costumbre.

### Cuándo se reevalúa

Ante cambios de plataforma objetivo, sistema operativo, stack, tipo de proyecto,
capacidades de los modelos, herramientas disponibles, costos o evidencia
acumulada. Un proyecto Linux, Android, iOS o cloud puede requerir una asignación
completamente distinta **sin que cambie el Nivel A**.

## Autoridad y escalación

**El director no es árbitro técnico por defecto.** Consultarlo por cada elección
técnica convierte su autoridad final en un cuello de botella y desperdicia la
razón de delegar.

- Las decisiones técnicas **rutinarias y reversibles** las toman los agentes, sin
  consultar.
- Cuando existe una opción **claramente superior**, el agente decide, lo deja
  documentado y sigue.
- Cuando existen **alternativas materiales genuinamente razonables**, se presenta
  A y B con ventajas, desventajas y una recomendación explícita. Una lista de
  opciones sin recomendación traslada el trabajo en vez de resolverlo.
- Las decisiones de **producto y preferencia** son del director.

**La autoridad final no implica infalibilidad técnica.** Si el director elige algo
técnicamente mal fundado, el agente **debe objetar y explicar por qué**; asentir
no es colaborar. Si el director comprende el trade-off y sostiene su decisión, se
respeta y se ejecuta, salvo riesgo de seguridad u otro límite fuerte.

Entre agentes, un desacuerdo se resuelve primero con evidencia, pruebas y
documentación. Solo se escala al director un desacuerdo material que la evidencia
no resolvió, o una decisión de producto.

### Enmiendas técnicas basadas en evidencia

El director decide **qué** se construye y bajo qué restricciones materiales. El
Arquitecto / Lead decide **cómo**, y eso incluye poder **enmendar reglas y
decisiones técnicas ya escritas** cuando aparece evidencia de que una regla
bloquea un requisito real, agrega complejidad innecesaria, quedó obsoleta,
contradice una decisión posterior o fuerza una solución peor que una alternativa
demostrada.

Esa enmienda **no requiere aprobación previa** mientras preserve la intención y
las restricciones materiales. A cambio exige:

- que quede trazable en Git y en la pull request;
- que explicite qué evidencia la motivó;
- que pase revisión independiente cuando corresponda;
- que se informe después qué cambió, por qué, con qué evidencia y con qué
  impacto.

Se escala al director, en vez de enmendar por cuenta propia, cuando el cambio
afecta producto, alcance material, costo relevante, privacidad, seguridad
aceptada, algo irreversible, o una preferencia genuina que la evidencia no puede
resolver.

Sin esta regla, cada corrección puramente técnica de un documento canónico
necesitaría una ronda con el director: el cuello de botella que delegar buscaba
evitar.

## Independencia del revisor

Una segunda opinión que ya conoce la sospecha de la primera deja de ser
independiente: tiende a confirmarla en vez de mirar el resto.

- Al reviewer independiente se le entrega el problema, el cambio y la evidencia.
- **No se le adelantan los defectos que otro revisor sospecha.**
- Su resultado se congela antes de compararlo con el de los demás.
- Recién entonces se cruzan los hallazgos.

## Coordinación de revisiones

**Una demora fija no es un mecanismo de coordinación.** Esperar "un rato" acopla
el circuito a una latencia que nadie controla: si el servicio tarda más, se lee
un estado incompleto; si tarda menos, se desperdicia tiempo.

- Avanzar por **estado observable** siempre que sea posible.
- Como punto de partida es aceptable consultar el estado con un timeout y
  reintentos razonables, sin polling agresivo.
- La evolución natural es pasar a un esquema **basado en eventos**, con GitHub
  Actions o webhooks, si la evidencia justifica esa complejidad. No antes.

**Una review vale para el commit que revisó.** Antes de considerarla válida, se
verifica que corresponda al HEAD actual. Si hubo cambios materiales después, se
solicita una revisión nueva o se revalida el HEAD nuevo, según corresponda: una
review sobre un commit anterior no dice nada sobre el código que se va a
integrar.

### Cuándo una review cuenta

Que exista un registro de review no prueba que haya habido revisión. Para contar
como revisión independiente hacen falta tres cosas a la vez:

- que corresponda al **HEAD** que se va a integrar;
- que el reviewer **haya podido ejecutarla realmente**;
- que se procesen sus **tres canales**: el cuerpo de la review, los comentarios
  inline y los comentarios suprimidos.

Ninguna señal aislada alcanza para declarar una review limpia: ni "0
comentarios", ni la ausencia de comentarios inline, ni la ausencia de suprimidos,
ni la mera existencia de una entrada de review. Una revisión puede registrarse
sobre el commit correcto y **no haberse ejecutado** —por cuota, por
indisponibilidad o por un error del servicio—, y a veces eso solo es legible en
el cuerpo. Una revisión que no se ejecutó no es una revisión sin hallazgos.

### Convergencia

Una pull request no se prolonga indefinidamente por rondas de revisión. Manda la
materialidad:

- un cambio **material** del HEAD exige revalidación independiente;
- los hallazgos **no bloqueantes** se registran y no reabren la pull request;
- cuando el delta es cerrado y el reviewer conserva el contexto completo de lo ya
  revisado, alcanza una **revalidación acotada** de ese delta en lugar de una
  revisión completa desde cero;
- la indisponibilidad del reviewer **nunca** cuenta como aprobación.

Un delta que modifica precisamente el objeto de un hallazgo abierto —incluida
una corrección destinada a resolverlo— es **material respecto de ese hallazgo**.
Que los demás artefactos de la unidad permanezcan byte a byte idénticos no
traslada automáticamente al objeto cambiado la validez de la review anterior:
ese objeto debe ser revalidado por un reviewer independiente antes de cerrar el
hallazgo, salvo que una regla canónica más específica disponga otra cosa.

Esto no obliga a repetir trabajo cuando el objeto relevante permanece
materialmente idéntico. Ante duda razonable sobre su materialidad, se solicita
re-review.

## Revisión y validación no son lo mismo

El reviewer responde *¿está bien construido?*; QA responde *¿funciona realmente?*
Los estados de evidencia de `reglas.md` fijan la consecuencia: un revisor que no
puede ejecutar el comportamiento objetivo **no puede declararlo VALIDADO
OPERATIVAMENTE**, por buena que sea su lectura del código.

## Intensidad proporcional al cambio

No corren todos los roles en cada pull request.

- **Cambio mecánico y pequeño:** pueden omitirse el reviewer independiente y QA;
  alcanzan el ejecutor y sus pruebas.
- **Cambio normal:** se suma reviewer independiente.
- **Arquitectura, seguridad o riesgo alto:** revisión reforzada.
- **Interfaz:** Arquitecto define, UI/UX diseña, Ejecutor implementa, UI/UX
  verifica fidelidad y el reviewer técnico revisa el código.

Lo que la proporcionalidad omite son **roles adicionales, no la decisión de
cierre**. El Arquitecto / Lead recibe siempre la evidencia disponible —más o
menos según el caso— y decide. En un cambio pequeño eso es leer el diff y sus
pruebas, no convocar a nadie más.

El mismo criterio se aplica a la **intensidad de la revisión automática**: se
gradúa según tamaño y riesgo del cambio. Qué niveles ofrece la herramienta que
ocupe el rol, cuáles están disponibles y cómo se configuran son datos operativos
suyos, no del modelo, y se registran junto al resto de su evidencia.

## Aprendizaje del director

El aprendizaje del director es **selectivo y asincrónico**: se apoya en observar
decisiones reales, preguntar y revisar evidencia, no en clases previas que
bloqueen la ejecución. Que el director todavía no domine una parte del stack no
es motivo para frenar el trabajo.

## Integración

**El merge manual no es un principio del modelo.** Puede automatizarse cuando
existan garantías objetivas suficientes.

La intervención humana se reserva para riesgo alto, producción, datos sensibles,
costos relevantes, decisiones de producto, cambios irreversibles y desacuerdos
materiales.

Que hoy `gh pr merge` esté denegado es el estado de **una política candidata de
un ejecutor concreto**, no una regla de este modelo.

## Relación con 0007

Supera la asignación de roles de `0007`, que describía el momento en que se
escribió, y también el punto que asignaba al ejecutor la evaluación de los
hallazgos de la revisión: auditarlos y decidir el cierre de la unidad de trabajo
corresponde al Arquitecto / Lead. El resto de `0007` sigue vigente, incluida la
reemplazabilidad, que esta decisión extiende.

## Costos conocidos

- Un modelo escrito en dos niveles obliga a mantener el Nivel B actualizado; si
  se desactualiza, describe un equipo que ya no existe.
- La independencia del revisor cuesta coordinación: hay que resistir la tentación
  de adelantarle lo que ya se sospecha.
- Delegar decisiones técnicas implica que algunas se van a tomar mal. El costo se
  acepta a cambio de no convertir al director en cuello de botella, y se acota
  con revisión independiente —cuando participa— y con la reversibilidad como
  criterio.

## Queda abierto

- Hasta qué tamaño y riesgo sigue siendo razonable que Arquitecto / Lead y
  Ejecutor sean el mismo agente, y qué señal indicaría que conviene separarlos.
- Cómo se registra la evidencia de rendimiento que sostiene o cambia una
  asignación.
