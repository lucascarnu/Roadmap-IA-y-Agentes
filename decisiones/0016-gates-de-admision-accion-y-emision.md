# 0016 — Gates de admisión, acción y emisión

- **Estado:** aceptada
- **Fecha:** 2026-08-21

## Contexto

El canon ya exigía destinatario, firma y artefactos transportables íntegros,
pero esas reglas podían omitirse sin que ninguna compuerta detuviera la acción
o la devolución. La línea registrada en el
[Issue #123](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/123)
separa lo que una superficie puede bloquear mecánicamente de lo que sólo puede
validar después o exigir como conducta.

La evidencia externa disponible distingue tres puntos. `UserPromptSubmit`
puede bloquear antes de entregar un prompt al modelo. `PreToolUse` sólo
constituye gate en rutas soportadas que efectivamente pasan por el hook: la
[documentación oficial vigente de hooks](https://learn.chatgpt.com/docs/hooks)
no cubre hosted tools y advierte que rutas especializadas pueden excluirse.
`Stop`, en cambio, sólo fuerza continuación: no retira el mensaje ya emitido;
en Claude Code, `MessageDisplay` tampoco puede bloquear. Los hooks de proyecto
de Codex dependen de que el proyecto esté confiado, y en Claude Code sólo la
política administrada vuelve los hooks inanulables frente a `disableAllHooks`.
Las fuentes oficiales consultadas no declaran versión y no confirman paridad
entre CLI, aplicación de escritorio y modo no interactivo; esa paridad queda
`NO_VERIFICADO`.

## Decisión

Las etiquetas de esta decisión son normativas:

- **GATE MECÁNICO:** una compuerta que detiene el efecto antes de que ocurra y
  que el actor no puede omitir sin dejar rastro en la superficie gobernada.
- **VALIDACIÓN POSTERIOR:** observa un resultado ya producido y puede fallar el
  cierre, pero no deshace el efecto.
- **REGLA DE CONDUCTA:** disciplina exigida al actor cuando la superficie no
  ofrece una intercepción no omisible.
- **DEFINICIÓN ESTRUCTURAL:** fija un concepto, un catálogo o una
  enumeración que otras reglas usan. No detiene ni comprueba nada por sí
  misma.
- **REFERENCIA NORMATIVA:** remite a canon vigente o a un entregable
  futuro. No crea obligación ejecutable propia.

Nada se presenta como gate mecánico si el actor puede omitirlo sin dejar
rastro. Las tres primeras etiquetas se aplican sólo a requisitos de control;
una definición o una referencia no se etiqueta como gate ni como validación,
porque no detiene ni comprueba ninguna condición.

### Los tres gates

1. **Admisión y continuidad — GATE MECÁNICO donde la superficie ofrece una
   intercepción previa no omisible; REGLA DE CONDUCTA en las demás
   superficies.** Valida identidad, destinatario, versión, manifiesto,
   dependencias materiales y autorización antes de que el contrato llegue al
   actor o al modelo. `UserPromptSubmit` es un punto de intercepción posible,
   sujeto a confianza y política efectiva de la superficie.
2. **Acción y resultado — GATE MECÁNICO para llamadas de herramienta
   gobernadas; VALIDACIÓN POSTERIOR para efectos que la superficie no puede
   interceptar.** `PreToolUse` bloquea una operación no declarada antes del
   efecto sólo en las rutas soportadas que pasan efectivamente por el hook; no
   se presume cobertura para hosted tools ni para rutas especializadas
   excluidas. Los observadores y postcondiciones comparan después todos los
   efectos materiales que no pudieron prevenirse.
3. **Emisión y cierre — GATE MECÁNICO sólo cuando el proyecto es dueño del
   canal; VALIDACIÓN POSTERIOR y REGLA DE CONDUCTA en chat libre.** El renderer
   y el canal controlado pueden impedir publicar un artefacto inválido. `Stop`
   y `MessageDisplay` no retiran un mensaje ya emitido, por lo que no convierten
   el chat libre en una compuerta.

Un generador de repositorio no es por sí solo un gate de emisión: escribir el
mensaje a mano lo omite. El texto libre puede contener una propuesta, pero sólo
un artefacto producido o validado por el canal controlado cuenta como handoff
despachable, y el receptor rechaza un artefacto sin manifiesto.

### Catálogo durable y registro operacional

**DEFINICIÓN ESTRUCTURAL.** El catálogo durable define roles estables sin asignar
ocupantes ni herramientas concretas:

| `role_id` | Nombre canónico | Responsabilidades y capacidades normativas | Independencia o incompatibilidad |
| --- | --- | --- | --- |
| `DIRECTOR_PRODUCT_OWNER` | Director / Product Owner | Intención, producto, prioridades, restricciones, presupuesto y arbitrajes reservados | No es operador técnico rutinario |
| `ARQUITECTO_LEAD` | Arquitecto / Lead | Diseñar, clasificar materialidad, coordinar evidencia y decidir el cierre técnico | Puede combinarse provisionalmente con Ejecutor y decidir el cierre técnico de una implementación propia; no ocupa Reviewer independiente ni QA de esa implementación |
| `EJECUTOR_PRINCIPAL` | Ejecutor principal | Implementar, probar lo observable y publicar | No arbitra su propio cierre ni ocupa Reviewer o QA de su implementación |
| `REVIEWER_INDEPENDIENTE` | Reviewer independiente | Juzgar si el cambio está bien construido y emitir hallazgos | Instancia ciega e independiente de quien diseñó o implementó; no implementa, ejecuta QA ni decide cierre |
| `QA_VALIDACION` | QA / Validación | Ejecutar el comportamiento objetivo y responder si funciona realmente | Independiente de quien implementó |
| `CONSULTOR_AUDITOR` | Consultor / Auditor de Continuidad y Coherencia | Detectar huecos transversales y proponer para arbitraje | No decide arquitectura, implementa, revisa como Reviewer, integra ni crea gates |
| `ESPECIALISTAS_BAJO_DEMANDA` | Especialistas bajo demanda | Aportar la disciplina requerida por la tarea | Se activan sólo cuando el trabajo lo justifica y no heredan otra autoridad |

Las incompatibilidades de esta columna son de rol, no de ocupante. Cuando
[0009](0009-modelo-operativo-de-desarrollo-con-ia.md) admite que Arquitecto
y Ejecutor recaigan provisionalmente en el mismo ocupante, el cierre técnico
sigue siendo del rol Arquitecto aunque lo ejerza quien implementó; lo que
ese ocupante no puede es presentarse como Reviewer independiente ni como QA
de su propia implementación. En esos cambios no hay juicio independiente, y
0009 lo registra como un intercambio deliberado.

**DEFINICIÓN ESTRUCTURAL.** El registro operacional referencia un `role_id` y
registra ocupante o referencia a la asignación vigente, adapter y `cwd`
efectivos, aplicación o superficie, capacidades observadas, autorización y
autenticación, mecanismo y evidencia de confinamiento, y fecha, alcance y
procedencia de la evidencia. Adapter efectivo y confinamiento cambian con
ocupante, aplicación, superficie y entorno; un ocupante nuevo no hereda la
evidencia del anterior.

La fuente única del ocupante vigente sigue siendo [equipo.md](../equipo.md). Un
registro mecánico de ocupación debe referenciarla o derivarse de ella, salvo que
una decisión futura cambie explícitamente la fuente canónica; no copia ocupantes
en silencio.

`scripts/handoff/actores.json` es por naturaleza registro operacional, no
catálogo durable: el consumidor v2 exige `actor`, `adapter`, capacidades y
confinamiento, usa el adapter para validar contexto y la evidencia de
confinamiento para autorizar ejecución. Su migración compatible pertenece a la
unidad 2a. En esa unidad también se corrige el adapter del Consultor: el registro
apunta hoy a `CONSULTOR.md`, mientras ese documento declara que el mecanismo
automático de identidad es `.consultor/AGENTS.override.md`.

### Cuatro conceptos que G0 no puede colapsar

**GATE MECÁNICO.** La admisión distingue capacidad normativa del rol,
ocupante asignado, adapter efectivo y capacidad efectiva observada en la
superficie. Ninguno de los cuatro sustituye a los demás.

La capacidad efectiva observada tampoco demuestra por sí sola que la
operación pueda realizarse. Cuando corresponde, la admisión observa por
separado:

- disponibilidad y capacidad de la superficie;
- autorización para la operación;
- autenticación de la vía;
- compatibilidad con la operación concreta.

Cada uno es un hecho distinto y ninguno se infiere de otro. Por eso el
registro operacional los anota por separado y los estados terminales de vía
distinguen `CAPACIDAD_NO_DISPONIBLE` de `VIA_NO_AUTENTICADA` y de
`ROL_INCOMPATIBLE`.

### Validación en dos capas

**GATE MECÁNICO.** Primero se valida la estructura contra JSON Schema; después
se valida semánticamente el `role_id` contra el catálogo. Un identificador de
proveedor, producto o modelo en un campo de rol se rechaza.

El alias `codex` es ambiguo entre `ARQUITECTO_LEAD`, `EJECUTOR_PRINCIPAL` y
`CONSULTOR_AUDITOR`: se resuelve fail closed por el adapter efectivo y el
`cwd`. Si ambos no permiten una resolución única, la admisión falla cerrada con
`ROL_AMBIGUO`.

### Cutover compatible de identidad

**GATE MECÁNICO en la frontera; VALIDACIÓN POSTERIOR sobre artefactos
persistidos.** La migración de la unidad 2a sigue cinco pasos:

1. aceptar el alias heredado con su perfil discriminante;
2. normalizarlo a `role_id`;
3. conservar el artefacto canónico con `role_id`;
4. proyectar el alias sólo en la frontera v1 de compatibilidad;
5. retirar la proyección cuando todos los consumidores directos admitan el
   `role_id` canónico y la frontera heredada deje de ser necesaria.

El retiro de esa proyección es independiente de cualquier migración de
directorios o adapters y no compromete a migrar al Ejecutor ni al Consultor.

Durante la transición, los encabezados transportan juntos el literal heredado y
el `role_id`; el literal heredado es una zona exacta.

El inventario inicial, expresamente no exhaustivo, de la frontera v1 incluye:

- `scripts/handoff/handoff.schema.json`;
- `scripts/handoff/handoff-result.schema.json`;
- `scripts/handoff/config.json`;
- `scripts/handoff/handoff.mjs`.

Antes de cerrar el cutover, la unidad 2a busca también pruebas, documentación,
schemas generados, adapters y cualquier otro consumidor directo.

### Contradicción entre ejecución v2 y el sobre de 0015

**GATE MECÁNICO.** El validador v2 rechaza `modo: ejecucion` cuando el
destinatario no alcanza `PROBADO_LOCALMENTE`, mientras
[0015](0015-sobre-operativo-del-mvp-local-supervisado.md) conserva a los cinco
actores en `NO_CONFIGURADO / NO_PROBADO`. La resolución sigue esta secuencia
condicional:

1. La unidad 2a representa por separado evidencia de confinamiento fuerte,
   evidencia del perfil operativo aplicable, restricciones del contrato y
   disparadores de 0015.
2. Antes de cerrar 2a, una comprobación fail closed determina si perfiles
   anteriores a U7.2 necesitan `modo: ejecucion`; el caso concreto es el perfil
   manual, porque un handoff formal al Ejecutor para modificar archivos
   representa una ejecución.
3. Si ninguno lo necesita, el cambio de admisión permanece en U7.2.
4. Si el perfil manual o el motor de 2b lo necesitan, contrato y validador
   resuelven la admisión supervisada antes de 2b.
5. U7.2 conserva en todo caso la conexión del runtime v2 con `poll`, `tick` e
   `invokeAgent`, hoy desconectados según `pendientes.md`.
6. Si la contradicción no se resuelve antes del primer consumidor, ese perfil y
   las nuevas unidades de `app/` permanecen congelados.

Ninguna rama modifica `confinamiento.evidencia`: el confinamiento fuerte
permanece `NO_PROBADO`.

### Regla de artefacto despachable

**GATE MECÁNICO en el receptor y en canales controlados; REGLA DE CONDUCTA en
chat libre.** El texto libre puede contener una propuesta. Sólo un artefacto
producido o validado por el canal controlado cuenta como handoff despachable, y
el receptor rechaza todo artefacto sin manifiesto.

### Preflight de cobertura documental e impacto

**GATE MECÁNICO, a implementar en la unidad 2b.** Antes de declarar final un
arbitraje o emitir un handoff, el manifiesto demuestra:

- canon citado abierto y verificado;
- enumeraciones comparadas contra su fuente;
- consumidores directos buscados;
- schemas, validadores y pruebas relacionadas identificados;
- fuentes inaccesibles declaradas;
- afirmaciones factuales vinculadas a evidencia;
- invariantes de la versión anterior reconciliadas;
- contenido declarado congelado incluido en el transporte;
- hechos separados de inferencias y decisiones del Director.

**VALIDACIÓN POSTERIOR, en la unidad 3.** Las pruebas negativas mínimas omiten
un consumidor directo; afirman haber leído una fuente inaccesible; modifican un
conteo sin reconciliación; declaran congelado un texto ausente; y reemplazan una
versión perdiendo una invariante aceptada. El aprendizaje se incorpora a la
bitácora y a la guía de la unidad 3.

### Transporte entre PC e iPad

**GATE MECÁNICO en canales controlados; VALIDACIÓN POSTERIOR en los demás;
REGLA DE CONDUCTA transitoria hasta la unidad 2b.** La normalización depende del
tipo de campo:

- **Zonas normalizables:** contenedor exterior, saltos CRLF/LF, BOM inicial,
  prosa declarada normalizable y diferencias visuales que no alteren campos ni
  estructura.
- **Zonas exactas u opacas:** identificadores y aliases de rol, hashes y
  fingerprints, JSON, código, URLs, nombres de archivo, comandos, payloads
  congelados y todo campo cuya representación participe de una comparación.

Las zonas exactas sólo admiten una canonicalización específica, versionada y
declarada; nunca equivalencia visual genérica. Sustituir el guion largo por un
guion corto en un destinatario altera la validación del adapter y es
`PERDIDA_MATERIAL_DE_TRANSPORTE`, no normalización benigna.

La unidad 2b separa contenido semántico canónico de representación, distingue
`NORMALIZACION_BENIGNA` de `PERDIDA_MATERIAL_DE_TRANSPORTE`, falla ante
truncamiento, campos ausentes, segmentos duplicados o JSON alterado, y emite una
representación de texto plano para PC e iPad con marcadores ASCII, versión,
`artifact_id` y fingerprint semántico. JSON estricto y contenido sensible a
bytes viajan como artefactos durables con identidad y hash.

**VALIDACIÓN POSTERIOR.** La unidad 3 usa fixtures reales copiados desde PC e
iPad y exige que converjan al mismo objeto semántico y fingerprint. Hasta que
2b exista, un cuerpo congelado se verifica semánticamente salvo sus zonas
exactas.

### Cierre de dependencias materiales

**GATE MECÁNICO, a implementar en la unidad 2b.** Para todos los roles y
superficies, ningún actor puede omitir material que el destinatario necesite
para ejecutar, revisar, auditar, arbitrar o validar sin reconstruir la
conversación.

El preflight produce una matriz destinatario/dependencia y clasifica cada
elemento como `REQUERIDO_PARA_LA_TAREA`, `REFERENCIA_DURABLE_RESOLUBLE`,
`CONTEXTO_NO_NECESARIO` o `FUENTE_NO_ACCESIBLE_DECLARADA`. Todo elemento
requerido viaja íntegro o como referencia durable accesible para la superficie
del destinatario, con URL o ruta, identidad y hash cuando corresponda. Una
referencia existente pero inaccesible no cierra la dependencia. La omisión
falla con `DEPENDENCIA_MATERIAL_OMITIDA`.

El paquete es el mínimo suficiente por audiencia: incluir secretos, material
irrelevante o información de otros roles también es defecto.

**VALIDACIÓN POSTERIOR, en la unidad 3.** Los fixtures mínimos cubren cuerpo
congelado ausente; conteo sin inventario; fuente externa sin copia, URL o hash
accesible; decisión necesaria fuera del bloque; referencia válida pero
inaccesible; material requerido para Consultor o QA omitido; e información
exclusiva del Arquitecto enviada innecesariamente al Ejecutor.

Los requisitos de cobertura documental, transporte PC/iPad y dependencias
materiales son nuevos y no alteran el inventario original de veinticuatro
continuaciones.

### Capas de configuración

**REGLA DE CONDUCTA.** El Ejecutor modifica por pull request los archivos
versionados del repositorio. El Director modifica fuera del repositorio la
configuración administrativa de máquina u organización; un handoff no se la
pide al Ejecutor.

### Descongelamiento de nuevas unidades de `app/`

**GATE MECÁNICO de cobertura de efectos.** Una unidad se habilita cuando su
contrato declara mutaciones permitidas, estado final esperado, acciones
prohibidas, observadores y postcondiciones para todos sus efectos materiales.
Un solo efecto material `NO_OBSERVABLE` mantiene la unidad congelada o exige
validación humana específica.

`git diff` no observa escrituras fuera del workspace; un exit code no demuestra
ausencia de instalación de software, cambios de registro o escritura de
credenciales; un push puede producir mutaciones remotas colaterales; y una
edición puede crear archivos fuera del diff.

Se requieren conjuntamente: unidades 1 a 3 cerradas; fase de aceptación de
permisos satisfecha; efectos materiales de la unidad completamente observables;
y ausencia de disparadores de 0015.

### Secuencia del roadmap

**REGLA DE CONDUCTA.** La secuencia es: unidad 1; depuración de
`.claude/settings.local.json` y baseline autorizada; unidades 2a, 2b y 3 bajo
esa baseline; evaluación de las pull requests que ejercitaron el circuito; y
descongelamiento.

### Reducción explícita

**DEFINICIÓN ESTRUCTURAL.** Cerrar los tres gates no demuestra que el sobre
operativo limite el daño como conjunto. Es el riesgo 7 aceptado en 0015 y sigue
abierto.

### Degradación y fallos de vía

**GATE MECÁNICO.** Un `401` o una capacidad ausente no degrada un gate de
producto ya satisfecho. Los estados terminales son distinguibles:
`GATE_FALLIDO`, `CAPACIDAD_NO_DISPONIBLE`, `VIA_NO_AUTENTICADA`,
`ROL_INCOMPATIBLE`, `ROL_AMBIGUO` y `DEPENDENCIA_MATERIAL_OMITIDA`.

### Perfiles y no objetivos

**DEFINICIÓN ESTRUCTURAL.** Los perfiles que la implementación debe representar
son `manual`, `puente`, `review` y `github_close`.

**REGLA DE CONDUCTA.** No son objetivos de esta línea: bus de eventos, DAG,
leases, base de datos nueva, migración a GitButler, optimización de tokens,
`pass^k` por PR, plantilla universal, migración total al puente ni aislamiento
por worktree como requisito.

## Relación con el canon

**REFERENCIA NORMATIVA.** Esta decisión complementa
[0009](0009-modelo-operativo-de-desarrollo-con-ia.md),
[0010](0010-revision-con-principal-y-segunda-opinion-ciega.md),
[0013](0013-delegar-cierre-operativo-y-merge-rutinario.md),
[0014](0014-clases-de-cambio-y-verificaciones-exigidas.md) y
[0015](0015-sobre-operativo-del-mvp-local-supervisado.md) sin duplicarlos.
Remite a `guias/construccion-de-gates.md` como entregable futuro de la unidad 3;
no crea esa guía en esta unidad.

## Resultado esperado

La línea distingue compuertas reales de observaciones y conducta, conserva una
identidad de rol estable sin mezclarla con ocupantes o superficies, y define las
condiciones verificables que las unidades 2a, 2b y 3 deberán implementar y
probar antes de reanudar nuevas unidades de `app/`.
