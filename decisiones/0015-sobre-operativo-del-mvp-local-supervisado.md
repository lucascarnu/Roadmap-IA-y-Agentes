# 0015 — Sobre operativo del MVP local supervisado

- **Estado:** aceptada
- **Fecha:** 2026-08-20

## Contexto

U5 y U6 investigaron el confinamiento fuerte del sistema operativo y cerraron
en `BLOQUEADO_POR_LIMITE`. Los cinco actores conservan en
`scripts/handoff/actores.json` el mecanismo de confinamiento
`NO_CONFIGURADO` y la evidencia `NO_PROBADO`. Esta decisión no modifica esos
valores ni presenta el confinamiento como demostrado.

La decisión original del Director y el handoff durable de U7.1 están
registrados, respectivamente, en los comentarios
[5349264744](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/114#issuecomment-5349264744)
y
[5349282799](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/114#issuecomment-5349282799)
del Issue #114.

## Decisión

Para la etapa de MVP local supervisado, el objetivo de seguridad deja de ser
el confinamiento absoluto del sistema operativo y pasa a ser automatización
local controlada, auditable, recuperable y de daño limitado.

### Sobre mínimo

El sobre operativo reúne estos nueve componentes:

1. ejecución habitual sin privilegios administrativos;
2. workspace dedicado;
3. `main` protegido, con ramas y pull requests obligatorias;
4. copias de seguridad y recuperación posible;
5. credenciales acotadas, sin exponer secretos innecesarios;
6. aprobación humana para acciones destructivas, externas, irreversibles o
   sensibles;
7. registro durable de acciones y resultados;
8. mecanismo claro de detención;
9. prohibición de ampliar autónomamente el alcance autorizado.

### Lo que esta decisión no afirma

- No declara el confinamiento innecesario.
- No declara el confinamiento resuelto.
- No autoriza operación desatendida.
- No habilita a saltear los gates propios de cada cambio.

### Reclasificación

El confinamiento fuerte pasa de bloqueo previo a línea de endurecimiento
posterior al MVP. Esta reclasificación no alcanza a fallos operativos de
permisos, continuidad, ejecución no interactiva o gates que sigan bloqueando el
circuito actual.

## Riesgos aceptados por el Director

1. Ningún actor está confinado por el sistema operativo; un agente desviado
   corre con los privilegios del usuario habitual.
2. El daño se limita por convención y supervisión, no por mecanismo.
3. El directorio temporal y el perfil del usuario quedan alcanzables; las
   probes de U5 quedaron `NOT_RUN`.
4. La política de permisos sigue `CANDIDATA / EN PRUEBA`, sin las varias PR
   reales consecutivas que exige su criterio de aceptación.
5. Las reglas locales pueden ampliar la política sin que se note, y por eso no
   cuentan como evidencia de autonomía.
6. La detención depende de una persona presente; no hay parada automática.
7. El sobre no está probado como sobre: sus nueve puntos existen por separado
   y nadie verificó que juntos acoten el daño.

## Disparadores de reapertura

Cualquiera de estos casos suspende la habilitación por sobre operativo y obliga
a arbitrar:

- operación realmente desatendida;
- ejecución de código de terceros o no confiable;
- uso multiusuario;
- acceso a credenciales privilegiadas;
- exposición de servicios a Internet;
- ampliación material del alcance o del daño posible.

**Atribución local — decisión del Director:**

> «Una escritura, ejecución o modificación inesperada fuera del workspace y de las raíces operativas expresamente autorizadas obliga a detener esa vía y arbitrar si debe reabrirse el confinamiento fuerte.»

No cuentan como escape las lecturas legítimas ni el uso de temporales, cachés o
rutas declaradas previamente como parte del sobre. Esto no se convierte en una
lista blanca interminable de accesos normales.

**Atribución local — decisión del Director:**

> «Una solicitud interactiva inesperada dentro de un flujo declarado no interactivo detiene ese flujo y exige arbitraje. Reabre el confinamiento fuerte cuando implique ampliación de privilegios, elevación, cambio material de superficie o demuestre que el modelo de supervisión ya no limita suficientemente el daño.»

Una interacción inesperada no reabre automáticamente toda la investigación si
sólo es un defecto operativo corregible que no amplía privilegios ni alcance.

## Estado histórico y vigente de `app/`

El 2026-08-19 el Director levantó el congelamiento de nuevas unidades de
`app/`. Su fuente durable es el comentario
[5349264744](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/issues/114#issuecomment-5349264744)
del Issue #114. Este hecho histórico no se reescribe.

El 2026-08-20 el Director volvió a congelar las nuevas unidades de `app/` hasta
cerrar los gates críticos de continuidad, despacho y emisión, debido a fallos
que lo obligan a repetir reglas y contexto. Esta segunda decisión fue
comunicada en sesión y no tenía registro durable independiente anterior;
`0015` es su primer registro durable.

La segunda congelación es la vigente. No anula el desarrollo previo del MVP:
alcanza únicamente a nuevas unidades de `app/`.

El estado operativo vigente se mantiene en
[Estado de nuevas unidades de `app/`](../pendientes.md#estado-de-nuevas-unidades-de-app).

## Relación con el canon

`0015` complementa `0009` sin reemplazarlo. No altera `0008`, `0010`, `0013`
ni `0014`.

La habilitación de ejecución por sobre operativo corresponde a la futura
`U7.2` en el contrato v2. El puente v1 permanece en `solo_lectura`.

La arquitectura de plantillas y gates no forma parte de esta decisión y tendrá
una decisión posterior independiente.
