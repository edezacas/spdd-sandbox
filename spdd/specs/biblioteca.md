# Living Spec: Biblioteca

> Spec viva del dominio de biblioteca (`Author`, `Book`, `Loan`) y su capa web. Mantenida por el flujo SPDD (`spdd-canvas` → `spdd-design` → `spdd-implement` → `spdd-verify`); no editar a mano salvo vía `spdd-sync` para cambios de forma sin cambio de comportamiento.

---

## Requirements

**Insertar libros manualmente desde una interfaz web**

- Scenario: Formulario muestra los autores existentes
  - WHEN el usuario abre `GET /books/new`
  - THEN el servidor responde con un formulario HTML que incluye un `<select>` con todos los autores devueltos por `listAuthors()`

- Scenario: Insertar un libro válido
  - WHEN el usuario envía `POST /books` con `title` no vacío y un `authorId` que existe en el repositorio de autores
  - THEN se crea el libro vía `addBook()` con un `id` generado por el servidor, y el usuario es redirigido a `GET /books` donde ve el libro recién insertado

- Scenario: Título vacío o solo espacios
  - WHEN el usuario envía `POST /books` con `title` vacío o compuesto solo de espacios en blanco
  - THEN el servidor responde `400` con un mensaje de error y no se crea ningún libro

- Scenario: `authorId` inexistente o vacío
  - WHEN el usuario envía `POST /books` con un `authorId` que no existe en `listAuthors()`, o sin seleccionar autor (`authorId` vacío)
  - THEN el servidor responde `400` con un mensaje de error y no se crea ningún libro

- Scenario: Listado de libros visible tras insertar
  - WHEN hay uno o más libros en el repositorio en memoria
  - THEN `GET /books` los muestra en una tabla HTML simple con título y nombre de autor

- Scenario: No hay ningún autor todavía
  - WHEN el usuario abre `GET /books/new` y `listAuthors()` devuelve una lista vacía
  - THEN el formulario se muestra igualmente pero sin `<select>`, con un mensaje indicando que hace falta crear un autor primero (crear autores está fuera de alcance de este formulario)

- Scenario: Método HTTP no soportado en una ruta conocida
  - WHEN el cliente hace una petición con verbo incorrecto sobre `/books` o `/books/new` (ej. `DELETE /books`), o accede a una ruta no definida
  - THEN el servidor responde `405` (verbo no soportado en ruta conocida) o `404` (ruta no definida), sin lanzar una excepción no controlada

- Scenario: Inserciones con título duplicado
  - WHEN se insertan dos libros con el mismo `title` (de igual o distinto autor)
  - THEN ambos se crean sin error; `Book` no tiene restricción de unicidad sobre `title`

**Out of scope (vigente):**
- Editar o eliminar libros desde la interfaz web.
- Crear autores nuevos desde el formulario de libros (el `authorId` debe existir previamente).
- Persistencia real (los datos se pierden al reiniciar el proceso).
- Autenticación/autorización.
- Gestión de préstamos (`Loan`) desde la interfaz web.
- Paginación o búsqueda en el listado de libros.

**Listado paginado de autores (web)**

- Scenario: Paginated listing with navigation (happy path)
  - WHEN the repository holds 25 authors and the user opens `GET /authors?page=2&pageSize=10`
  - THEN the server responds `200` with an HTML table showing authors 11–20 in insertion order (name per row), a "page 2 of 3" indicator (rendered in Spanish: "Página 2 de 3"), a link to the previous page and a link to the next page
- Scenario: Defaults without query params
  - WHEN the user opens `GET /authors` with no query string
  - THEN the server responds `200` showing page 1 with page size 10 (default page size 10, max 100)
- Scenario: Last partial page
  - WHEN 23 authors exist and the user opens `GET /authors?page=3&pageSize=10`
  - THEN the response shows the remaining 3 authors, "page 3 of 3", a previous-page link, and no next-page link
- Scenario: No authors yet
  - WHEN the author repository is empty and the user opens `GET /authors`
  - THEN the server responds `200` with a "No hay autores todavía." message instead of a table, and no prev/next links
- Scenario: Invalid pagination params
  - WHEN the user opens `GET /authors` with `page` or `pageSize` that is non-numeric, non-integer, `0`, negative, or a `pageSize` above 100 (e.g. `?page=abc`, `?page=0`, `?pageSize=500`)
  - THEN the server responds `400` with an HTML error message and does not render the listing (strict `400`, consistent with existing form validation in `handleCreateBook`)
- Scenario: Page beyond the last
  - WHEN 3 authors exist and the user opens `GET /authors?page=99`
  - THEN the server responds `200` with an empty page (no rows, no next link)
- Scenario: Author names are HTML-escaped
  - WHEN an author on the current page has a `name` containing HTML-special characters (e.g. `Le Guin & <Sons>`)
  - THEN the rendered HTML escapes those characters via `escapeHtml`, so no markup is injected
- Scenario: Existing operations unaffected (regression)
  - WHEN this feature is implemented and the user opens `GET /books/new`
  - THEN the `<select>` still lists **all** authors via `listAuthors()` — pagination must not replace or alter `listAuthors()`
- Scenario: Unsupported verb on a known route
  - WHEN a client sends a non-GET request to `/authors` (e.g. `POST /authors`)
  - THEN the server responds `405` without an unhandled exception (same policy as `/books`)

**Out of scope (listado de autores):**
- Creating, editing, or deleting authors from the web (no author CRUD).
- Sorting or filtering/searching the listing (by name or otherwise) — insertion order only.
- Per-author book counts or any join with `Book` data.
- JSON/API endpoints or cursor-based pagination — page-based HTML only.

---

## Entities

