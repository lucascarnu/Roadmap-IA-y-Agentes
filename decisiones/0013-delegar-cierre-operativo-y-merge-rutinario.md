# 0013 — Delegar cierre operativo y merge rutinario

- **Estado:** propuesta
- **Fecha:** 2026-08-11

## Contexto

El Director / Product Owner no es el operador técnico del repositorio. Su función es definir intención, prioridades, experiencia buscada, restricciones, presupuesto y tolerancia al riesgo. El modelo operativo de `0009` ya delega las decisiones técnicas rutinarias y reversibles al equipo y establece que el merge manual no es un principio.

Persistía, sin embargo, una ambigüedad operativa: el circuito actual podía detenerse con una pull request técnicamente lista para integrar y pedir al Director una confirmación del tipo "¿hago merge?". Ese paso no representa una decisión de producto y convierte al Director en un cable humano del workflow.

## Decisión

Las decisiones operativas rutinarias de Git y GitHub —crear y cerrar ramas, abrir pull requests, solicitar o coordinar revisiones, evaluar gates, decidir el cierre técnico e integrar una PR— se delegan al circuito técnico y no requieren una confirmación manual del Director cuando los criterios objetivos aplicables ya están satisfechos.

El Arquitecto / Lead conserva la responsabilidad definida en `0009`: recibe la implementación, las pruebas y los hallazgos disponibles, los audita en conjunto y decide si corresponde corregir o cerrar la unidad de trabajo. Cuando decide que la unidad está apta y no existe un gate pendiente, la integración puede ejecutarse sin volver a consultar al Director.

## Gate mínimo para integración rutinaria

Una PR puede integrarse sin intervención del Director cuando, para el HEAD exacto que se va a integrar:

1. el alcance corresponde a una tarea ya autorizada;
2. las verificaciones exigidas para esa clase de cambio terminaron satisfactoriamente;
3. la revisión independiente requerida por proporcionalidad se ejecutó realmente y no dejó hallazgos materiales abiertos, o el cambio era de una clase en la que `0009` permite omitirla;
4. QA, cuando sea obligatorio para esa clase de cambio, no dejó validación material pendiente;
5. no existe una discrepancia material entre la evidencia revisada y el HEAD actual;
6. la integración es técnicamente posible y no exige saltarse una protección o garantía objetiva.

Si esas condiciones se cumplen, pedir al Director que elija entre "mergear" o "no mergear" no agrega una decisión útil: el circuito integra y reporta después el resultado.

## Cuándo sí se escala al Director

La delegación anterior no reduce la autoridad del Director. Se escala antes de continuar cuando aparece cualquiera de estos casos:

- cambio de producto, alcance o intención;
- costo relevante o uso PAYG que requiera su aprobación;
- privacidad o seguridad aceptada;
- acción irreversible o con impacto externo relevante;
- alternativas materiales genuinamente razonables que la evidencia no resuelve;
- contradicción con una instrucción consciente del Director;
- ausencia de evidencia suficiente para satisfacer un gate obligatorio.

El Director conserva el veto y puede ordenar una excepción o cambio de criterio después de conocer el trade-off. Los agentes deben objetar una decisión técnicamente mal fundada, pero no pueden convertir una decisión técnica rutinaria en una aprobación humana obligatoria por comodidad.

## Relación con las reglas vigentes

Esta decisión concreta el principio de `0009` de que el merge manual no es parte del modelo y define el criterio objetivo que allí había quedado abierto.

La frase de `reglas.md` que describe el estado actual como "el circuito automático termina con la pull request lista para integrar" debe entenderse como una limitación de implementación, no como una autorización humana obligatoria. Cuando el ejecutor o la herramienta disponible pueda satisfacer y ejecutar el gate anterior, puede integrar sin pedir una confirmación adicional.

La automatización técnica completa del gate puede implementarse gradualmente. Mientras no exista, un agente con acceso suficiente puede aplicar el mismo criterio de forma trazable y ejecutar la integración.

## Resultado esperado

Lucas participa en decisiones de producto, preferencias, restricciones y excepciones materiales. No opera GitHub ni arbitra decisiones técnicas rutinarias por defecto. El flujo debe tender a que implementación, revisión, corrección, revalidación e integración ocurran con la menor intervención humana compatible con los gates definidos.
