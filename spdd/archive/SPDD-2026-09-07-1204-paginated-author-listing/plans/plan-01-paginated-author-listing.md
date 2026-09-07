# Plan: Paginated author listing (GET /authors)

> Part of the canvas at [../canvas.md](../canvas.md) — Requirements, Norms, and Safeguards live there and apply to this plan too; do not duplicate them here. `spdd-implement` and `spdd-verify` always read both files together.
> Language: all section headings, labels, and body content are in English.

**Status:** Verified
> Implemented: 2026-09-07
> Verified: 2026-09-07 (spdd-verify — 34/34 tests pass; 3 targeted tests added for uncovered Safeguards scenarios)
**Depends on:** none (single plan — this canvas produced only this plan, so there is nothing to depend on)
**Shared touchpoints:** none (no other plans exist for this canvas)

---

## Operations

Subset of the canvas's Operations that belong to this plan (copy verbatim from `canvas.md`'s Operations table — do not paraphrase):

| Type | Identifier | Description |
|------|-----------|-------------|
| `GET` | `/authors?page=<n>&pageSize=<m>` | Paginated HTML listing of authors in insertion order. Both params optional: `page` (1-based, default 1) and `pageSize` (default 10, max 100). Invalid values → `400` + HTML error message. A page beyond the last → `200` with an empty page. Renders prev/next links and a "page X of Y" indicator. |

*(Stack adaptation: no HTTP framework — operations are native-`http` routes dispatched in `src/web/server.ts`, handlers in `src/web/routes/authors.ts`, views in `src/web/views/authorList.ts`. Non-GET verbs on `/authors` → `405`, mirroring the `/books` routing policy.)*

---

## Entities & Structure

**Entities this plan owns** (from the canvas's Entities section):
- `Author` — existing, `src/domain/author.ts`, unchanged: `{ id: string; name: string }`. `listAuthors()` keeps returning every author (the `GET /books/new` regression scenario depends on this).
- `AuthorsPage` — new, `src/domain/author.ts`: `{ items: Author[]; page: number; pageSize: number; total: number; totalPages: number }`, returned by the new `listAuthorsPage(page, pageSize)` query (`totalPages = Math.ceil(total / pageSize)`, `0` when the repository is empty).

**Structure — files to create or modify:**

```
src/domain/author.ts         — modify: add AuthorsPage interface + listAuthorsPage(page, pageSize); listAuthors() stays as-is
src/web/routes/authors.ts    — create: handleListAuthors(req, res) — parse the URL query, validate page/pageSize (400 on invalid), call listAuthorsPage, render
src/web/views/authorList.ts  — create: renderAuthorList(page: AuthorsPage) — pure function; table + prev/next links + "page X of Y" indicator; escapeHtml for names
src/web/server.ts            — modify: route GET /authors and 405 for other verbs on /authors; must split the query string off req.url (current routes match req.url for exact equality and have never seen a query string)
src/domain/author.test.ts    — create: unit tests for listAuthorsPage (slicing math, totalPages rounding, empty repo, out-of-range page, throws on invalid numbers, listAuthors() unchanged)
src/web/server.test.ts       — modify: integration tests for the GET /authors scenarios above
```
