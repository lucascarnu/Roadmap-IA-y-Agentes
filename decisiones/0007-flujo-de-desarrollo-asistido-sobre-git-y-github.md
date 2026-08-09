# 0007 — Flujo de desarrollo asistido sobre Git y GitHub

- **Estado:** aceptada
- **Fecha:** 2026-08-08

## Contexto y problema

El proyecto está por empezar a construir código, y hasta ahora todo el trabajo
asistido ocurría dentro de una única sesión con un único agente. No existía un
lugar donde el trabajo de un ejecutor pudiera ser revisado por otro agente sin
que el usuario copiara mensajes de una ventana a otra.

Antes de elegir herramientas convenía fijar el sustrato, porque de él dependen
qué agentes pueden participar y con qué costo se los reemplaza. Un flujo atado a
un proveedor concreto obligaría a rehacerlo cuando ese proveedor cambie.

Se probó el circuito completo con tres pull requests temporales: Claude Code
publicó una rama y abrió la PR, GitHub Copilot Code Review la revisó, y Claude
leyó esa revisión mediante GitHub CLI. Las tres se cerraron sin integrar.

## Decisión

### Git y GitHub son la columna vertebral del workflow

Repositorio, ramas, commits y pull requests son el sustrato compartido de todo
el trabajo asistido. La pull request cumple además una segunda función: es el
**canal asíncrono entre agentes**, el lugar donde uno deja trabajo y otro deja
hallazgos, sin sesión compartida ni intermediación manual.

Markdown sigue siendo la fuente de verdad del proyecto, como `0004` ya
establece; Git la versiona y conserva su historial. GitHub es infraestructura
de transporte, coordinación y pull requests, y deja registrado el historial de
la conversación entre agentes; no pasa a ser el lugar donde vive el contenido.

### Ningún proveedor ni agente es arquitectónicamente obligatorio

Lo que queda fijado es el protocolo —rama, commit, pull request, revisión,
lectura de la revisión—, no quién lo ejecuta.

- **Claude Code es el ejecutor principal actual, y debe ser reemplazable.** Su
  posición hoy es una elección práctica, no una dependencia del diseño.
- **El revisor también debe ser reemplazable**, con el mismo criterio.
- Sustituir cualquiera de los dos no debería exigir cambiar el flujo, solo el
  agente que ocupa ese rol.

> **Superado por [0009](0009-modelo-operativo-de-desarrollo-con-ia.md).** La
> asignación de roles descrita arriba corresponde al momento de esta decisión.
> `0009` separa los roles de quién los ocupa y mantiene vigente el principio de
> reemplazabilidad.

Es el mismo principio de independencia que `0004` aplica a `app/`, aplicado
ahora al workflow: si el proceso empieza a depender de un proveedor concreto
para funcionar, se habrá violado esta decisión.

### GitHub Copilot Code Review como revisor complementario

Queda aceptado **actualmente** como revisión complementaria. No es autoridad
final ni diseñador principal: no decide qué se construye, no aprueba por sí
mismo y su silencio no equivale a validación.

- Los hallazgos del revisor **los evalúa el ejecutor**, que puede confirmarlos,
  matizarlos o descartarlos con fundamento.
- Ante un **desacuerdo material que no se resuelve con evidencia**, se escala al
  usuario en lugar de resolverlo por jerarquía entre agentes.
- Por ahora las revisiones **se solicitan manualmente**.

> **Precisado por [0009](0009-modelo-operativo-de-desarrollo-con-ia.md).** El rol
> pasó a llamarse revisión independiente de pull requests, y quien audita sus
> hallazgos y decide el cierre es el Arquitecto / Lead, no el ejecutor. Quién lo
> ocupa hoy está en [equipo.md](../equipo.md) y solo ahí. Lo demás de esta
> sección sigue vigente: no es autoridad final, no aprueba por sí mismo y su
> silencio no equivale a validación.

### Lo que no se activa todavía

No se habilita automatic code review, no se agrega branch protection adicional y
no se construye un harness multiagente propio.

Ninguna de las tres está descartada. Se agregan cuando exista una necesidad real
que las justifique, en línea con el principio de no anticipar complejidad. Hoy
el volumen de trabajo no la produce, y cada capa agregada antes de tiempo sería
configuración que hay que mantener sin problema que resuelva.

