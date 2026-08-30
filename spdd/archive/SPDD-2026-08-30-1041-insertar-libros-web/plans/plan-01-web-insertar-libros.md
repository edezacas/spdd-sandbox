# Plan: Capa web para insertar libros manualmente

> Part of the canvas at [../canvas.md](../canvas.md) — Requirements, Norms, and Safeguards live there and apply to this plan too; do not duplicate them here. `spdd-implement` and `spdd-verify` always read both files together.

**Status:** Verified
> Implemented: 2026-08-30
> Verified: 2026-08-30
**Depends on:** none
**Shared touchpoints:** none

---

## Operations

Subset of the canvas's Operations that belong to this plan (copiado verbatim de `canvas.md`):

| Type | Identifier | Description |
|------|-----------|-------------|
| `GET` | `/books/new` | Muestra el formulario HTML para insertar un libro (título + select de autores existentes) |
| `POST` | `/books` | Procesa el formulario: valida `title` y `authorId`, crea el libro vía `addBook()`, redirige a `/books` |
| `GET` | `/books` | Lista todos los libros existentes (título + nombre de autor), sirve como confirmación visual tras el insert |

---

## Entities & Structure

**Entities this plan owns** (from the canvas's Entities section):
- `Book` (`src/domain/book.ts`, Existing) — se crea vía `addBook()`; el `id` lo genera el servidor web con `crypto.randomUUID()`.
- `Author` (`src/domain/author.ts`, Existing) — solo lectura (`listAuthors`, `getAuthor`) para poblar el `<select>` y validar `authorId`.

**Structure — files to create or modify:**

```
src/web/server.ts          # NEW - servidor HTTP (módulo nativo `http` de Node), enrutamiento básico
src/web/routes/books.ts    # NEW - handlers: GET /books/new, POST /books, GET /books
src/web/views/bookForm.ts  # NEW - funciones que generan el HTML del formulario, el listado y mensajes de error
package.json                # MODIFIED - agrega script "web": "ts-node src/web/server.ts"
```

`src/domain/book.ts` y `src/domain/author.ts` no se modifican (la validación de `authorId` vive en la capa web).

Nota de partición: un solo plan porque las tres Operations comparten el mismo archivo de rutas (`src/web/routes/books.ts`) y el mismo módulo de vistas (`src/web/views/bookForm.ts`); no hay una frontera de Structure separable sin forzarla.
