# REASONS: Paginated author listing (web)

> Generated on 2026-09-07. Review lines marked ⚠️ before generating code.
> Golden rule: if something breaks during development, fix this canvas first, then the code.
> Language: This canvas is written in English, regardless of the language of the feature description or conversation.

**Status:** Confirmed

*(Confirmed by user on 2026-09-07: presentation layer = web page `GET /authors`; default page size 10, max 100; invalid `page`/`pageSize` → strict `400`; page beyond the last → `200` with empty page.)*

---

## Requirements

**User story:**
As a library user, I want to browse authors in a paginated web listing so that I can navigate the author catalog in manageable chunks as it grows, instead of one unbounded list.

**Acceptance criteria:**

*(Write each as a WHEN/THEN scenario — concrete enough to become a test. Mark NEW for behavior that doesn't exist yet, MODIFIED for behavior that changes something already in `spdd/specs/`.)*

All criteria are **[NEW]** — nothing in this feature modifies behavior already spec'd in `spdd/specs/biblioteca.md`. The spec's out-of-scope note "Paginación o búsqueda en el listado de libros" refers to the *books* listing and remains untouched by this feature.

- **[NEW]** Scenario: Paginated listing with navigation (happy path)
  - WHEN the repository holds 25 authors and the user opens `GET /authors?page=2&pageSize=10`
   - THEN the server responds `200` with an HTML table showing authors 11–20 in insertion order (name per row), a "page 2 of 3" indicator *(rendered in Spanish: "Página 2 de 3" — copy confirmed by user 2026-09-07)*, a link to the previous page and a link to the next page
- **[NEW]** Scenario: Defaults without query params
  - WHEN the user opens `GET /authors` with no query string
   - THEN the server responds `200` showing page 1 with page size 10 *(confirmed: default page size 10, max 100)*
- **[NEW]** Scenario: Last partial page
  - WHEN 23 authors exist and the user opens `GET /authors?page=3&pageSize=10`
  - THEN the response shows the remaining 3 authors, "page 3 of 3", a previous-page link, and no next-page link
- **[NEW]** Scenario: No authors yet
  - WHEN the author repository is empty and the user opens `GET /authors`
  - THEN the server responds `200` with a "No hay autores todavía." message instead of a table, and no prev/next links
- **[NEW]** Scenario: Invalid pagination params
  - WHEN the user opens `GET /authors` with `page` or `pageSize` that is non-numeric, non-integer, `0`, negative, or a `pageSize` above 100 (e.g. `?page=abc`, `?page=0`, `?pageSize=500`)
   - THEN the server responds `400` with an HTML error message and does not render the listing *(confirmed: strict `400`, consistent with existing form validation in `handleCreateBook`)*
- **[NEW]** Scenario: Page beyond the last
  - WHEN 3 authors exist and the user opens `GET /authors?page=99`
   - THEN the server responds `200` with an empty page (no rows, no next link) *(confirmed: `200`-with-empty-page)*
- **[NEW]** Scenario: Author names are HTML-escaped
  - WHEN an author on the current page has a `name` containing HTML-special characters (e.g. `Le Guin & <Sons>`)
  - THEN the rendered HTML escapes those characters via `escapeHtml`, so no markup is injected
- **[NEW]** Scenario: Existing operations unaffected (regression)
  - WHEN this feature is implemented and the user opens `GET /books/new`
  - THEN the `<select>` still lists **all** authors via `listAuthors()` — pagination must not replace or alter `listAuthors()`
- **[NEW]** Scenario: Unsupported verb on a known route
  - WHEN a client sends a non-GET request to `/authors` (e.g. `POST /authors`)
  - THEN the server responds `405` without an unhandled exception (same policy as `/books`)

**Out of scope:**
- Creating, editing, or deleting authors from the web (no author CRUD).
- Sorting or filtering/searching the listing (by name or otherwise) — insertion order only.
- Paginating the books listing (`GET /books`) — still out of scope per the living spec.
- Per-author book counts or any join with `Book` data.
- JSON/API endpoints or cursor-based pagination — page-based HTML only.
- Persistence (state stays in memory).

---

## Entities

List all models/entities/interfaces involved. State whether each is new or existing.

| Name | Path | New / Existing | Notes |
|------|------|----------------|-------|
| `Author` | `src/domain/author.ts` | Existing | `{ id: string; name: string }`. Unchanged. |
| `AuthorsPage` | `src/domain/author.ts` | New | Result envelope returned by the new paginated query. |

**Main fields of the new entity:**

`AuthorsPage` (returned by the new `listAuthorsPage(page, pageSize)` query):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `items` | `Author[]` | yes | Authors on the current page, insertion order |
| `page` | `number` | yes | 1-based current page |
| `pageSize` | `number` | yes | Authors per page (1–100) |
| `total` | `number` | yes | Total authors in the repository |
| `totalPages` | `number` | yes | `Math.ceil(total / pageSize)`; `0` when the repository is empty |

---

## Approach

Select the main pattern and briefly justify why:

- [ ] Full CRUD (model + repository + service + controller/handler)
- [x] Endpoint/handler only (on an existing entity)
- [ ] Service/internal logic only (no presentation layer)
- [ ] Async worker / job
- [ ] External service integration — specify: ___
- [ ] UI component / page

**Rationale:**
Read-only listing on the existing `Author` entity. Adds one repository query (`listAuthorsPage`) to the existing `src/domain/author.ts` (same shape as the existing `addAuthor` / `getAuthor` / `listAuthors` functions), plus one route handler and one pure view function, following the layering already established by the books feature (`src/web/routes/` + `src/web/views/`). No new persistent entities, no writes, no framework.

Layering note: query-string parsing and validation of `page`/`pageSize` live in the web layer (precedent: `authorId` validation lives in `src/web/routes/books.ts`, not in the domain), while the domain query enforces its numeric contract by throwing (precedent: `src/domain/loan.ts` throws on unknown book / already-on-loan).

*(Confirmed: presentation layer is a web page `GET /authors`, consistent with the existing `/books` listing.)*

---

## Structure

Files to create or modify, with real project paths:

```
src/domain/author.ts         — modify: add AuthorsPage interface + listAuthorsPage(page, pageSize); listAuthors() stays as-is
src/web/routes/authors.ts    — create: handleListAuthors(req, res) — parse the URL query, validate page/pageSize (400 on invalid), call listAuthorsPage, render
src/web/views/authorList.ts  — create: renderAuthorList(page: AuthorsPage) — pure function; table + prev/next links + "page X of Y" indicator; escapeHtml for names
src/web/server.ts            — modify: route GET /authors and 405 for other verbs on /authors; must split the query string off req.url (current routes match req.url for exact equality and have never seen a query string)
src/domain/author.test.ts    — create: unit tests for listAuthorsPage (slicing math, totalPages rounding, empty repo, out-of-range page, throws on invalid numbers, listAuthors() unchanged)
src/web/server.test.ts       — modify: integration tests for the GET /authors scenarios above
```

---

## Operations

Define each concrete action and its mechanism (endpoint, command, event, UI action):

| Type | Identifier | Description |
|------|-----------|-------------|
| `GET` | `/authors?page=<n>&pageSize=<m>` | Paginated HTML listing of authors in insertion order. Both params optional: `page` (1-based, default 1) and `pageSize` (default 10, max 100). Invalid values → `400` + HTML error message. A page beyond the last → `200` with an empty page. Renders prev/next links and a "page X of Y" indicator (rendered in Spanish: "Página X de Y" — copy confirmed by user 2026-09-07). |

*(Stack adaptation: no HTTP framework — operations are native-`http` routes dispatched in `src/web/server.ts`, handlers in `src/web/routes/authors.ts`, views in `src/web/views/authorList.ts`. Non-GET verbs on `/authors` → `405`, mirroring the `/books` routing policy.)*

---

## Norms

Mandatory project conventions for this feature:

*Source: `AGENTS.md` and the Norms section of `spdd/specs/biblioteca.md` — no `spdd/norms.md` exists in this project (team-maintained, read-only for this skill).*

- [ ] TypeScript 5.5 with `strict: true`, target ES2020, CommonJS modules.
- [ ] No HTTP framework and no database: the web layer uses only Node's native `http` module.
- [ ] State lives in module-level in-memory arrays in `src/domain/*.ts`; no persistence added.
- [ ] Tests use the builtin `node:test` runner via `npm test` (`node --require ts-node/register --test src/**/*.test.ts`); `*.test.ts` files are excluded from the production build.
- [ ] Views are pure functions returning HTML strings; every user-controlled string is escaped with `escapeHtml` (see `src/web/views/bookForm.ts`).
- [ ] UI copy in views is Spanish (existing pages use e.g. "No hay libros todavía.") — keep the author listing consistent.
- [ ] Validation of external input lives in the web layer (`src/web/routes/*`), not in `src/domain/*` (precedent: `authorId` validation in the books route); domain functions enforce their own contracts by throwing (precedent: `loan.ts`).
- [ ] Feature changes go through the SPDD flow (canvas → design → implement → verify), not direct edits to the domain.

---

## Safeguards

**Tests to write:**
- [ ] Full happy path: `GET /authors?page=2&pageSize=10` with 25 authors → authors 11–20, "page 2 of 3", prev + next links
- [ ] Defaults: `GET /authors` with no params → page 1, size 10
- [ ] Invalid input validation: non-numeric / non-integer / `0` / negative `page`; `pageSize` of `0`, negative, or `> 100` → `400`
- [ ] Out-of-range page → `200` empty page, no next link
- [ ] Empty repository → `200`, "No hay autores todavía.", no navigation links
- [ ] Domain unit tests (`src/domain/author.test.ts`): slicing math, `totalPages` rounding, partial last page, throws on invalid numbers, `listAuthors()` still returns everything
- [ ] Regression: `GET /books/new` still shows all authors in the `<select>`
- [ ] HTML escaping of author names in the listing

**Edge cases to consider (as WHEN/THEN scenarios — `spdd-verify` writes a targeted test for each one not already covered):**

- Scenario: page beyond the last
  - WHEN 3 authors exist and the client requests `GET /authors?page=99`
  - THEN the domain query returns `items: []` with `totalPages: 1`, and the handler renders `200` with an empty page (no crash, no next link)
- Scenario: total divides exactly by page size
  - WHEN 20 authors exist and the client requests `page=2&pageSize=10`
  - THEN `totalPages` is 2 (not 3) and no next link is rendered on page 2
- Scenario: pageSize at the upper bound
  - WHEN the client requests `GET /authors?pageSize=100` with 150 authors
  - THEN the response is `200` with the first 100 authors and "page 1 of 2"
- Scenario: query-string handling in the router
  - WHEN a request arrives with a query string (`/authors?page=2`)
  - THEN the route matches `/authors` — the router currently compares `req.url` for exact equality and has never seen a query string, so it must split the path from the query before dispatching, without breaking `/books` matching
- Scenario: author name with HTML-special characters
  - WHEN an author named `Le Guin & <Sons>` is on the current page
  - THEN the view escapes the name and the rendered page contains no injected markup
- Scenario: shared in-memory state
  - WHEN the module-level `authors` array gains authors while the server is running (e.g. tests seeding data)
  - THEN pagination totals reflect the current array contents on every request (no caching of totals)

**Production rollback:**
In-memory project with no schema or data migration: reverting the commits (or simply removing the `/authors` route block) restores previous behavior completely. `listAuthors()` and the existing `/books` routes are untouched, so the rest of the app keeps working while `/authors` is absent. After rollback, run `npm test` to confirm the books scenarios still pass.
