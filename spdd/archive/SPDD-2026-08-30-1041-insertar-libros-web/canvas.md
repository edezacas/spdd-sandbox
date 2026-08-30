# REASONS: Insertar libros manualmente desde una interfaz web

> Generado el 2026-08-30. Revisar las líneas marcadas con ⚠️ antes de generar código.
> Regla de oro: si algo falla durante el desarrollo, arreglar primero este canvas, luego el código.

**Status:** Confirmed

---

## Requirements

**User story:**
Como bibliotecario/a, quiero insertar libros manualmente desde una interfaz web sencilla, para no depender de editar `src/index.ts` o escribir código cada vez que se agrega un libro nuevo al catálogo en memoria.

**Acceptance criteria:**

- **[NEW]** Scenario: Formulario muestra los autores existentes
  - WHEN el usuario abre `GET /books/new`
  - THEN el servidor responde con un formulario HTML que incluye un `<select>` con todos los autores devueltos por `listAuthors()`

- **[NEW]** Scenario: Insertar un libro válido
  - WHEN el usuario envía `POST /books` con `title` no vacío y un `authorId` que existe en el repositorio de autores
  - THEN se crea el libro vía `addBook()` con un `id` generado por el servidor, y el usuario es redirigido a `GET /books` donde ve el libro recién insertado

- **[NEW]** Scenario: Título vacío o solo espacios
  - WHEN el usuario envía `POST /books` con `title` vacío o compuesto solo de espacios en blanco
  - THEN el servidor responde `400` con un mensaje de error y no se crea ningún libro

- **[NEW]** Scenario: `authorId` inexistente (Confirmado: esta validación no existe hoy en `src/domain/book.ts` — se valida en la capa web con `getAuthor()`, sin modificar el dominio)
  - WHEN el usuario envía `POST /books` con un `authorId` que no existe en `listAuthors()`
  - THEN el servidor responde `400` con un mensaje de error y no se crea ningún libro

- **[NEW]** Scenario: Listado de libros visible tras insertar
  - WHEN hay uno o más libros en el repositorio en memoria
  - THEN `GET /books` los muestra en una tabla/lista HTML simple con título y nombre de autor

**Out of scope:**
- Editar o eliminar libros desde la interfaz.
- Crear autores nuevos desde este formulario (el `authorId` debe existir previamente).
- Persistencia real (los datos se pierden al reiniciar el proceso, como ya ocurre en todo el dominio).
- Autenticación/autorización.
- Gestión de préstamos (`Loan`) desde la interfaz web.
- Paginación o búsqueda en el listado de libros.

---

## Entities

No se agregan entidades de dominio nuevas. Se reutilizan las existentes en modo lectura/escritura.

| Name | Path | New / Existing | Notes |
|------|------|-----------------|-------|
| `Book` | `src/domain/book.ts` | Existing | Se crea vía `addBook()`; el `id` lo genera el servidor web, no el usuario |
| `Author` | `src/domain/author.ts` | Existing | Solo lectura (`listAuthors`, `getAuthor`) para poblar el `<select>` del formulario y validar `authorId` |

**Campos relevantes de `Book` (sin cambios):**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Confirmado: generado con `crypto.randomUUID()` (builtin de Node, sin nueva dependencia) |
| `title` | string | yes | Validado como no-vacío en el handler web |
| `authorId` | string | yes | Validado contra `listAuthors()`/`getAuthor()` en el handler web (ver Acceptance Criteria) |

---

## Approach

- [x] Endpoint/handler only (on an existing entity)
- [x] UI component / page

**Rationale:**
El dominio (`Book`, `Author`) ya existe y no necesita cambios estructurales. Lo que falta es una capa web nueva (no existía ninguna hasta ahora) que exponga un formulario HTML y un endpoint de creación sobre `addBook()`. Se mantiene minimalista: sin framework, sin motor de plantillas, generando HTML con funciones puras en TypeScript, siguiendo el principio "Simplicity First" y el hecho de que el stack actual declarado en `CLAUDE.md` es "sin framework ni base de datos".

