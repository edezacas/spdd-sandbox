# spdd-sandbox

Proyecto sandbox, sin propósito de producto real, para probar manualmente las skills de [open-spdd](https://github.com/) (`spdd-agent`, `spdd-canvas`, `spdd-design`, `spdd-implement`, `spdd-verify`, `spdd-sync`, `spdd-migrate`) contra código de verdad.

## Dominio

Sistema mínimo de biblioteca:

- `Author` — autores de libros
- `Book` — libros, cada uno con un autor
- `Loan` — préstamos de un libro a una persona, con devolución

Todo en memoria, sin base de datos ni framework — lo justo para que el flujo canvas → design → implement → verify tenga entidades y operaciones reales sobre las que trabajar.

## Uso

```bash
npm install
npm run dev
```

Para probar el flujo SPDD, describe una feature nueva (p. ej. "quiero poder reservar un libro que está prestado") y deja que `spdd-agent` orqueste canvas → design → implement → verify.

## Medir el framework (tokens, coste, duración)

Cada sesión de Claude Code guarda un transcript local (`~/.claude/projects/.../*.jsonl`) con el consumo de tokens de cada turno y las invocaciones de skills. `scripts/spdd-metrics.ts` lee esos transcripts, agrupa el consumo por fase SPDD (`spdd-canvas`, `spdd-design`, `spdd-implement`, `spdd-verify`, etc.) y calcula tokens, coste estimado y duración por fase — tanto si la fase se invocó inline en la sesión como si `spdd-agent` la lanzó en background (subagente vía el tool `Agent`, el modo por defecto).

```bash
npm run metrics
```

Pasos para probarlo:

1. Corre cualquier skill SPDD (`/spdd-canvas`, `/spdd-agent`, ...) sobre una feature del dominio.
2. Al terminar, corre `npm run metrics`.
3. Revisa el reporte generado en `docs/metrics/<fecha>-report.md` y el histórico acumulado en `docs/metrics/spdd-metrics.csv` (una fila por fase, útil para comparar entre features a medida que se acumulan).

Para las fases lanzadas en background, el reporte incluye una columna **"Aislado"**: verifica que el contexto de esa fase arrancó vacío y no heredó el histórico de la fase anterior (comparando el tamaño del primer turno contra los tokens acumulados por las fases previas de la misma sesión — el detalle de la fórmula está en `docs/plan-spdd-metrics.md`).

Si corres el script sin haber invocado ninguna skill SPDD todavía, avisa que no encontró nada que medir — no genera reporte vacío.

Detalles de diseño (fuente de datos, pricing usado, alcance de la v1) en [`docs/plan-spdd-metrics.md`](docs/plan-spdd-metrics.md).
