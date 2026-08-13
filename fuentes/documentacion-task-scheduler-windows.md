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

## Estado y revalidación

Estas afirmaciones están **DOCUMENTADAS**; no demuestran que la tarea del
proyecto haya sobrevivido un reinicio ni que las sesiones OAuth estén disponibles
en esa ejecución. Eso requiere el QA independiente posterior.

Revalidar si cambia materialmente Windows, el módulo `ScheduledTasks`, la cuenta
que ejecuta la tarea o la documentación oficial, y de inmediato ante una
observación que contradiga este procedimiento.