---

## Structure

Archivos a crear o modificar:

```
src/web/server.ts          # NEW - servidor HTTP (módulo nativo `http` de Node), enrutamiento básico
src/web/routes/books.ts    # NEW - handlers: GET /books/new, POST /books, GET /books
src/web/views/bookForm.ts  # NEW - funciones que generan el HTML del formulario, el listado y mensajes de error
package.json                # MODIFIED - agrega script "web" para levantar el servidor
```

`src/domain/book.ts` y `src/domain/author.ts` no se modifican (la validación de `authorId` vive en la capa web, ver ⚠️ Confirm en Acceptance Criteria).

---

## Operations

| Type | Identifier | Description |
|------|-----------|-------------|
| `GET` | `/books/new` | Muestra el formulario HTML para insertar un libro (título + select de autores existentes) |
| `POST` | `/books` | Procesa el formulario: valida `title` y `authorId`, crea el libro vía `addBook()`, redirige a `/books` |
| `GET` | `/books` | Lista todos los libros existentes (título + nombre de autor), sirve como confirmación visual tras el insert |

Confirmado: puerto `3000`, script `"web": "ts-node src/web/server.ts"` agregado a `package.json`.

---

## Norms

Convenciones obligatorias del proyecto, extraídas de `CLAUDE.md`:

- [ ] TypeScript 5.5 con `strict: true`, target `ES2020`, módulos `CommonJS` (igual que el resto de `src/`)
- [ ] Sin framework ni base de datos: usar solo módulos nativos de Node (`http`) — Confirmado: se descarta instalar Express u otro framework HTTP
- [ ] Estado en memoria (arrays module-level): el listado de libros se sigue sirviendo desde `listBooks()`/`listAuthors()`, sin persistencia añadida
- [ ] No hay linter ni test runner configurado hoy — Confirmado: `spdd-verify` usará `node:test` (builtin de Node, sin nueva dependencia)
- [ ] El cambio pasa por el flujo canvas → design → implement → verify (este documento es la fase canvas)

---

## Safeguards

**Tests to write:**
- [ ] Happy path completo: `GET /books/new` → `POST /books` con datos válidos → `GET /books` muestra el libro
- [ ] Validación de `title` vacío/solo espacios
- [ ] Validación de `authorId` inexistente
- [ ] Generación de `id` único por libro insertado vía la UI

**Edge cases to consider (WHEN/THEN):**

- Scenario: `authorId` vacío en el formulario
  - WHEN el usuario envía `POST /books` sin seleccionar autor (`authorId` vacío)
  - THEN el servidor responde `400` y no crea el libro

- Scenario: no existe ningún autor todavía
  - WHEN el usuario abre `GET /books/new` y `listAuthors()` devuelve una lista vacía
  - THEN el formulario se muestra igualmente pero sin opciones en el `<select>`, con un mensaje indicando que hace falta crear un autor primero (fuera de alcance crearlo desde aquí)

- Scenario: método HTTP no soportado en una ruta conocida
  - WHEN el cliente hace `GET /books` con verbo incorrecto (ej. `DELETE /books`) o accede a una ruta no definida
  - THEN el servidor responde `404` o `405` según corresponda, sin lanzar una excepción no controlada

- Scenario: inserciones con título duplicado
  - WHEN se insertan dos libros con el mismo `title` (posiblemente de distintos autores)
  - THEN ambos se crean sin error, ya que no existe restricción de unicidad en `Book` (comportamiento heredado del dominio actual, se documenta explícitamente)

**Production rollback:**
No aplica — proyecto sandbox sin entorno de producción real (`CLAUDE.md`: "Sandbox sin propósito de producto real"). Revertir equivale a eliminar los archivos de `src/web/` y el script `web` de `package.json`.
