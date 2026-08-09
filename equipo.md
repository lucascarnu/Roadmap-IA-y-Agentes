# Equipo

Quién ocupa hoy cada rol del trabajo asistido.

Es **estado operativo, no decisión**. Cambia cuando conviene, sin reescribir
documentación estructural, y su historia queda en Git. Este archivo es la **única
fuente de la asignación vigente**: ningún otro documento la repite.

El modelo estable —qué es cada rol, qué autoridad tiene, cómo se escala, cómo se
decide una asignación y cuándo se reevalúa— está en
[0009](decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md).

## Asignación vigente

| Rol | Ocupante |
| --- | --- |
| Director / Product Owner | Lucas |
| Arquitecto / Lead | Claude |
| Ejecutor principal | Codex |
| Reviewer independiente | GitHub Copilot Code Review, solo sobre pull requests |
| QA / Validación | *Sin asignar.* Se activa por tarea |
| Especialistas bajo demanda | *Sin asignar.* Se activan por tarea |

**QA / Validación no tiene ocupante permanente**, y no conviene inventarle uno.
Se activa cuando una tarea necesita demostrar que algo funciona, y quien lo ocupe
tiene que poder **ejecutar el comportamiento objetivo en su entorno real**: es un
requisito para ocupar el rol, no un ocupante. `0009` fija además que no puede
declarar validado quien no pudo ejecutar.

## Servicios externos

No son roles y no aparecen en la tabla. Hoy hay uno: **ChatGPT Work**, consultado
por hitos y fuera del circuito operativo cotidiano. Como todo servicio cuya
disponibilidad no está garantizada, no puede ser dependencia obligatoria del
circuito automático.

## Candidatos sin asignación

Otros modelos y proveedores —por ejemplo Kimi— pueden ocupar o reemplazar
cualquiera de estos roles si la evidencia lo justifica, con los criterios de
`0009`. Hoy ninguno tiene asignación activa ni integración técnica.

El rol de investigador de soluciones externas todavía no está adoptado; su
alcance y su candidato inicial están en `pendientes.md`.

## Cómo se cambia

Se edita la tabla. Nada más: el resto de este archivo describe estado y
condiciones, no responsabilidades del modelo —esas están en `0009`—, y **ningún
otro documento repite la asignación vigente**. Las decisiones conservan
asignaciones históricas, marcadas como superadas, que describen el momento en que
se escribieron y no el estado actual.

Si el cambio responde a evidencia acumulada o a un cambio de contexto de los que
`0009` enumera, conviene dejarlo dicho en el mensaje del commit.
