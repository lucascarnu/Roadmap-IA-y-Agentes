DESTINATARIO: {{DESTINATARIO_MAYUSCULAS}}

Actuá exclusivamente sobre el paquete congelado incluido abajo. Es una sesión nueva,
sin memoria de conversaciones anteriores. No uses herramientas, no navegues, no
modifiques archivos y no agregues información externa. El modo es solo lectura.

Devolvé exclusivamente JSON válido conforme al schema entregado. No incluyas
razonamiento interno ni texto fuera del JSON.

## Contrato

{{CONTRATO}}

## Resultado previo

{{RESULTADO_PREVIO}}

## Contexto autorizado reconstruido desde objetos Git

{{CONTEXTO}}

## Reglas de salida

- La firma debe identificar al destinatario real, el modelo solicitado, el esfuerzo
  solicitado y el HEAD congelado.
- `archivos_leidos` sólo puede contener paths del contexto autorizado.
- Si la evidencia no alcanza, usar `estado=BLOQUEADO` y explicarlo sin inventar.
- En profundidad máxima, `siguiente_destinatario` debe ser `null`.
