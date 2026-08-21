# 0014 — Clases de cambio y verificaciones exigidas

- **Estado:** aceptada
- **Fecha:** 2026-08-13

## Contexto

El gate de integración de `0013` exige completar las verificaciones de cada
clase de cambio y QA cuando sea obligatorio para esa clase. `0009` ya gradúa la
intensidad de los roles según materialidad y riesgo, pero faltaba concretar el
piso verificable de cada nivel.

## Decisión

### Clases de cambio

Se reutiliza la escala de `0009`:

- **Mecánico.** Cambio pequeño y reversible que no introduce ni modifica
  comportamiento ni normativa: correcciones de redacción, formato, renombres o
  actualización de un dato ya verificado en otra parte del canon.
- **Normal.** Cambio que introduce o modifica comportamiento ejecutable o
  contenido normativo, sin tocar las áreas de riesgo declarado.
- **Riesgo declarado.** El diff toca permisos, credenciales, workflows de
  integración continua o infraestructura de ejecución del circuito. Esta lista
  es la definida en `0010` y no se amplía acá.

El Arquitecto / Lead declara la clase al emitir la unidad, conforme a su
autoridad de clasificación de materialidad en `0009`, y la comprueba al cierre
contra el diff real.

Si un cambio combina clases, prevalece la exigencia material más fuerte que
toque cualquier parte del diff. La pull request no se fragmenta por clase ni se
promedian sus exigencias: una sola línea de riesgo declarado hace que toda la
unidad se verifique como riesgo declarado.

### Verificaciones mínimas

Todas las clases comparten este piso:

- diff leído contra el HEAD exacto que se va a integrar;
- `git diff --check` limpio;
- los enlaces y anclas que el cambio introduce resuelven a un destino existente.

Cada clase suma:

- **Mecánico:** sólo el piso común. Reviewer independiente y QA pueden omitirse
  por la proporcionalidad de `0009`, salvo que una obligación temporal vigente
  los exija igualmente.
- **Normal:** piso común, batería automatizada del subsistema tocado ejecutada
  sobre el HEAD exacto con comando y resultado exactos, y reviewer independiente.
- **Riesgo declarado:** todo lo exigido para Normal, más evidencia observada de
  la vía, el permiso o la credencial afectados antes y después del cambio cuando
  el cambio pueda alterarlos, y una declaración explícita de lo que quedó sin
  probar.

Quien ejecuta una verificación es quien la informa. Si el auditor o el reviewer
no pudieron ejecutarla, lo declaran y no la presentan como verificación propia;
la ejecución sigue contando por quien sí la realizó, con el estado de evidencia
que corresponda según `reglas.md`. Esto no exige que la verificación se ejecute
dos veces.

Esta decisión no define cuándo corre la segunda opinión ciega. El shadow sigue
gobernado por `0010`: gate material, muestreo determinista o riesgo declarado.

### Cuándo QA es obligatorio

QA es obligatorio cuando la unidad afirma que algo funciona en un entorno que
sólo puede comprobarse ejecutándolo allí y la batería automatizada no puede
observarlo por sí sola. Se presume que la unidad afirma eso en estos dos casos,
salvo declaración explícita en contrario:

- código del MVP que altera comportamiento observable por el usuario;
- cambios en la infraestructura de ejecución del circuito cuya corrida real no
  esté cubierta por la batería.

`NO_VERIFICADO` nunca satisface un gate de funcionamiento y por sí solo no
vuelve QA `NO_APLICA` cuando el estado final, la aceptación o la integración
dependen de ese comportamiento; sólo desactiva la presunción cuando el
comportamiento queda expresamente fuera del alcance de la unidad y ningún
criterio de cierre se apoya en que funcione. Si forma parte del objetivo y no
puede probarse, el gate queda pendiente o la unidad reduce formalmente su
alcance.

QA no es obligatorio para cambios documentales ni para cambios de código cuya
verificación esté completamente cubierta por la batería automatizada. Cuando
participa, su independencia es obligatoria según `0009`: no lo ejecuta quien
implementó. La asignación de ocupantes sigue viviendo en `equipo.md`.

### Pull requests de código del MVP

Mientras rija la obligación temporal de revisión independiente sobre código:

- una pull request de código del MVP nunca se clasifica como Mecánico;
- lleva reviewer independiente por remisión a
  [la obligación temporal vigente](../pendientes.md#revisión-independiente-obligatoria-mientras-tanto);
- ejecuta la batería automatizada del área tocada sobre el HEAD exacto e informa
  el comando y el resultado exactos;
- lleva QA cuando altera comportamiento observable de la aplicación.

### Verificación no aplicable

Una verificación puede declararse **NO_APLICA** con una razón observable de una
línea, por ejemplo que el subsistema tocado no tenga batería o que el cambio no
altere comportamiento ejecutable.

No se declara NO_APLICA por conveniencia ni para ahorrar trabajo. La falta de
acceso tampoco es NO_APLICA: se declara como límite del ejecutor y la
verificación queda pendiente, no cumplida.

La lista anterior es un piso de exigencia, no un formulario. Lo que no aplica se
explica en una línea y el circuito continúa con las verificaciones restantes.

## Relación con el canon

Esta decisión concreta las verificaciones que `0013` usa en su gate, sin cambiar
su criterio de integración. Reutiliza la proporcionalidad y la independencia de
roles de `0009`, y remite a `0010` para el shadow y la lista de riesgo declarado.

## Resultado esperado

Cada unidad declara una clase comprobable contra su diff y puede demostrar, para
el HEAD exacto, si cumplió el piso de integración que le corresponde, sin
inventar requisitos dentro del prompt ni pedir al Director que interprete el
gate.
