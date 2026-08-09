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
| Reviewer independiente | *sin asignar* |
| Reviewer complementario | GitHub Copilot Code Review |
| QA / Validación | Un entorno capaz de ejecutar realmente el comportamiento objetivo |
| Especialistas bajo demanda | Según necesidad |

**Consultor externo:** ChatGPT Work, fuera del circuito operativo cotidiano. Se
lo consulta por hitos, no de forma continua. Como todo servicio externo, no puede
ser dependencia obligatoria del circuito automático.

## Nota sobre el reviewer independiente

Queda sin asignar de forma explícita. Con Claude en Arquitecto / Lead y Codex en
Ejecutor, el candidato natural es Claude, pero entonces revisaría la
implementación de un diseño propio: independiente del ejecutor, no del diseño.
`0009` exige independencia en revisión y validación, así que conviene decidirlo
antes de la primera pull request real del MVP.

## Cómo se cambia

Se edita la tabla. Nada más. Si el cambio responde a evidencia acumulada o a un
cambio de contexto de los que `0009` enumera, conviene dejarlo dicho en el
mensaje del commit.
