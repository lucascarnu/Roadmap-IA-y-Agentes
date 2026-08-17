# Pipeline de review principal + shadow

Implementación v1 de [0010](../../decisiones/0010-revision-con-principal-y-segunda-opinion-ciega.md).
Es un único pipeline con cuatro valores explícitos: `principal`, `shadow`,
`shadow_trigger` y `publish`.

La configuración inicial es de calibración:

```text
principal=claude
shadow=codex
shadow_trigger=always
publish=none
```

Ese orden es sólo el valor inicial intercambiable para probar el circuito; no
asigna ocupantes definitivos. Invertir `principal` y `shadow` no cambia el
schema, el prompt, los gates ni la fusión.

## Componentes

- `common-review.schema.json`: contrato común y única definición de findings.
- `config.json`: adaptadores, modelos y reglas deterministas pequeñas.
- `review-pipeline.mjs`: prepara el paquete, ejecuta un reviewer, decide el
  shadow, fusiona, calcula la decisión y publica sólo si se pide.
- `review-pipeline.test.mjs`: pruebas sin llamadas a modelos ni GitHub.
- `.github/workflows/blind-review-pipeline.yml`: orquestación manual inicial.

## Invariantes

- El HEAD se congela y el diff se calcula contra su `merge-base` con la base de
  la PR; cambios posteriores de la rama base no se atribuyen a la PR.
- `AGENTS.md`, `reviewer-policy.md`, `vision.md` y `reglas.md` gobernantes se
  leen directamente del objeto Git del SHA confiable, nunca del checkout bajo
  revisión ni de cambios locales no commiteados. Una propuesta de cambio a esos
  archivos aparece sólo dentro del diff revisado.
- El prompt se construye una sola vez y su hash queda en el manifiesto.
- Principal y shadow reciben ese mismo prompt en workspaces separados, sin
  herramientas ni resultados previos.
- El shadow no recibe el motivo que lo activó.
- Los reviewers no publican. `publish=consolidada` se ejecuta después de la
  fusión y crea una sola review sin comentarios inline.
- Las corridas del mismo workflow y PR se serializan. El marcador de publicación
  duplicada es una segunda defensa, no un lock atómico.
- Cualquier ausencia, incompatibilidad o contaminación detectable falla cerrado.

## Triggers

- `always`: ejecuta siempre el shadow.
- `material|muestreo|riesgo`: ejecuta por M1/M2 del principal, por
  `PR_NUMBER % 5 == 0` cuando no hubo materialidad, o por la lista corta de paths
  de `config.json`.

La clasificación de riesgo es deliberadamente pequeña. No intenta inferir
semántica ni sustituye una revisión de seguridad.

## Ejecución y credenciales

El workflow usa los CLIs oficiales fijados en `@anthropic-ai/claude-code@2.1.226`
y `@openai/codex@0.147.0`. El harness se obtiene de la rama por defecto y, antes
de exponer secretos, se exige que el ref despachado, `github.workflow_sha`, el
checkout y `origin/<rama-por-defecto>` identifiquen el mismo commit. El checkout
de la PR se trata sólo como datos y nunca se ejecuta con secretos.

La integración en GitHub Actions requiere `ANTHROPIC_API_KEY` y
`OPENAI_API_KEY`. El runner local también puede reutilizar las sesiones ya
autenticadas de ambos CLIs. Tokens de suscripción no se convierten a precios de
API.

## Transporte de completions largas

Cuando el stack lo permita, una completion larga usa timeouts explícitos por
fase y conserva en los errores la fase y una causa sanitizada. Retry y reenvío
se rigen por el presupuesto y las condiciones de detención del sobre autorizado;
no se agregan reintentos implícitos. Los valores concretos pertenecen al runner
durable, no a este requisito general.

El pipeline no se declara validado operativamente hasta completar una prueba
real del circuito. Las baterías deterministas verifican su lógica, no el
transporte efectivo de un proveedor.

## Pruebas

```powershell
node --test scripts/review-pipeline/review-pipeline.test.mjs
```

Las pruebas cubren schema, fusión, decisión, materialidad, muestreo, riesgo,
`publish=none`, ceguera mediante hashes y fallos cerrados. No consumen cuota de
reviewers.
