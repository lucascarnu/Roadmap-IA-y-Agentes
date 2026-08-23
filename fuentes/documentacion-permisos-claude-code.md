---
formato: documentacion
plataforma: web
origen: "https://code.claude.com/docs/en/permissions"
autor: Anthropic
categoria: agentes-de-desarrollo
clasificacion: oro
---

# Documentación oficial de permisos de Claude Code

Documentación de referencia de Anthropic sobre el sistema de permisos, modos de
permiso, archivos de configuración y ejecución no interactiva de Claude Code. Es
el material que respalda la política de permisos de `.claude/settings.json`.

## Páginas consultadas

Consultadas el **2026-08-08**, contra la versión local **Claude Code 2.1.226**.
Reconsultadas el **2026-08-13**, contra **Claude Code 2.1.227**.
Reconsultadas el **2026-08-16**, contra **Claude Code 2.1.233**.
Reconsultadas el **2026-08-22**, contra **Claude Code 2.1.240**.
Reconsultadas el **2026-08-23**, contra **Claude Code 2.1.240**, las páginas de
permisos, settings y uso de datos.

- `https://code.claude.com/docs/en/permissions`
- `https://code.claude.com/docs/en/permission-modes`
- `https://code.claude.com/docs/en/settings`
- `https://code.claude.com/docs/en/sandboxing`
- `https://code.claude.com/docs/en/data-usage`
- `https://cli.github.com/manual/gh_help_environment`

## Ubicación de configuración de GitHub CLI en Windows

