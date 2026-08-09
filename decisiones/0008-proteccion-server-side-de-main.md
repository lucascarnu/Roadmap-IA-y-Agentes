# 0008 — Protección server-side de `main`

- **Estado:** aceptada
- **Fecha:** 2026-08-08

## Contexto y problema

`0007` decidió no agregar branch protection todavía, por no haber una necesidad
que la justificara. Esa condición cambió al instalar una política de permisos que
autoriza al ejecutor a publicar ramas sin intervención humana.

El problema quedó demostrado durante esa instalación. Las reglas de permisos de
un ejecutor son **coincidencia de patrones sobre el texto de un comando**, no
comprensión de la operación. Cada ronda de revisión encontró una variante nueva
que la lista anterior no cubría: force push, refspec con `+`, borrado por
`--delete`, borrado por refspec, `--mirror`, `--prune`, y la forma totalmente
calificada `refs/heads/main`, que esquivaba los patrones escritos para `main`.

No es mala suerte ni descuido: mientras un patrón termine en comodín, absorbe
cualquier argumento que venga después, incluidos los que todavía no existen. Una
denylist local no tiene estado final.

## Decisión

**La integridad de `main` no depende de patrones locales del ejecutor.** Se apoya
en una regla del servidor, que se aplica sobre la referencia y no sobre el texto
del comando, y que por lo tanto no se puede evadir reescribiendo la invocación.

**GitHub Pro** es la condición que permitió activar rulesets sobre este
repositorio privado.

### Configuración observada

Verificada en la interfaz de GitHub al 2026-08-08:

- **Nombre:** `Proteger main`
- **Estado:** Active
- **Target:** solo la rama por defecto, `main`
- **Bypass list:** vacía
- **Restrict deletions:** activo
- **Block force pushes:** activo
- **Require a pull request before merging:** activo
- **Required approvals:** 0
- **Require conversation resolution before merging:** activo
- **Require linear history:** activo
- **Métodos de merge permitidos:** solo Squash
- **Required status checks:** ninguno
- **Automatic Copilot review:** no habilitado

No se activó ninguna otra regla, y no se afirma nada sobre reglas no observadas.

### Alcance de lo que se afirma

La lista anterior describe **qué está configurado**, no cómo se comporta cada
opción ante cada forma de comando. La semántica exacta —por ejemplo, si
*Restrict deletions* alcanza toda forma de refspec de borrado— no fue verificada
contra documentación oficial de GitHub ni por prueba, y queda pendiente.

Lo que sí está **PROBADO LOCALMENTE** por la pull request #9:

- una conversación de review sin resolver deja la pull request en
  `mergeStateStatus: BLOCKED`, y el merge no se ofrece;
- al resolver todos los hilos, el estado pasa a `MERGEABLE` / `CLEAN` y la
  integración por squash queda disponible.

## Razones

- **Approvals en 0.** Exigir aprobaciones no aportaría hoy: el equipo es una
  persona y los revisores son agentes que comentan, no aprueban. La pull request
  sigue siendo obligatoria, que es lo que fuerza el punto de revisión.
- **Conversation resolution activo.** Es la garantía barata de que un hallazgo de
  review no se integre sin haber sido leído. `0007` aceptaba ese riesgo por no
  tener la capa; ahora la tiene.
- **Historial lineal y solo squash.** Formalizan lo que el repositorio ya venía
  haciendo: un commit por pull request, sin merge commits.
- **Target solo la rama por defecto.** Las ramas de trabajo son efímeras y
  existen también en local, así que su pérdida es recuperable. Extender el
  ruleset a todas las ramas tendría además un efecto a comprobar: podría impedir
  el borrado de ramas ya integradas, que es parte del ciclo normal. Ese efecto se
  deduce del nombre de la opción y **no está verificado**, así que pesa como
  riesgo y no como impedimento demostrado.
- **Bypass vacío.** Una lista de excepciones convierte la barrera en una
  convención. Sin excepciones, aplica también a quien administra el repositorio.

## Relación con 0007

Supera el punto de `0007` que declaraba que no se agregaba branch protection.
El resto de `0007` sigue vigente.

## Costos conocidos

- Las ramas distintas de `main` no están protegidas. Su borrado o reescritura
  dependen de guardarraíles locales, que son los que esta decisión declara
  insuficientes como única defensa.
- `Require conversation resolution` agrega un paso manual al circuito: los hilos
  se resuelven en la interfaz de GitHub, y el ejecutor no puede hacerlo sin
  permisos de API que hoy no tiene.
- La configuración vive en GitHub, no en el repositorio. Este documento es su
  única constancia versionada y puede quedar desactualizado si alguien la cambia
  sin actualizarlo.

## Queda abierto

- Verificar la semántica de cada regla del ruleset contra documentación oficial,
  registrando la fuente según `0002`.
- Decidir si el ruleset debe extenderse a las ramas de trabajo, y con qué reglas.
  Antes hay que comprobar si *Restrict deletions* sobre todas las ramas impide la
  limpieza posterior a la integración: es el riesgo principal de esa extensión y
  hoy es una suposición, no un resultado.
