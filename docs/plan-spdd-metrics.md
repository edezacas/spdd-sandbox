# Plan: medición de eficiencia y consumo de tokens del framework SPDD

## Objetivo

Medir, por fase SPDD (`spdd-canvas` / `spdd-design` / `spdd-implement` / `spdd-verify` / `spdd-agent` / `spdd-sync` / `spdd-migrate`), el consumo de tokens, el coste estimado y la duración real, para poder afinar las skills con datos en vez de intuición.

## Fuente de datos

Claude Code ya guarda, por sesión, un transcript JSONL en:

```
~/.claude/projects/-home-eduarddeza-Sites-edezacas-spdd-sandbox/<sessionId>.jsonl
```

Verificado en este proyecto (`05c6f1f6-...jsonl`): cada entrada `type: "assistant"` trae `message.usage` con `input_tokens`, `output_tokens`, `cache_creation_input_tokens` (desglosado en `cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`) y `cache_read_input_tokens`, más `timestamp`. Las invocaciones de skills aparecen como bloques `tool_use` con `name: "Skill"` e `input.skill` (p. ej. `spdd-canvas`).

No hace falta ningún sistema paralelo de logging: el transcript ya es la fuente de verdad, local y completa.

## Pricing (Sonnet 5, modelo por defecto de esta sesión)

| Concepto | Precio |
|---|---|
| Input | $2.00 / MTok |
| Output | $10.00 / MTok |
| Cache write (TTL 5m, ×1.25) | $2.50 / MTok |
| Cache write (TTL 1h, ×2) | $4.00 / MTok |
| Cache read (×0.1) | $0.20 / MTok |

Se deja como tabla configurable en el script porque el modelo/pricing puede cambiar.

## Mecanismo

Script standalone `scripts/spdd-metrics.ts` (ejecutado con `ts-node`, ya presente en el repo):

1. Localiza el directorio de transcripts del proyecto actual (slug derivado del cwd, igual que Claude Code).
2. Parsea todos los `.jsonl`, quedándose con:
   - entradas `assistant` con `usage` + `timestamp`
   - bloques `tool_use` de nombre `Skill` (marcan el inicio de una fase)
3. Segmenta la línea de tiempo por invocación de skill: cada segmento va desde una invocación hasta la siguiente (o hasta el final de la sesión).
4. Por segmento calcula: tokens totales (input/output/cache write/cache read), coste estimado (según tabla de pricing), duración real (primer a último timestamp) y ratio de acierto de caché (`cache_read / (cache_read + cache_creation)`).
5. Genera:
   - un reporte Markdown por sesión en `docs/metrics/<fecha>-<sessionId>.md`
   - una fila añadida a `docs/metrics/spdd-metrics.csv` (una fila por fase, para poder comparar tendencias entre features a medida que se acumulan)

## Alcance v1 (deliberadamente simple)

- No se cruza con git (tamaño de diff, ficheros tocados) todavía — se añade después si el dato de tokens/coste no basta para decidir qué afinar.
- No se agrupa por "feature" (slug de `spdd/changes/<slug>/`) todavía, porque aún no hay ninguna feature construida con las skills en este sandbox — se decide cómo agrupar cuando se vea el primer canvas real generado.
- Solo lectura: el script no modifica transcripts ni archivos de SPDD.

## Uso

```
npm run metrics
```

Se corre manualmente después de cada flujo `spdd-agent` (o de cualquier sesión) para obtener el último reporte.

## v2: fases en background + verificación de aislamiento de contexto

`spdd-agent` no siempre invoca las skills SPDD inline: en modo aislado (el modo por defecto en Claude Code) lanza cada fase (`spdd-canvas`/`spdd-design`/`spdd-implement`/`spdd-verify`) como un subagente en segundo plano vía el tool `Agent`. En ese modo, el transcript de la sesión principal nunca contiene un `tool_use` de `Skill` — solo contiene `tool_use` de `Agent` — así que la v1 (que solo miraba marcadores `Skill` en la sesión) no veía nada de esas fases.

**Fuente de datos adicional, verificada empíricamente:** cada subagente lanzado con `Agent` persiste su propio transcript, completo y aislado, en:

```
~/.claude/projects/<project-slug>/<sessionId>/subagents/agent-<agentId>.jsonl
```

(también existe un `agent-<agentId>.meta.json` con `description`/`agentType`/`model`, pero el script no lo usa — la detección de fase se hace igual que en modo inline, buscando el primer `tool_use` de `Skill` con `input.skill` en `SPDD_SKILLS` dentro del propio archivo, para no acoplarse a dos formatos internos en vez de uno).

Cada `agent-<id>.jsonl` arranca con una única entrada `type: "user"` (el prompt autocontenido que se le pasó al subagente) — no hay ningún mensaje previo de la conversación padre. Esto ya es la garantía de diseño, pero se puede además **verificar con evidencia** dentro del propio archivo:

- `isolationRatio = firstTurnContextTokens / priorPhasesCumulativeTokens`, donde `firstTurnContextTokens` es `input_tokens + cache_read + cache_creation` de la primera entrada `assistant` del archivo, y `priorPhasesCumulativeTokens` es la suma de tokens de las fases background anteriores en la misma sesión. Si el contexto se heredara, el primer turno de una fase tardía (p. ej. `verify`, después de que canvas+design+implement ya generaron millones de tokens) tendría que cargar ese volumen — en la práctica se mantiene plano (~28-29K en las 4 fases medidas), muy por debajo del umbral `ISOLATION_MAX_RATIO = 0.5`.
- `preludeUserEntryCount`: nº de entradas `type: "user"` antes del primer `assistant` del archivo. Debe ser 1 (el prompt raíz); más de 1 indicaría turnos heredados presentes literalmente en el transcript.
- `contextIsolated` combina ambas señales y se reporta como columna, junto con las cifras crudas — no solo el booleano — para que el resultado sea auditable, no una afirmación de diseño sin evidencia.

**Segmentación por sesión, no global:** la v1 mezclaba `usage`/marcadores de todos los `.jsonl` del proyecto en un único timeline. Para poder calcular "tokens acumulados de fases previas en *esta* sesión" hace falta procesar cada sesión (y su `subagents/`) de forma independiente — cambio mínimo, exigido directamente por la verificación de aislamiento.

**Compatibilidad del CSV:** las 12 columnas de la v1 no cambian de posición ni significado; se añaden `mode,sessionId,contextIsolated,isolationRatio,firstTurnContextTokens,priorCumulativeTokens,preludeUserEntryCount` al final. La cabecera se migra automáticamente (`ensureCsvHeader`) sin tocar filas históricas ya acumuladas.

**Degradación elegante:** si `<sessionId>/subagents/` no existe para una sesión (porque nunca se lanzó ningún subagente), esa sesión simplemente no aporta filas en modo background, sin romper el resto. La ruta interna `subagents/agent-<id>.jsonl` no es una API pública documentada de Claude Code — podría cambiar en una versión futura del harness.
