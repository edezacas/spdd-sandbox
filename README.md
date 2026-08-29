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
