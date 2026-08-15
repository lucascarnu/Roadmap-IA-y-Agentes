# 0011 — Suscripciones primero; API solo si hace falta

- **Estado:** aceptada
- **Fecha:** 2026-08-10

## Contexto

Este repositorio y sus automatizaciones sirven principalmente a proyectos personales y de aprendizaje. No existe, por ahora, una necesidad de operar una plataforma comercial 24/7 ni de pagar infraestructura variable solo para obtener una automatización más elegante.

Claude Code y Codex ya fueron probados como reviewers usando sesiones autenticadas con las suscripciones mensuales del Director. Esa vía consume cuota incluida en las suscripciones, pero evita facturación PAYG por token de Anthropic y OpenAI.

El pipeline de revisión integrado en `main` fue diseñado inicialmente para GitHub-hosted Actions más API keys porque esa vía simplifica la automatización remota. Esa elección es una implementación provisional, no una obligación arquitectónica.

## Decisión

**Para cualquier tarea de IA de este repositorio, la vía por suscripción existente es la opción preferida por defecto cuando sea técnicamente razonable.**

Esto aplica a reviews, generación o corrección de código, análisis de arquitectura y otras tareas ejecutables mediante Claude Code, Codex u otras herramientas ya cubiertas por una suscripción activa.

Las APIs PAYG se usan solo de manera excepcional y cuando se cumplan **todas**
estas condiciones:

1. existe una justificación material para apartarse de la vía por suscripción,
   porque esta no es razonable para la tarea, la automatización remota aporta un
   beneficio material o se necesita una prueba o medición que no puede hacerse
   de otra manera;
2. existe una estimación razonable del costo que se incurriría;
3. Lucas, como Director / Product Owner, aprueba explícitamente ese uso de PAYG
   después de conocer la justificación y la estimación.

**Tener una API disponible no es razón suficiente para usarla.**

## Criterio de diseño

El sistema debe optimizar, en este orden, por:

1. costo marginal bajo o nulo;
2. simplicidad y mantenibilidad;
3. seguridad razonable;
4. automatización útil;
5. pureza de infraestructura o funcionamiento completamente cloud-native.

Un workaround local, reproducible y suficientemente seguro es preferible a una solución cloud-native que agregue gasto recurrente sin resolver un problema real.

## GitHub y la orquestación

GitHub puede seguir siendo el bus del sistema: repositorio, PRs, estado, artefactos, checks y coordinación de quién sigue.

La coordinación determinista —por ejemplo, detectar que un paso terminó, elegir el siguiente rol, validar estado, fusionar resultados o publicar un resultado— **no debe introducir llamadas a modelos de IA** si puede resolverse con reglas y scripts.

La inferencia es una capa separada. Siempre que sea viable, Claude Code y Codex deben ejecutarse mediante sus sesiones de suscripción, aunque la coordinación del trabajo viva en GitHub.

No se debe montar un self-hosted runner permanente, una cola, una base de datos, un broker u otra infraestructura adicional solo para evitar copiar y pegar prompts. Si una utilidad local pequeña resuelve el handoff con menos costo y riesgo, esa solución tiene prioridad.

## Costos y aprobación

Antes de introducir una API PAYG en un flujo recurrente se debe dejar explícito:

- qué tarea concreta requiere la API;
- por qué la vía por suscripción no alcanza;
- cuál es el costo aproximado por corrida y por mes;
- qué alternativa más barata se descartó y por qué.

Si estos datos no están disponibles, la decisión queda pendiente y no se debe asumir API por defecto.

Una prueba puntual con API puede ser aprobada explícitamente por Lucas, después
de conocer su justificación y costo estimado, sin convertir esa vía en
arquitectura permanente.

### Preautorización de saldo preexistente

Un saldo API preexistente puede utilizarse sin una nueva aprobación por corrida
cuando el Director haya dejado una preautorización explícita, acotada y vigente
para ese saldo o vía, con sus límites materiales definidos. Mientras el uso se
mantenga dentro de esos límites, no se vuelve a consultar al Director por cada
corrida.

Si el saldo autorizado se agota o el uso pretendido excede sus límites, el
circuito vuelve a una vía gratuita, de suscripción u otra contingencia ya
autorizada; si así no puede satisfacer un gate obligatorio, se detiene de forma
segura.

La preautorización no autoriza por sí sola Auto-recharge, recargas, compras de
saldo, upgrades, cambios de plan, nuevas obligaciones económicas ni gasto por
encima del saldo o de los límites autorizados. Cualquiera de esas acciones
requiere una autorización nueva del Director. Esta regla formaliza una clase de
autorización: no crea por sí misma una autorización económica.

## Relación con 0010

`0010` define cómo se combinan reviewer principal y shadow, pero no obliga a ningún mecanismo de facturación ni entorno de ejecución.

La configuración actual del pipeline puede seguir usando `principal=claude` y `shadow=codex`; esta decisión solo fija que, antes de añadir `ANTHROPIC_API_KEY` y `OPENAI_API_KEY` como solución permanente, se debe intentar una vía razonable que aproveche las suscripciones existentes.

## Regla de no desvío

Cuando una propuesta futura recomiende API, infraestructura cloud o gasto recurrente para Claude, Codex u otra herramienta ya cubierta por suscripción, debe comprobar primero esta decisión.

La pregunta obligatoria es:

> ¿Estamos pagando por una capacidad que ya tenemos incluida y existe un workaround razonable para usarla?

Si la respuesta es sí, se conserva la vía por suscripción salvo aprobación explícita del Director.
