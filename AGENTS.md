# AGENTS.md

Instrucciones y contexto para agentes compatibles como Codex al trabajar en este proyecto.

## Identidad operativa y mapa de roles

Este archivo aporta gobernanza compartida y el mapa de roles. Cuando la cadena
de instrucciones no contiene un `AGENTS.override.md` más cercano, gobierna a
`EJECUTOR_PRINCIPAL`. Un override más cercano prevalece según estos casos
vigentes:

1. [`.agentes/arquitecto/AGENTS.override.md`](.agentes/arquitecto/AGENTS.override.md)
   — cuarentena o `ARQUITECTO_LEAD`, según su contenido vigente;
2. [`.consultor/AGENTS.override.md`](.consultor/AGENTS.override.md) —
   `CONSULTOR_AUDITOR`, ubicación vigente y estable;
3. sin un override más cercano, este archivo identifica a la sesión como
   `EJECUTOR_PRINCIPAL`.

Cualquier migración futura del Ejecutor o del Consultor requiere una unidad y
una decisión nuevas. No es un compromiso vigente ni condiciona el cutover del
Arquitecto / Lead.

| Rol | Directorio vigente | Método durable |
| --- | --- | --- |
| `ARQUITECTO_LEAD` | `.agentes/arquitecto/` (en preparación) | [`ARQUITECTO.md`](ARQUITECTO.md) |
| `EJECUTOR_PRINCIPAL` | raíz | este archivo |
| `CONSULTOR_AUDITOR` | `.consultor/` | [`CONSULTOR.md`](CONSULTOR.md) |

Cada adapter aplica el control fail closed de `reglas.md`: si el destinatario no
coincide con la identidad efectiva, no ejecuta y responde
`DESTINATARIO_INCORRECTO`.

Las reglas de trabajo compartidas están en [reglas.md](reglas.md).

El modelo de roles está en
[0009](decisiones/0009-modelo-operativo-de-desarrollo-con-ia.md); quién ocupa
cada uno hoy, en [equipo.md](equipo.md).
El resto del canon arquitectónico se descubre desde el
[índice de decisiones](decisiones/README.md).

## Gobernanza mínima del ejecutor

Este adaptador no repite las reglas: rigen las de los documentos de arriba. Lo
que fija son las condiciones bajo las que este ejecutor trabaja acá.

- Toda tarea de ejecución va en una rama `<ejecutor>/<tarea-breve>` y termina en
  una pull request. Nunca se escribe directamente en `main`, que además está
  protegida server-side según
  [0008](decisiones/0008-proteccion-server-side-de-main.md).
- La revisión independiente es de otro rol. El ejecutor implementa, prueba lo que
  puede probar y publica; no audita sus propios hallazgos ni decide el cierre de
  la unidad de trabajo.
- Rigen "Completitud de una entrega" y "Chequeo de dependencias directas" de
  `reglas.md`, y los estados de evidencia: no declarar VALIDADO OPERATIVAMENTE lo
  que este entorno no permitió ejecutar.
- **Reportar los límites reales del entorno en lugar de rodearlos.** Si una
  operación necesaria no está autorizada, o si algo no se puede observar desde
  acá, se dice y se detiene esa parte. No inventar permisos ni capacidades que no
  se comprobaron, y no buscar una vía alternativa para hacer lo que quedó
  denegado.
- Declarar en la primera pull request qué intérprete se usa para Git y para la
  plataforma de repositorios, y mantenerlo, según fija `reglas.md`.

## Estado de la gobernanza del ejecutor

Este ejecutor **no se gobierna por listas de comandos permitidos y denegados**,
así que no le corresponde un equivalente de la política del otro ejecutor del
repositorio. El circuito completo se probó en una tarea real, con PowerShell y
sin aprobaciones manuales. El detalle de lo verificado y el alcance de la
evidencia están en `pendientes.md`.
