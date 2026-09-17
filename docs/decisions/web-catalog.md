# web-catalog — decisiones

Dominio: el catálogo HTML servido por `src/web/` — sus listados (`/authors`, `/books`),
el contrato de paginación que comparten y la caché HTTP condicional que los envuelve.
No cubre login/sesión, `src/web/seed.ts`, ni el dominio de préstamos.

## El contrato de paginación es uno solo para los dos listados

`GET /authors` y `GET /books` aceptan exactamente los mismos parámetros y las mismas reglas,
y deben seguir haciéndolo. `page` (base 1, por defecto 1) y `pageSize` (por defecto 10, máximo
100) se leen con un parser estricto: se recorta el espacio (`trim`) y se exige `/^\d+$/` sobre
el valor recortado, así que `" 10 "` y `"007"` valen, mientras que `abc`, `0`, `-1`, `1.5`,
`1e2`, `+1` y la cadena vacía no. Un parámetro ausente cae a su valor por defecto; uno presente
e inválido (o `pageSize > 100`) aborta la petición entera.

Motivo: se pidió "paginar como `/authors`" literalmente, y ya existía una implementación de
referencia en el repo. Duplicarla textualmente en `src/web/routes/books.ts` en lugar de extraer
un módulo compartido fue una elección deliberada: la alternativa compartida arriesgaba tocar
`/authors` y sus tests, que estaban fuera de alcance. La duplicación es el precio aceptado de
no mover nada ya shippeado. `MAX_PAGE_SIZE = 100` vive también en el dominio
(`src/domain/book.ts`, `src/domain/author.ts`) como red de seguridad que lanza; la validación de
entrada externa pertenece a la capa web, y el dominio impone su propio contrato numérico.

## D1 — un catálogo vacío no renderiza tabla

Con `total === 0`, `GET /books` muestra solo el encabezado, el mensaje (`No hay libros todavía.`)
y el enlace de alta; sin `<table>`, sin `Página X de Y`, sin navegación. Reemplaza el
comportamiento anterior de pintar la tabla con una fila `colspan="2"`.

Motivo: un paginador sobre cero elementos no significa nada, y "paginar como `/authors`" se leyó
literalmente — `renderAuthorList` ya hacía exactamente esto. Consecuencia aceptada: el HTML del
catálogo vacío cambió. La forma del caso vacío (encabezado + mensaje + un párrafo con enlace) es
intencionalmente idéntica entre ambos listados.

## D2 — los parámetros inválidos son 400 sin ETag

Toda petición con un `page`/`pageSize` presente e inválido responde `400` con la página de error
HTML y **sin** `ETag`; es un cambio de comportamiento en una ruta pública (antes `/books?page=2`
devolvía 200 con la lista completa, y los valores basura se ignoraban). Se confirmó con el
usuario.

El `400` se sirve por el `sendHtml` plano, no por `sendHtmlWithConditionalGet`. Motivo: un error
de validación no es una representación cacheable del recurso; no tiene validador que revalidar y
no debe participar de `If-None-Match`. El `200` sí pasa por el helper condicional (ETag fuerte
derivado del cuerpo + `Cache-Control: no-cache`), y como el ETag es función del cuerpo, páginas
distintas producen ETags distintos sin trabajo adicional.

## El dominio devuelve `Book[]`, el join con el autor queda en la ruta

`listBooksPage(page, pageSize)` devuelve `{ items, page, pageSize, total, totalPages }` con
`items: Book[]` — un slice, nunca la referencia viva al array del store — y `totalPages = 0`
cuando `total = 0`. Resolver `authorId → nombre` (con el placeholder `Autor desconocido`) sigue
en `handleListBooks`, igual que antes de paginar.

Motivo: mantener el dominio libre de la dependencia `book.ts → author.ts`, espejando `AuthorsPage`,
que también es un envelope puro. La vista recibe un view-model ya resuelto
(`BookListPage { rows, page, pageSize, total, totalPages }`) y no importa el dominio.

## La vista vive en su propio archivo

El render paginado es `src/web/views/bookList.ts`, un archivo nuevo que espeja
`src/web/views/authorList.ts`. `renderBookForm` y sus helpers quedaron intactos en `bookForm.ts`,
y el `renderBookList`/`BookListRow` legacy (no paginado, en `bookForm.ts`) se eliminó.

Motivo: un archivo por vista de listado es la convención que dejó el trabajo de `/authors`.
`escapeHtml` y `layout` se duplican por archivo de vista en lugar de extraerse: es la convención
existente y, de nuevo, evita tocar `/authors`. Cualquier refactor a un helper compartido debe
demostrar primero que la salida de `/authors` no cambia.

## Restricciones que se mantuvieron

- `POST /books` valida `title`/`authorId`, responde `400` con el formulario y redirige `302` a
  `/books`; no transporta estado de paginación.
- `GET /books/new` renderiza el `<select>` de autores, o el aviso de "no hay autores", con sesión.
- `/books` es público; solo `POST /books` y `/books/new` exigen sesión.
- `src/web/server.ts` no cambió: ya dividía `pathname` y query, y el `405`/`404` matchean por
  `pathname`.
- No hay escape "todos los libros": un catálogo de más de 100 se recorre página a página.

## Disciplina de tests

Cada archivo `*.test.ts` corre en su propio proceso, pero el estado de los arrays module-level
es compartido dentro del archivo y crece entre tests. Por eso los tests de paginación calculan
sus expectativas desde `listBooks()` (nunca totales hardcodeados) y el primer `describe` observa
el repositorio vacío antes de sembrar en un `before` posterior.

El runner real es `node --require ts-node/register --test src/**/*.test.ts`, expandido por `sh`
sin globstar: el patrón `src/**/` equivale a `src/*/`. Los tests deben vivir a dos niveles
(`src/domain/*.test.ts`, `src/web/*.test.ts`); un archivo bajo `src/web/views/` no se descubriría.
