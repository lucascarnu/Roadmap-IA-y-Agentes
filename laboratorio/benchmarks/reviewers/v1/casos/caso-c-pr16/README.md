# Caso C — PR #16 — Complejo

## Input congelado

Este directorio contiene el **input congelado** del Caso C del Reviewer Benchmark
v1. Permite reconstruir el caso sin consultar el HEAD vivo de la PR #16.

No contiene la respuesta correcta. La auditoría de Run 1 vive separada en
[Kimi Open Platform — Run 1](../../resultados/kimi-open-platform-run-1.md) y no
debe entregarse a un reviewer bajo prueba. Tampoco deben entregarse resultados de
runs anteriores: hacerlo contaminaría el benchmark.

## Identidad canónica

- Repositorio: `lucascarnu/Roadmap-IA-y-Agentes`
- PR: [#16](https://github.com/lucascarnu/Roadmap-IA-y-Agentes/pull/16)
- Base congelada: `62411360bf36aa649c94f5a0a109caeb9b887acc`
- HEAD congelado: `2587b3cfd3db9831386b6a04fbfa3807444fd458`
- Base nominal: `main`

Los SHA de base y HEAD identifican canónicamente el caso.

## Componentes permitidos

- Metadata básica: [`pr-metadata.json`](pr-metadata.json).
- Diff completo: [`diff.patch`](diff.patch).
- Política gobernante y su bloque auxiliar:
  [`contexto/reviewer-policy.md`](contexto/reviewer-policy.md).
- Los demás bloques auxiliares reproducidos exactamente: `vision-extracto.md`,
  `reglas.md` y `decision-0004.md`, dentro de [`contexto/`](contexto/).

La adaptación a cada interfaz se definirá posteriormente. Debe conservar
equivalencia semántica y no incorporar auditorías, respuestas esperadas ni
resultados anteriores.

## Reproducibilidad

[`manifest.json`](manifest.json) enumera archivos, fuentes, hashes y
limitaciones. Cuatro bloques auxiliares y el resto del input canónico se
reconstruyeron desde fuentes congeladas. El texto exacto del bloque histórico de
Actions no quedó persistido: `contexto/actions-evidence.txt` documenta esa
limitación y no es un sustituto entregable.

Por esa razón, el paquete es parcialmente reproducible y el manifiesto declara
`exact_reproduction: false`.

Los hashes del manifiesto se calculan sobre los bytes canónicos del repositorio,
en UTF-8 y con saltos LF. `vision-extracto.md` agrega un LF terminal de empaquetado
que no formó parte del bloque enviado; el manifiesto conserva también el hash y
el tamaño del bloque sin ese byte.

## Características

- PR compleja;
- múltiples workflows;
- documentación y reglas;
- reviewer experimental;
- contexto auxiliar;
- posibilidad de errores de interpretación entre diff, cuerpo de PR y política;
- complejidad suficiente para medir falsos positivos y razonamiento de
  compuertas.

## Tamaño observado

- Archivos cambiados: 7
- Adiciones: 1513
- Eliminaciones: 0

## Condiciones relevantes

- diff completo, sin recorte;
- `reviewer-policy.md` incluida;
- política nacida en la propia PR: independencia respecto de la política
  limitada;
- documentación externa no habilitada;
- máximo de dos rondas;
- Ronda 2 solo ante `NEEDS_EVIDENCE` M1/M2 con una fuente servible.
