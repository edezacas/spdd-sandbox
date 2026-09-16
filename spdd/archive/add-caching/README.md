# Change: add-caching — Caché condicional HTTP (ETag) en los listados públicos

## Goal

Que los clientes revaliden los listados públicos (`GET /books`, `GET /authors`)
sin volver a descargar el cuerpo cuando no ha cambiado: respuestas 200 con
`ETag` fuerte derivado del HTML renderizado + `Cache-Control: no-cache`, y
`304 Not Modified` con cuerpo vacío ante un `If-None-Match` coincidente o `*`.
Invalidación automática por contenido (sin TTL ni estado de expiración).

Decisión de producto (preguntas resueltas con el usuario): es la opción
"HTTP conditional caching" — **sin** caché a nivel de aplicación, **sin**
`GET /books/new` (excluido para no arriesgar un `<select>` de autores
desactualizado), estrategia de ETag por hash de contenido del HTML.

## Contract

- Participan solo los 200 de `GET /books` y `GET /authors` (con cualquier
  query de paginación válida). Todo 200 lleva `ETag: "<hex>"` (validador
  fuerte, hash criptográfico del cuerpo exacto) y `Cache-Control: no-cache`.
- `If-None-Match` con el ETag vigente, o `*` → `304`, cuerpo vacío, mismos
  headers `ETag` + `Cache-Control` que el 200 correspondiente.
- `If-None-Match` ausente, basura o de otro recurso → `200` completo con el
  ETag vigente (respuesta siempre segura).
- Cualquier cambio del HTML renderizado cambia el ETag; nada más invalida.
- Ningún otro endpoint, verbo o código de estado participa ni cambia.

Detalle completo en `01-conditional_get.feature` (contract en su cabecera).

## Shared contracts

Ninguno: es un único sub-spec, sin sub-specs dependientes. El contrato es la
superficie HTTP descrita arriba; los tipos del dominio no cambian.

## Invariants

- Solo `GET /books` y `GET /authors` en su camino 200 participan; 405/404/302
  (guard y login/logout) y 400 quedan intactos y sin ETag.
- El ETag de un 200 depende exclusivamente del cuerpo: mismo cuerpo → mismo
  ETag (determinista entre peticiones y reinicios); cuerpo distinto → ETag
  distinto.
- Un 304 lleva ETag y Cache-Control idénticos al 200 correspondiente y cuerpo
  vacío; nunca renderiza HTML.
- Revalidación por petición: sin TTL ni nada que dependa del tiempo.
- `Content-Type` de los 200 sigue siendo `text/html; charset=utf-8`.
- El dominio (`author.ts`, `book.ts`, …) queda intacto: la lógica vive en la
  capa web.

## Out of scope

- `GET /books/new`, `GET/POST /login`, `POST /logout`: sin ETag ni manejo
  condicional.
- Caché a nivel de aplicación (memoización de `listAuthorsPage` con
  invalidación en `addAuthor`): descartada explícitamente.
- `Last-Modified`, `Expires`, `Vary`; ETags débiles (`W/"..."`).
- `If-Match`, `If-Range`, `If-Modified-Since`; listas de ETags en
  `If-None-Match` (valor no exacto → miss → 200).
- Freshness caching (`max-age > 0`), proxies/CDN.
- Verbos no GET (siguen 405) y HEAD.

## Non-Gherkin acceptance checklist (no son Gherkin, no son escenarios)

- La lógica condicional (calcular ETag del cuerpo, comparar
  `If-None-Match`, responder 304 o 200) se implementa una única vez y es
  compartida por ambas rutas; no se duplica por handler.
- Sin dependencias nuevas en runtime (solo módulos nativos de Node, p. ej.
  `node:crypto` para el hash).
- Las vistas siguen siendo funciones puras que devuelven strings HTML; la
  caché condicional no altera el HTML renderizado.
- Los ids de escenario (`conditional_get-NN`) son los nombres de los tests.
- Los tests existentes (`npm test`) siguen pasando sin cambios de
  comportamiento observable.

## Sub-specs

### 01-conditional_get.feature → dominio destino: `biblioteca`

Caché condicional HTTP en los listados públicos. Escenarios
`conditional_get-01` … `conditional_get-08`.

Archivos que toca la implementación (punteros; los escenarios ya fijan el
comportamiento observable):

- `src/web/routes/books.ts` — `handleListBooks` (hoy descarta `req`) pasa a
  evaluar `If-None-Match` sobre el HTML de `renderBookList`.
- `src/web/routes/authors.ts` — `handleListAuthors` hace lo propio sobre
  `renderAuthorList` (solo en el camino 200; el 400 no participa).
- `src/web/server.ts` — sin cambios esperados más allá de lo que exija el
  paso de la petición a los handlers.

## E2E QA

`e2e-qa.feature` — tres resultados visibles por el usuario: revalidación
exitosa (304 vacío) en los listados públicos, invalidación por contenido tras
el alta real de un libro vía formulario, y el formulario protegido servido
siempre completo y sin ETag.
