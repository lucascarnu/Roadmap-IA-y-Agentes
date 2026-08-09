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
   sistema y arbitraje técnico entre agentes.
3. **Ejecutor.** Implementa, prueba lo que puede probar y publica el trabajo para
   revisión.
4. **Reviewer independiente.** Responde si el cambio está bien construido.
5. **QA / Validación.** Responde si funciona realmente, ejecutándolo.
6. **Especialistas bajo demanda.** Product Design y UI/UX, seguridad, datos y
   otros, cuando el trabajo lo justifique.

Los roles son estables; **sus ocupantes, herramientas y entornos son
reemplazables**. Es el principio de reemplazabilidad de `0007`, aplicado a la
organización del trabajo.

## Nivel B — Asignación actual

Provisional, contextual y revisable. **Es un estado, no un requisito.**

- **Ejecutor principal:** Codex sobre Windows, candidato para el próximo tramo.
- **Reviewer independiente:** Claude, que además puede actuar como ejecutor
  alternativo.
- **Reviewer complementario:** Copilot Code Review sobre GitHub.
- **QA / Validación:** debe ocurrir en un entorno capaz de ejecutar realmente el
  comportamiento objetivo.
- **Product Design / UI/UX:** especialista bajo demanda, cuando haya interfaz.
- **Consultor externo opcional:** ChatGPT, fuera del camino crítico.

**Codex, Claude, Copilot, Windows y Python no son requisitos permanentes del
modelo.** Ninguno aparece en el Nivel A, y ninguno debería aparecer.

### Roles combinados durante el MVP

Codex sobre Windows puede ocupar **provisionalmente Arquitecto / Lead y Ejecutor
a la vez**, cuando el tamaño y el riesgo del cambio no justifiquen separar las
dos funciones. Separarlas siempre, en un proyecto de una persona y un MVP local,
agregaría coordinación sin agregar seguridad.

**La independencia se conserva donde importa: en la revisión y en la
validación.** Diseñar e implementar puede hacerlo el mismo agente; juzgar si el
resultado está bien construido y si funciona, no.

Es una asignación provisional y revisable por evidencia, como todo el Nivel B.

### Otros proveedores

Cualquier otro modelo o proveedor —por ejemplo Kimi— puede ocupar cualquiera de
los roles si la competencia, el acceso al entorno, el costo, la eficiencia o la
evidencia lo justifican. Se aplican los mismos criterios que a los ocupantes
actuales, sin trato preferencial ni exclusión previa.

Kimi hoy no tiene integración ni asignación en este proyecto. Se lo nombra para
dejar claro que la lista del Nivel B es un estado, no una lista cerrada de
candidatos admisibles.

### Servicios fuera del camino crítico

**Ningún servicio interactivo cuya disponibilidad no está garantizada puede ser
una dependencia obligatoria del circuito automático.** Aplica a ChatGPT y a
cualquier otro consultor externo.

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

## Independencia del revisor

Una segunda opinión que ya conoce la sospecha de la primera deja de ser
independiente: tiende a confirmarla en vez de mirar el resto.

- Al reviewer independiente se le entrega el problema, el cambio y la evidencia.
- **No se le adelantan los defectos que otro revisor sospecha.**
- Su resultado se congela antes de compararlo con el de los demás.
- Recién entonces se cruzan los hallazgos.

## Esfuerzo de la revisión complementaria

Política inicial para Copilot Code Review durante el MVP, revisable por calidad,
costo y latencia observados:

- **Balanced por defecto** al solicitar una review. Está disponible y es el valor
  configurado hoy a nivel de repositorio.
- **Lite**, disponible, queda para cambios triviales o mecánicos.
- **Max** figura como *Coming soon* y **todavía no está disponible**. Se reserva
  conceptualmente para arquitectura, seguridad, riesgo alto o cuando la evidencia
  indique que Balanced no alcanza, y esa reserva entra en vigor cuando GitHub lo
  habilite.

`Lite`, `Balanced` y `Max` son **modos de esfuerzo** de la revisión completa.
`Low` y `High` son **severidades de un hallazgo individual**. No son la misma
escala y confundirlas lleva a leer mal una review.

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

## Revisión y validación no son lo mismo

El reviewer responde *¿está bien construido?*; QA responde *¿funciona realmente?*
Los estados de evidencia de `reglas.md` fijan la consecuencia: un revisor que no
puede ejecutar el comportamiento objetivo **no puede declararlo VALIDADO
OPERATIVAMENTE**, por buena que sea su lectura del código.

## Intensidad proporcional al cambio

No corren todos los roles en cada pull request.

- **Cambio mecánico y pequeño:** ejecutor y sus pruebas pueden alcanzar.
- **Cambio normal:** se suma reviewer independiente.
- **Arquitectura, seguridad o riesgo alto:** revisión reforzada.
- **Interfaz:** Arquitecto define, UI/UX diseña, Ejecutor implementa, UI/UX
  verifica fidelidad y el reviewer técnico revisa el código.

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
escribió. El resto de `0007` sigue vigente, incluida la reemplazabilidad, que
esta decisión extiende.

## Costos conocidos

- Un modelo escrito en dos niveles obliga a mantener el Nivel B actualizado; si
  se desactualiza, describe un equipo que ya no existe.
- La independencia del revisor cuesta coordinación: hay que resistir la tentación
  de adelantarle lo que ya se sospecha.
- Delegar decisiones técnicas implica que algunas se van a tomar mal. El costo se
  acepta a cambio de no convertir al director en cuello de botella, y se acota
  con revisión independiente y con la reversibilidad como criterio.

## Queda abierto

- Hasta qué tamaño y riesgo sigue siendo razonable que Arquitecto / Lead y
  Ejecutor sean el mismo agente, y qué señal indicaría que conviene separarlos.
- Qué criterios objetivos por clase de riesgo habilitarían la integración
  automática.
- Cómo se registra la evidencia de rendimiento que sostiene o cambia una
  asignación.