| Name | Path | Notes |
|------|------|-------|
| `Author` | `src/domain/author.ts` | `{ id: string; name: string }`. Repositorio en memoria: `addAuthor`, `getAuthor`, `listAuthors` (intacto; `GET /books/new` depende de que devuelva todos los autores) y la consulta paginada `listAuthorsPage(page, pageSize)` (1-based; `pageSize` 1–100; lanza si `page`/`pageSize` no son enteros positivos válidos; página más allá de la última → `items: []` sin lanzar). |
| `AuthorsPage` | `src/domain/author.ts` | Nuevo. Envolvente que devuelve `listAuthorsPage`: `{ items: Author[]; page: number; pageSize: number; total: number; totalPages: number }` (`totalPages = Math.ceil(total / pageSize)`, `0` con repositorio vacío). |
| `Book` | `src/domain/book.ts` | `{ id: string; title: string; authorId: string }`. Repositorio en memoria: `addBook`, `getBook`, `listBooks`. Sin validación de integridad referencial contra `Author` a nivel de dominio; la validación de `authorId` vive en la capa web (`src/web/routes/books.ts`), no en `book.ts`. `id` de libros creados vía la UI web se genera con `crypto.randomUUID()` en el handler, no por el usuario. |
| `Loan` | `src/domain/loan.ts` | Préstamo de un `Book`; reglas de negocio propias (no prestar un libro ya prestado). No expuesto todavía por la capa web. |

---

## Operations

| Type | Identifier | Description |
|------|-----------|-------------|
| `GET` | `/books/new` | Muestra el formulario HTML para insertar un libro (título + `<select>` de autores existentes vía `listAuthors()`). Si no hay autores, muestra un aviso en vez del `<select>`. |
| `POST` | `/books` | Procesa el formulario: valida `title` (no vacío/no solo espacios) y `authorId` (no vacío y existente vía `getAuthor()`), crea el libro vía `addBook()` con `id = crypto.randomUUID()`, redirige (`302`) a `/books`. En caso de validación fallida responde `400` con mensaje de error y no crea el libro. |
| `GET` | `/books` | Lista todos los libros existentes (título + nombre de autor resuelto vía `getAuthor()`), sirve de confirmación visual tras insertar. |
| `GET` | `/authors?page=<n>&pageSize=<m>` | Paginated HTML listing of authors in insertion order. Both params optional: `page` (1-based, default 1) and `pageSize` (default 10, max 100). Invalid values → `400` + HTML error message. A page beyond the last → `200` with an empty page. Renders prev/next links and a "page X of Y" indicator (rendered in Spanish: "Página X de Y"). Non-GET verbs on `/authors` → `405`, same policy as `/books`. The router splits the query string off `req.url` before matching paths. |

**Implementado por:**
- `src/web/server.ts` — servidor HTTP (módulo nativo `http`), enrutamiento de las Operations (compara la ruta con la query string separada de `req.url`), `404`/`405` para rutas/verbos no soportados. Exporta `server`; solo llama a `server.listen()` cuando se ejecuta como entrypoint (`require.main === module`), para permitir testearlo sin abrir el puerto 3000 real.
- `src/web/routes/books.ts` — handlers `handleNewBookForm`, `handleListBooks`, `handleCreateBook`.
- `src/web/routes/authors.ts` — handler `handleListAuthors`: parsea la query, valida `page`/`pageSize` (enteros positivos estrictos, `pageSize` ≤ 100; `400` si no), llama a `listAuthorsPage` y renderiza. La validación de entrada externa vive en la capa web; el dominio lanza como salvaguarda.
- `src/web/views/bookForm.ts` — funciones puras `renderBookForm`, `renderBookList` que generan el HTML (con `escapeHtml` para evitar inyección de HTML desde `title`/`name` de usuario).
- `src/web/views/authorList.ts` — función pura `renderAuthorList(page: AuthorsPage)` (tabla, enlaces prev/next, indicador "Página X de Y", `escapeHtml` en nombres) y `renderAuthorListError` para la página de error `400`.

---

## Norms

- TypeScript 5.5 con `strict: true`, target `ES2020`, módulos `CommonJS`.
- Sin framework HTTP ni base de datos: la capa web usa solo el módulo nativo `http` de Node.
- Estado en memoria (arrays module-level en `src/domain/*.ts`); sin persistencia añadida por la capa web.
- Test runner: `node:test` (builtin de Node), ejecutado vía `npm test` → `node --require ts-node/register --test src/**/*.test.ts`. Los archivos `*.test.ts` están excluidos del build de producción (`tsconfig.json` → `exclude`).
- Las vistas son funciones puras que devuelven strings HTML; todo string controlado por el usuario se escapa con `escapeHtml` (ver `src/web/views/bookForm.ts`).
- El copy de la UI en las vistas es español (p. ej. "No hay libros todavía.", "No hay autores todavía.") — mantener consistencia entre listados.
- La validación de entrada externa vive en la capa web (`src/web/routes/*`), no en `src/domain/*` (precedente: validación de `authorId` en la ruta de libros); las funciones de dominio imponen sus propios contratos lanzando excepciones (precedente: `loan.ts`, `listAuthorsPage`).
- El cambio de features sobre este dominio pasa por el flujo canvas → design → implement → verify (`spdd-canvas`/`spdd-design`/`spdd-implement`/`spdd-verify`), no se edita el dominio directamente.

---

## Change history

- `SPDD-2026-08-30-1041-insertar-libros-web` — capa web (`src/web/`) para insertar libros manualmente vía formulario HTML. Archivado en `spdd/archive/`.
- `SPDD-2026-09-07-1204-paginated-author-listing` — paginated author listing (`GET /authors`): paginación HTML del listado de autores (`listAuthorsPage`, rutas y vistas en `src/web/`); `listAuthors()` queda intacto. Archivado en `spdd/archive/`.
