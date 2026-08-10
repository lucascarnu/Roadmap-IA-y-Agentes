# Laboratorio

## Propósito

El laboratorio es una rama documental auxiliar del proyecto. Registra pruebas y
aprendizajes obtenidos durante la construcción del sistema sin mezclar ese
material con el producto ni con las entidades que la aplicación debe
representar.

No forma parte del modelo de datos del MVP, no es una entidad del roadmap y no
debe ser consumido automáticamente por el lector o la aplicación salvo una
decisión futura explícita.

## Tipos de contenido

- [Benchmarks](benchmarks/README.md): comparaciones controladas y reproducibles.
- [Experimentos](experimentos/README.md): pruebas de preguntas o hipótesis.
- [Prototipos técnicos](prototipos-tecnicos/README.md): implementaciones
  temporales para comprobar factibilidad o comportamiento.
- [Evaluaciones](evaluaciones/README.md): análisis estructurados de evidencia.

## Ciclo general

Cuando corresponda, cada trabajo sigue este ciclo:

hipótesis → diseño de prueba → condiciones → ejecución → evidencia → resultado
→ aprendizaje → estado final

Los estados posibles son `ADOPTADO`, `DESCARTADO`, `INCONCLUSO` y
`EN_EVALUACION`, sin imponerlos a trabajos donde no resulten pertinentes.

El laboratorio puede conservar trabajos adoptados, descartados, fallidos o
inconclusos. Cada registro debe mantener trazabilidad y reproducibilidad cuando
corresponda.

## Separación del producto

El contenido de `laboratorio/` no altera automáticamente decisiones, reglas,
arquitectura, MVP, ranking ni roadmap. Si un resultado produce una decisión
material, esa decisión debe persistirse en el lugar canónico correspondiente.

El laboratorio conserva la evidencia; no reemplaza la decisión.

## Portabilidad

El contenido se mantiene en Markdown plano y artefactos simples. La carpeta debe
poder extraerse a otro repositorio en el futuro sin romper el MVP.
