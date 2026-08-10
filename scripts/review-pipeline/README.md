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

- El HEAD y el diff se congelan antes de revisar.
- El prompt se construye una sola vez y su hash queda en el manifiesto.
- Principal y shadow reciben ese mismo prompt en workspaces separados, sin
  herramientas ni resultados previos.
- El shadow no recibe el motivo que lo activó.
- Los reviewers no publican. `publish=consolidada` se ejecuta después de la
  fusión y crea una sola review sin comentarios inline.
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
y `@openai/codex@0.147.0`. El harness debe provenir de una revisión confiable;
el checkout de la PR se trata sólo como datos y nunca se ejecuta con secretos.

La integración en GitHub Actions requiere `ANTHROPIC_API_KEY` y
`OPENAI_API_KEY`. El runner local también puede reutilizar las sesiones ya
autenticadas de ambos CLIs. Tokens de suscripción no se convierten a precios de
API.

## Pruebas

```powershell
node --test scripts/review-pipeline/review-pipeline.test.mjs
```

Las pruebas cubren schema, fusión, decisión, materialidad, muestreo, riesgo,
`publish=none`, ceguera mediante hashes y fallos cerrados. No consumen cuota de
reviewers.