**DOCUMENTADO — GitHub CLI.** `GH_CONFIG_DIR` define el directorio de
configuración de `gh`. Si no está definido, GitHub CLI usa, en este orden,
`$XDG_CONFIG_HOME/gh`, `$AppData/GitHub CLI` en Windows cuando `$AppData` está
definido, o `$HOME/.config/gh`. La fuente es el
[manual oficial de variables de entorno de GitHub CLI](https://cli.github.com/manual/gh_help_environment).

**PROBADO LOCALMENTE — 2026-08-23.** Sin leer ni revelar el contenido de ningún
archivo, se comprobó que
`C:\Users\lucas\AppData\Roaming\GitHub CLI\hosts.yml` existe y que
`C:\Users\lucas\.config\gh\hosts.yml` no existe. La política compartida protege
la ruta efectiva mediante `Read(~/AppData/Roaming/GitHub CLI/**)`.

## Qué afirmaciones respalda

Cada punto se usó para decidir una regla concreta de la política:

- **`permissions.allow` / `ask` / `deny`.** Las reglas coincidentes de todos los
  scopes se combinan con precedencia `deny`, luego `ask` y por último `allow`.
  La especificidad no altera esa precedencia: un deny amplio de cualquier scope
  no admite excepciones mediante un allow más estrecho.
- **Nombre de herramienta desnudo y glob de herramienta.** Una regla que
  contiene sólo el nombre, como `Bash` o `PowerShell`, alcanza todos sus usos y,
  en `deny`, retira la herramienta del contexto. Los patrones de nombre deben
  cubrir el nombre completo; `mcp__*` deniega todas las herramientas MCP.
- **`WebFetch` general.** El nombre desnudo `WebFetch` alcanza todos los
  dominios; equivale a `WebFetch(domain:*)`. El preflight de seguridad de dominio
  permanece activo por defecto y envía sólo el hostname a Anthropic para
  cotejarlo con su blocklist. Esta política no configura
  `skipWebFetchPreflight`.
- **`permissions.defaultMode`.** Acepta `default`, `acceptEdits`, `plan`, `auto`,
  `dontAsk` y `bypassPermissions`.
- **Modo `dontAsk`.** Deniega automáticamente toda llamada que en otro modo
  habría abierto un prompt. Sólo corren las coincidencias preaprobadas; las
  reglas `ask`, `AskUserQuestion`, los conectores configurados para preguntar y
  las herramientas MCP marcadas `requiresUserInteraction` quedan denegados.
- **Deshabilitación de modos amplios.** Para impedir `bypassPermissions` y
  `auto`, `permissions.disableBypassPermissionsMode` y
  `permissions.disableAutoMode` usan literalmente el valor `"disable"`.
- **Comodines en reglas de comandos.** `*` coincide en cualquier posición,
  incluido el medio del patrón. Un `*` final precedido de espacio impone frontera
  de palabra y admite también el comando sin argumentos. El sufijo `:*` equivale
  a un ` *` final y solo se reconoce al final del patrón.
- **Comandos compuestos.** Cada subcomando debe coincidir por separado. Los
  separadores reconocidos incluyen `&&`, `||`, `;`, `|` y saltos de línea.
- **PowerShell.** Sus reglas usan la misma forma que las de Bash. Son namespaces
  distintos: una regla en uno no autoriza ni deniega en el otro.
- **Reglas de rutas.** Usan sintaxis de patrones de gitignore. `//ruta` es
  absoluta desde la raíz del sistema, `~/ruta` parte del directorio personal,
  `/ruta` es relativa al origen del archivo de configuración, y `ruta` o
  `./ruta` son relativas al directorio actual.
- **Alcance de `Read` deny.** Claude Code intenta aplicar estas reglas a sus
  herramientas integradas de lectura, incluidos `Grep`, referencias `@file` y
  contexto aportado por el IDE. Es un control best effort de herramientas, no
  una frontera de sistema operativo, y la documentación no ofrece una regla
  “permitir sólo si está versionado”. Por eso se deniegan rutas sensibles
  conocidas y se declara el riesgo residual sobre cualquier material todavía
  legible.
- **`Edit(...)` cubre todas las herramientas integradas de edición.** Una regla
  `Write(...)` o `NotebookEdit(...)` no participa de la verificación de permisos
  de archivos y produce una advertencia al arrancar.
- **Rutas protegidas.** `.claude` y `.git` están entre ellas. Bajo `dontAsk` sus
  escrituras se deniegan, y las reglas `allow` no las pre-aprueban porque la
  verificación corre antes de evaluarlas.
- **Configuración compartida y local.** `.claude/settings.json` se versiona y se
  comparte; `.claude/settings.local.json` no se versiona y sirve para ajustes
  personales o de una máquina. Las reglas de permisos de los distintos scopes
  se combinan y cualquier `deny` coincidente prevalece; para los demás settings
  rige la precedencia documentada de fuentes.
- **Sandbox complementario.** Las reglas de permisos controlan herramientas,
  archivos y dominios; el sandbox aplica restricciones de sistema operativo al
  Bash sandboxed. Son capas complementarias. La presencia de una política de
  permisos no demuestra que el sandbox esté configurado ni prueba confinamiento
  fuerte.
- **Comandos de solo lectura.** Existe un conjunto interno que corre sin prompt
  en todos los modos, e incluye las formas de solo lectura de `git`. Una regla
  `ask` o `deny` explícita lo revierte.
- **Ruta del ejecutable: NO DOCUMENTADO.** La documentación no establece si una
  invocación mediante ruta absoluta al ejecutable coincide con una regla escrita
  para su nombre desnudo, por ejemplo una ruta a `node.exe` frente a `node`.
- **Regla efectiva por ejecución: NO DOCUMENTADO.** La documentación no describe
  un registro auditable que identifique qué regla autorizó cada ejecución
  concreta. Lo más cercano es `/permissions`, que lista las reglas y el archivo
  `settings.json` del que proviene cada una.

## Semántica observada del matcher

Esta sección conserva observaciones históricas del perfil operativo anterior.
No describe capacidades del perfil vigente de especialista, que deniega shell,
edición y MCP por nombre de herramienta.

**PROBADO LOCALMENTE — 2026-08-14.** Estas observaciones describen el matcher
efectivo en este entorno; no son una garantía universal del producto salvo donde
la documentación oficial citada arriba diga lo mismo.

### Composición por segmentos

**PROBADO LOCALMENTE — 2026-08-14.** La composición se evalúa por segmentos.
Las sondas observadas fueron:

- `Get-ScheduledTask -TaskName "<inexistente>" | Disable-ScheduledTask` →
  denegado por regla explícita.
- `Get-ScheduledTask -TaskName "<inexistente>"; Start-ScheduledTask -TaskName
  "<inexistente>"` → denegado por regla explícita.

Un cmdlet de mutación presente en un segmento posterior sigue siendo alcanzado
por su `deny`: el primer comando permitido no autoriza automáticamente toda la
composición.

### Subexpresiones

**PROBADO LOCALMENTE — 2026-08-14.** La sonda
`Get-ScheduledTask -TaskName (Write-Output "<inexistente>")` fue denegada por
omisión. En este entorno, esa invocación con una subexpresión `( ... )` no
coincidió con el `allow` correspondiente.

Como consecuencia de seguridad observada, una construcción del tipo
`(New-CimSession ...)` embebida dentro de un comando permitido no quedó
automáticamente autorizada mediante el `allow` exterior. Esta conclusión no se
generaliza más allá de las formas observadas.

### Conjunto implícito observado

**OBSERVACIÓN:** `Format-List`, `Out-String` y `Select-Object` se ejecutaron como
segmentos de tubería sin aparecer en reglas `allow` explícitas del proyecto.
Esto explica que una composición como `Get-ScheduledTaskInfo ... | Format-List
* | Out-String` pueda funcionar: el primer segmento coincide con su `allow`, la
composición se descompone y los segmentos posteriores observados pueden
ejecutarse sin reglas propias.

El criterio exacto mediante el cual Claude Code permite ese conjunto implícito
no está respaldado por la documentación oficial disponible en el proyecto. No
se infiere qué otros cmdlets pertenecen al conjunto ni que todos los cmdlets
read-only estén implícitamente permitidos.

### Alcance de la garantía read-only observada

**PROBADO LOCALMENTE — 2026-08-14.** La garantía read-only de UO resistió las
tres clases observadas: tubería, punto y coma y subexpresión. Esto queda limitado
a las formas probadas y no constituye una garantía absoluta sobre toda sintaxis
PowerShell imaginable.

### El comodín final no funciona como glob libre sobre toda la cadena

Las formas:

- `Get-WinEvent -LogName Microsoft-Windows-TaskScheduler/Operational,Application ...`
- `Get-WinEvent -LogName 'Microsoft-Windows-TaskScheduler/Operational','Application' ...`

no matchearon las reglas destinadas al único canal permitido. Ambas fueron
denegadas. Por lo tanto, en este entorno, el comodín final no debe asumirse como
un glob libre sobre cualquier continuación sintáctica.

### Hashtable

La regla `PowerShell(Get-WinEvent -FilterHashtable *)` no autorizó
`Get-WinEvent -FilterHashtable @{...}`. Por eso esa forma fue abandonada y
reemplazada por `-LogName`.

### Mensajes de denegación observados

- `denied because Claude Code is running in don't ask mode` significa que
  ninguna regla `allow` matcheó.
- `Permission to use PowerShell with command ... has been denied` indica
  coincidencia con una regla `deny` explícita.

Esta distinción es comportamiento observado localmente, no una garantía
universal del producto salvo que una fuente oficial futura la respalde.

### Case-insensitive

El matcher observado es insensible a mayúsculas/minúsculas:

- `-computername` coincidió con una regla escrita usando `-ComputerName`.
- `schtasks /S` coincidió con una regla escrita usando `/s`.

### Abreviaturas de parámetros PowerShell

Un `deny` anclado al nombre completo de un parámetro no necesariamente cubre las
abreviaturas válidas que PowerShell expande. La abreviatura `-Com` eludió
`PowerShell(Get-WinEvent * -ComputerName *)` y el comando llegó a ejecutarse.

Por lo tanto, para parámetros PowerShell donde se necesite cerrar una familia
completa, el patrón debe considerar el prefijo mínimo no ambiguo pertinente. En
esta unidad:

- `-ComputerName` → familia cubierta mediante `-Co*`.
- `-Credential` → familia cubierta mediante `-Cr*`.

El bypass fue observado, fue reproducible y queda corregido por UO-fix3.

### Diferencia con flags de ejecutables clásicos

Las banderas de una sola letra de herramientas como `schtasks /s` no tienen el
mismo problema de abreviaturas PowerShell. La insensibilidad a mayúsculas ya
cubre variantes como `/S`.

### Observación abierta sobre variables PowerShell

**INFERENCIA:** una invocación que contiene referencias a variables PowerShell,
por ejemplo `$null`, pareció no coincidir con una regla `allow` en la observación
realizada con `-Cred $null`. Esto no se trata como semántica confirmada del
matcher y UO no se amplía para investigarlo.

## Por qué oro

Determinó decisiones concretas y verificables, no impresiones. Corrigió tres
supuestos que habrían quedado escritos en la política: que el emparejamiento era
solo por prefijo, que un patrón `x *` no cubría el comando sin argumentos, y que
convenía duplicar los deny de edición en `Write` y `NotebookEdit` —lo que en
realidad habría generado advertencias sin proteger nada—.

Es material de referencia al que se vuelve cada vez que haya que agregar o
estrechar una regla, no una lectura que se termine.

## Vigencia

Lo anterior describe el comportamiento documentado tras la reconsulta del
**2026-08-23** para **Claude Code 2.1.240**, junto a las consultas anteriores de
2026-08-22, 2.1.233, 2.1.227 y 2.1.226. No son afirmaciones permanentes ni
evidencia operativa de una sesión fría.

Debe revalidarse cuando cambie de forma relevante la versión de Claude Code o la
documentación de permisos, y de inmediato ante cualquier comportamiento
observado que las contradiga.