> **Superado en parte por [0008](0008-proteccion-server-side-de-main.md).** La
> branch protection sí se activó, cuando la autonomía del ejecutor produjo la
> necesidad que aquí faltaba. Automatic code review y el harness multiagente
> propio siguen sin activarse.

## Observaciones iniciales, no compromisos

Las pruebas dejaron dos mediciones. Se registran porque conviene no perderlas, y
se acotan porque provienen de unas pocas revisiones sobre documentos breves, en
condiciones que el proyecto no controla.

- **Latencia.** Se observaron entre 69 y 155 segundos entre solicitar una
  revisión y recibirla, sobre cuatro solicitudes: las tres pruebas y la pull
  request de esta misma decisión. Es una observación inicial, **no un SLA ni un
  valor fijo**, y puede variar con el tamaño del cambio, la carga del servicio o
  cambios del proveedor.
- **Costo.** GitHub mostró 20.16 AI Credits consumidos en total por las tres
  revisiones de prueba, y solo por ellas. Se registra como **medición inicial,
  no como costo fijo por review**. Dividirlo por tres para obtener un precio
  unitario sería leerlo mal: las tres revisiones no eran equivalentes entre sí.

Lo que ambas sí permiten afirmar es de otro orden: el intercambio es asíncrono y
su latencia se mide en decenas de segundos, no en horas. Eso alcanza para saber
que el flujo es utilizable sin bloquear el trabajo.

## Qué demostraron las pruebas y qué no

**Demostrado.** Claude Code puede publicar una pull request, Copilot puede
revisarla y Claude puede leer esa revisión directamente mediante GitHub CLI, sin
que el usuario transporte manualmente los mensajes entre agentes. El circuito
completo funciona.

**No demostrado.** La calidad de Copilot frente a bugs complejos de código. Las
tres pruebas fueron sobre documentos Markdown breves, con a lo sumo una
inconsistencia aislada y verificable. Nada de eso informa sobre su rendimiento
ante lógica concurrente, condiciones de borde o defectos repartidos entre
archivos.

El resultado justifica **usar Copilot como revisión complementaria**; no
justifica todavía ninguna afirmación sobre su calidad como revisor de código.
Esa evaluación continúa naturalmente con las pull requests reales del proyecto,
sin necesidad de pruebas dedicadas.

## Razones

- Git y GitHub ya eran necesarios para versionar el contenido. Usarlos también
  como canal entre agentes no agrega ninguna pieza nueva.
- La pull request deja el intercambio registrado y auditable, atado al commit
  exacto que se revisó. Una conversación en una sesión no deja esa constancia.
- Ser asíncrono es una ventaja, no una limitación: ningún agente necesita estar
  disponible al mismo tiempo que otro.
- Fijar el protocolo en lugar del proveedor es lo que hace barato el reemplazo,
  que es la única protección real frente a un mercado que cambia rápido.
- Copilot Code Review no agrega infraestructura: ya está disponible sobre el
  repositorio y su costo de prueba fue medible y bajo.

## Costos conocidos

- La revisión llega como `COMMENTED` y **no bloquea la integración**. Sin
  branch protection, un hallazgo válido puede pasar inadvertido si nadie lee la
  pull request. Es aceptado a cambio de no agregar todavía esa capa.
  *Superado por [0008](0008-proteccion-server-side-de-main.md): la capa existe, y
  un hilo de conversación sin resolver bloquea la integración.*
- Solicitar las revisiones a mano es un paso manual que puede olvidarse.
- Un revisor que ocasionalmente señala problemas inexistentes entrena a
  ignorarlo. Es un riesgo del rol complementario, y el motivo de que los
  hallazgos los evalúe el ejecutor en lugar de aplicarlos sin más.
- Las dos mediciones registradas envejecen. Sirven como orden de magnitud
  inicial y no deberían citarse como si siguieran vigentes.

## Queda abierto

- Cuándo y bajo qué criterio activar automatic code review. *La branch protection
  ya se activó; ver [0008](0008-proteccion-server-side-de-main.md).*
- Si Claude Code, Copilot Code Review y GitHub CLI deben registrarse como
  entidades en `herramientas/` bajo la capacidad `desarrollo-asistido-por-ia`.
- Cómo se registra la experiencia acumulada con el revisor a medida que aparezca
  en pull requests reales.
- Qué otros agentes pueden ocupar los roles de ejecutor y revisor.
