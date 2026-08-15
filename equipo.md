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

## Contingencias

Un ocupante puede quedarse sin cuota o sin disponibilidad en cualquier momento.
Estas son las sustituciones previstas, para que el circuito no tenga que
inventarlas en ese momento. **Ninguna está activa hoy.**

Una contingencia puede mantener al mismo ocupante mediante otra vía de acceso
autorizada, o recurrir a otro ocupante autorizado que preserve la independencia
y las capacidades requeridas. El agotamiento temporal de cuota no se escala al
Director mientras exista una vía alternativa autorizada capaz de satisfacer el
gate correctamente: el circuito resuelve esa contingencia agenticamente. Sólo
si ninguna vía autorizada puede satisfacer un gate obligatorio, el cierre se
detiene de forma segura.

**Reviewer independiente.** Si el ocupante asignado no está disponible, no pudo
ejecutar la revisión o agotó su cuota:

1. usar un reviewer independiente alternativo, al que se le entrega un paquete
   autocontenido con el problema, el cambio y la evidencia;
2. si no hay ninguno disponible y la revisión es obligatoria, detener el cierre
   de forma segura;
3. nunca interpretar la indisponibilidad como aprobación.

El procedimiento del paquete autocontenido está **PROBADO LOCALMENTE**: sobre la
pull request #10, dos reviewers externos sin acceso al repositorio produjeron
hallazgos materiales correctos a partir del paquete, y uno de ellos revalidó
después el delta corregido. No está automatizado, y para esto no hace falta que
lo esté.

**Arquitecto / Lead y Ejecutor principal.** Si su ocupante no está disponible o
se queda sin cuota, **Kimi** puede ocupar temporalmente cualquiera de los dos.
Condiciones:

- tiene que poder reconstruir el estado desde el repositorio, las ramas y las
  pull requests, sin que el director le reconstruya la historia a mano;
- si ocupa Arquitecto / Lead o Ejecutor en una tarea, **no puede ser reviewer
  independiente de esa misma tarea**, por la independencia que fija `0009`.

Es una previsión documentada, no una asignación: no tiene integración técnica.
La capacidad de sustitución y reconstrucción está **PROBADA LOCALMENTE**; el
detalle de la prueba vive en [pendientes.md](pendientes.md#prueba-de-sustitución-del-ocupante-de-contingencia).

## Candidatos sin asignación

Otros modelos y proveedores pueden ocupar o reemplazar cualquiera de estos roles
si la evidencia lo justifica, con los criterios de `0009`. Hoy ninguno tiene
asignación activa ni integración técnica, incluidos los que aparecen arriba como
contingencia.

El rol de investigador de soluciones externas todavía no está adoptado; su
alcance y los candidatos a evaluar están en `pendientes.md`.

## Cómo se cambia

Se edita la tabla. Nada más: el resto de este archivo describe estado y
condiciones, no responsabilidades del modelo —esas están en `0009`—, y **ningún
otro documento repite la asignación vigente**. Las decisiones conservan
asignaciones históricas, marcadas como superadas, que describen el momento en que
se escribieron y no el estado actual.

Si el cambio responde a evidencia acumulada o a un cambio de contexto de los que
`0009` enumera, conviene dejarlo dicho en el mensaje del commit.
