---
formato: documentacion
plataforma: web
origen: "https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-start-page"
autor: Microsoft
categoria: agentes-de-desarrollo
clasificacion: oro
---

# Documentación oficial de Windows Task Scheduler

Documentación de Microsoft usada para fijar el procedimiento PRE-MVP del tick
determinista del puente local.

## Páginas consultadas

Consultadas el **2026-08-13** para Windows 10/11 y Task Scheduler 2.0:

- `https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-repetition-triggerbasetype-element`
- `https://learn.microsoft.com/en-us/windows/win32/taskschd/starting-an-executable-when-a-user-logs-on`
- `https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-multipleinstances`
- `https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-startwhenavailable-settingstype-element`
- `https://learn.microsoft.com/en-us/windows/win32/taskschd/execaction`
- `https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset?view=windowsserver2025-ps`
- `https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal?view=windowsserver2025-ps`
- `https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-query`

Consultadas el **2026-08-14**:

- `https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/get-scheduledtask`
- `https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/get-scheduledtaskinfo`
- `https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.diagnostics/get-winevent`
- `https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2008-R2-and-2008/dd315533(v=ws.10)`
- `https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2008-R2-and-2008/dd315590(v=ws.10)`

## Qué afirmaciones respalda

- Un trigger admite un patrón de repetición con intervalo y duración.
- Un logon trigger inicia la acción cuando inicia sesión el usuario indicado.
- `StartWhenAvailable` permite iniciar una tarea temporal después de perder su
  hora programada; Microsoft aclara que sólo aplica a tareas temporales.
- La política `IgnoreNew` no inicia una instancia nueva mientras otra continúa
  ejecutándose.
- Un principal con logon interactivo ejecuta bajo la cuenta de usuario, en vez
  del contexto `SYSTEM`.
- Una acción ejecutable admite ruta, argumentos y directorio de trabajo.
- `schtasks /query /fo LIST /v` expone la configuración detallada y permite
  verificar el patrón de recurrencia y el resultado de ejecución.
- `Get-ScheduledTask` obtiene el objeto de definición de una tarea registrada.
- `Get-ScheduledTaskInfo` obtiene información de ejecución de una tarea
  registrada.
- Ninguno de los dos admite parámetros de escritura.
- `Get-WinEvent` permite filtrar mediante `FilterHashtable` usando claves como
  `LogName`, `ProviderName`, `ID`, `Level`, `StartTime` y `EndTime`.
- `Get-WinEvent -ListLog` devuelve un objeto `EventLogConfiguration` con método
  `SaveChanges()`, documentado por Microsoft como vía capaz de modificar la
  configuración de un log; por eso queda expresamente denegado.
- El proveedor `Microsoft-Windows-TaskScheduler` documenta los eventos 100, 102,
  111, 129, 200, 201, 202, 203, 323, 327, 328, 329, 330, 331, 106, 113, 115,
  116, 140, 141 y 406.

## Límites de esta documentación

- La atribución de una ejecución a un trigger concreto **NO** está respaldada
  por ninguna de las páginas oficiales consultadas.
- Esa atribución sigue siendo inferencial.
- Las páginas de clase `MSFT_TaskDynamicInfo` y `MSFT_ScheduledTask` devuelven
  HTTP 404 en Microsoft Learn.
- Por lo tanto, los nombres exactos de sus propiedades quedan como **PROBADO
  LOCALMENTE** por observación, no como **DOCUMENTADO**.

### Observaciones de la política efectiva — PROBADO LOCALMENTE — 2026-08-14

- Los nombres de propiedad observados de `MSFT_TaskDynamicInfo` son
  `LastRunTime`, `LastTaskResult`, `NextRunTime`, `NumberOfMissedRuns`,
  `TaskName` y `TaskPath`.
- `Get-ScheduledTask` expone efectivamente `State`, `Triggers`, `Principal` y
  `Settings`.
- Dentro de `Settings` se observaron `MultipleInstances` y
  `StartWhenAvailable`.
- Dentro de `Triggers` se observaron tipos como `MSFT_TaskBootTrigger`,
  `MSFT_TaskTimeTrigger` y `MSFT_TaskTrigger`, junto con sus parámetros.
- La forma `Get-WinEvent -FilterHashtable @{...}` **NO** es alcanzable bajo la
  política efectiva actual del ejecutor porque el argumento con forma de tabla
  hash no matchea la regla autorizada.
- Las consultas al canal se realizarán mediante `Get-WinEvent -LogName ...` y,
  cuando haga falta, se combinarán con filtrado posterior o con formas
  compatibles con la política.
- La salida de `schtasks` está localizada al idioma del sistema. Si alguna vez
  se parsea automáticamente, debe preferirse `/xml`.
- Sigue **SIN VERIFICAR** si
  `Microsoft-Windows-TaskScheduler/Operational` está habilitado y si contiene
  eventos, porque la vía autorizada anterior era precisamente la que no
  funcionaba.
- El canal `Microsoft-Windows-TaskScheduler/Operational` existe y responde a
  `Get-WinEvent`.
- Actualmente no devuelve eventos recuperables: `Get-WinEvent` termina con
  `NoMatchingEventsFound`. Ese resultado demuestra que el permiso funciona y
  el cmdlet llega a ejecutarse.
- La superficie autorizada no permite determinar si el canal está deshabilitado
  o simplemente vacío. Determinarlo exigiría usar `Get-WinEvent -ListLog`, que
  UO deniega deliberadamente porque expone `EventLogConfiguration` y su método
  `SaveChanges()`.
- Esta limitación es una consecuencia aceptada del diseño de UO, no una
  capacidad faltante.
- La observación **REMOTA** de tareas y de Event Log queda fuera del alcance de
  UO. Esa superficie se cierra mediante reglas `deny` para `-ComputerName`,
  `-Credential`, `schtasks /s`, `schtasks /u` y `schtasks /p`.

## Estado y revalidación

Estas afirmaciones están **DOCUMENTADAS**; no demuestran que la tarea del
proyecto haya sobrevivido un reinicio ni que las sesiones OAuth estén disponibles
en esa ejecución. Eso requiere el QA independiente posterior.

Revalidar si cambia materialmente Windows, el módulo `ScheduledTasks`, la cuenta
que ejecuta la tarea o la documentación oficial, y de inmediato ante una
observación que contradiga este procedimiento.
