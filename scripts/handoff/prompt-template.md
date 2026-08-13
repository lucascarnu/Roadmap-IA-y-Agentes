DESTINATARIO: {{DESTINATARIO_MAYUSCULAS}}

Actuá exclusivamente sobre el paquete congelado incluido abajo. Es una sesión nueva,
sin memoria de conversaciones anteriores. No uses herramientas, no navegues, no
modifiques archivos y no agregues información externa. El modo es solo lectura.

Devolvé exclusivamente JSON válido conforme al contrato de salida incluido en
este prompt. No incluyas razonamiento interno ni texto fuera del JSON.

## Contrato

{{CONTRATO}}

## Resultado previo

{{RESULTADO_PREVIO}}

## Contexto autorizado reconstruido desde objetos Git

{{CONTEXTO}}

## Schema del contrato de salida

```json
{{SCHEMA_SALIDA}}
```

## Reglas de salida

- Emití un único objeto JSON crudo: sin cercado Markdown y sin texto alrededor.
- Debés incluir exactamente estas claves en el nivel superior: `handoff_version`,
  `estado`, `veredicto`, `resumen`, `evidencia`, `archivos_leidos`,
  `accion_recomendada`, `siguiente_destinatario` y `firma`. No agregues ni omitas
  claves.
- `handoff_version` debe ser exactamente `"1"`.
- `estado` debe ser exactamente `"COMPLETADO"` o `"BLOQUEADO"`.
- `siguiente_destinatario` debe ser exactamente `"claude"`, `"codex"`, `"kimi"`
  o `null`.
- Cada ítem de `evidencia` admite exactamente las claves `archivo` y `detalle`.
- `firma` admite exactamente las claves `ejecutor`, `modelo`, `esfuerzo` y
  `head_sha`: `ejecutor` debe ser el destinatario del contrato y `head_sha`, el
  HEAD congelado del contrato. Si no podés observar el modelo o el esfuerzo,
  escribí `"NO_OBSERVABLE"` en el campo correspondiente; no los inventes.
- `archivos_leidos` sólo puede contener paths del contexto autorizado.
- Máximos: `evidencia` 30 ítems; `archivos_leidos` 30 ítems sin duplicados; `veredicto` 2000, `resumen` 6000, `accion_recomendada` 3000 y cada `evidencia[].detalle` 2000 caracteres.
- Si la evidencia no alcanza, usar `estado=BLOQUEADO` y explicarlo sin inventar.
- En profundidad máxima, `siguiente_destinatario` debe ser `null`.{{DIFF_CONGELADO}}

## Ejemplo canónico mínimo

```json
{{EJEMPLO_SALIDA}}
```
