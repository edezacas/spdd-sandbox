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

---

## Entities

| Name | Path | Notes |
|------|------|-------|
| `Author` | `src/domain/author.ts` | `{ id: string; name: string }`. Repositorio en memoria: `addAuthor`, `getAuthor`, `listAuthors`. |
| `Book` | `src/domain/book.ts` | `{ id: string; title: string; authorId: string }`. Repositorio en memoria: `addBook`, `getBook`, `listBooks`. Sin validación de integridad referencial contra `Author` a nivel de dominio; la validación de `authorId` vive en la capa web (`src/web/routes/books.ts`), no en `book.ts`. `id` de libros creados vía la UI web se genera con `crypto.randomUUID()` en el handler, no por el usuario. |
| `Loan` | `src/domain/loan.ts` | Préstamo de un `Book`; reglas de negocio propias (no prestar un libro ya prestado). No expuesto todavía por la capa web. |

---

## Operations

| Type | Identifier | Description |
|------|-----------|-------------|
| `GET` | `/books/new` | Muestra el formulario HTML para insertar un libro (título + `<select>` de autores existentes vía `listAuthors()`). Si no hay autores, muestra un aviso en vez del `<select>`. |
| `POST` | `/books` | Procesa el formulario: valida `title` (no vacío/no solo espacios) y `authorId` (no vacío y existente vía `getAuthor()`), crea el libro vía `addBook()` con `id = crypto.randomUUID()`, redirige (`302`) a `/books`. En caso de validación fallida responde `400` con mensaje de error y no crea el libro. |
| `GET` | `/books` | Lista todos los libros existentes (título + nombre de autor resuelto vía `getAuthor()`), sirve de confirmación visual tras insertar. |

**Implementado por:**
- `src/web/server.ts` — servidor HTTP (módulo nativo `http`), enrutamiento de las tres Operations, `404`/`405` para rutas/verbos no soportados. Exporta `server`; solo llama a `server.listen()` cuando se ejecuta como entrypoint (`require.main === module`), para permitir testearlo sin abrir el puerto 3000 real.
- `src/web/routes/books.ts` — handlers `handleNewBookForm`, `handleListBooks`, `handleCreateBook`.
- `src/web/views/bookForm.ts` — funciones puras `renderBookForm`, `renderBookList` que generan el HTML (con `escapeHtml` para evitar inyección de HTML desde `title`/`name` de usuario).

---

## Norms

- TypeScript 5.5 con `strict: true`, target `ES2020`, módulos `CommonJS`.
- Sin framework HTTP ni base de datos: la capa web usa solo el módulo nativo `http` de Node.
- Estado en memoria (arrays module-level en `src/domain/*.ts`); sin persistencia añadida por la capa web.
- Test runner: `node:test` (builtin de Node), ejecutado vía `npm test` → `node --require ts-node/register --test src/**/*.test.ts`. Los archivos `*.test.ts` están excluidos del build de producción (`tsconfig.json` → `exclude`).
- El cambio de features sobre este dominio pasa por el flujo canvas → design → implement → verify (`spdd-canvas`/`spdd-design`/`spdd-implement`/`spdd-verify`), no se edita el dominio directamente.

---

## Change history

- `SPDD-2026-08-30-1041-insertar-libros-web` — capa web (`src/web/`) para insertar libros manualmente vía formulario HTML. Archivado en `spdd/archive/`.
