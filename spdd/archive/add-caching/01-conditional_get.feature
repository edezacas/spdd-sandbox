# Sub-spec 01: Caché condicional HTTP (ETag) en los listados públicos

Feature: Caché condicional HTTP en GET /books y GET /authors

  Goal: Que los clientes (navegadores, curl) puedan revalidar los listados
  públicos sin volver a descargar el cuerpo: las respuestas 200 llevan un ETag
  fuerte derivado del contenido renderizado y Cache-Control "no-cache"; una
  petición con If-None-Match coincidente recibe 304 con cuerpo vacío.

  Contract (visible desde fuera, en el límite HTTP):
  - Endpoints participantes, solo en su camino de éxito (200):
    `GET /books` y `GET /authors` (con cualquier query válida de paginación).
  - Todo 200 de esos endpoints lleva:
    `ETag: "<hex>"` (validador fuerte, entre comillas dobles, hexadecimal,
    derivado de un hash criptográfico del cuerpo exacto) y
    `Cache-Control: no-cache`.
  - `If-None-Match` con el ETag vigente del recurso, o con `*`, responde
    `304` con cuerpo vacío y los mismos headers `ETag` y `Cache-Control`
    que el 200 correspondiente.
  - Cualquier otro valor de `If-None-Match` (ausente, basura, ETag de otro
    recurso) responde `200` con el cuerpo completo y el ETag vigente.
  - La invalidación es automática por contenido: cualquier cambio que altere
    el HTML renderizado cambia el ETag; nada más invalida.
  - Ningún otro endpoint, verbo o código de estado participa.

  Background: el servidor es el existente (src/web/server.ts, módulo nativo
  http, estado en memoria). El estado se siembra por escenario vía el dominio
  (mismo affordance que usan los tests e2e actuales); no hay persistencia.

  # ADD - conditional_get-01: Los 200 de los listados públicos llevan ETag fuerte y Cache-Control
  Scenario: Los listados públicos exitosos anuncian validadores de caché
    Given el repositorio tiene 2 autores ("Ana" y "Beto") y 1 libro ("Dune" de "Ana")
    When el cliente pide <route> sin cabeceras condicionales
    Then la respuesta es 200 con el HTML completo del listado
    And la respuesta lleva un header ETag con formato "<hex>": comillas dobles, contenido hexadecimal, sin prefijo W/
    And la respuesta lleva el header Cache-Control con el valor "no-cache"
    And repetir exactamente la misma petición devuelve exactamente el mismo ETag

    Examples:
      | route                      |
      | /books                     |
      | /authors                   |
      | /authors?page=2&pageSize=1 |

  # ADD - conditional_get-02: Los listados vacíos también anuncian validadores
  Scenario: Los listados vacíos llevan ETag y Cache-Control
    Given el repositorio está vacío (0 autores, 0 libros)
    When el cliente pide <route> sin cabeceras condicionales
    Then la respuesta es 200 con el HTML de listado vacío (el texto "No hay libros todavía." o "No hay autores todavía." según la ruta es visible)
    And la respuesta lleva un header ETag con formato "<hex>" y el header Cache-Control "no-cache"

    Examples:
      | route    |
      | /books   |
      | /authors |

  # ADD - conditional_get-03: If-None-Match coincidente responde 304 con cuerpo vacío
  Scenario: Revalidar con el ETag vigente responde 304 sin cuerpo
    Given el repositorio tiene 2 autores y 1 libro
    And el cliente pidió <route> una vez y recibió su ETag
    When el cliente vuelve a pedir <route> con el header If-None-Match con ese ETag
    Then la respuesta es 304 con el cuerpo vacío
    And la respuesta lleva el mismo ETag que recibió la primera petición y el header Cache-Control "no-cache"

    Examples:
      | route    |
      | /books   |
      | /authors |

  # ADD - conditional_get-04: If-None-Match ausente, basura o de otro recurso responde 200 completo
  Scenario: Revalidación fallida devuelve el 200 completo con el ETag vigente
    Given el repositorio tiene 2 autores y 1 libro
    When el cliente pide <route> con <condicion>
    Then la respuesta es 200 con el HTML completo del listado
    And la respuesta lleva el ETag vigente de <route> (para poder revalidar la próxima vez)

    Examples:
      | route    | condicion                                                    |
      | /books   | sin header If-None-Match                                     |
      | /books   | If-None-Match: "no-existe" (valor con formato válido que no coincide) |
      | /authors | If-None-Match con el ETag recibido antes en GET /books       |

  # ADD - conditional_get-05: Insertar un libro cambia el contenido y el ETag de GET /books
  Scenario: Un ETag queda obsoleto tras insertar un libro desde la UI
    Given el repositorio tiene 1 autor ("Ana")
    And el cliente pidió GET /books y guardó su ETag
    When el bibliotecario inicia sesión con las credenciales sembradas e inserta el libro "Dune" vía POST /books
    And el cliente pide GET /books con If-None-Match con el ETag guardado
    Then la respuesta es 200 con el listado completo, que incluye "Dune"
    And el ETag de esta respuesta es distinto del ETag guardado

  # ADD - conditional_get-06: If-None-Match: * coincide con cualquier representación actual
  Scenario: El asterisco revalida a 304
    Given el repositorio tiene 1 autor ("Ana")
    When el cliente pide <route> con el header If-None-Match: *
    Then la respuesta es 304 con el cuerpo vacío
    And la respuesta lleva el ETag vigente del recurso y el header Cache-Control "no-cache"

    Examples:
      | route    |
      | /books   |
      | /authors |

  # ADD - conditional_get-07: GET /books/new no participa en la caché condicional
  Scenario: El formulario protegido se sirve siempre completo y sin ETag
    Given el bibliotecario tiene sesión válida (cookie de sesión)
    When el cliente pide GET /books/new con el header If-None-Match: "lo-que-sea"
    Then la respuesta es 200 con el formulario HTML completo (con el <select> de autores)
    And la respuesta no lleva header ETag

  # ADD - conditional_get-08: Las páginas de error de validación no se cachean ni se revalidan
  Scenario: Un 400 de /authors ignora las cabeceras condicionales
    Given el repositorio tiene 1 autor ("Ana")
    When el cliente pide GET /authors?page=abc con el header If-None-Match: "lo-que-sea"
    Then la respuesta es 400 con el mensaje de error HTML y sin header ETag

# Invariantes (se mantienen en todos los escenarios anteriores):
# - Solo `GET /books` y `GET /authors` en su camino 200 participan en la
#   caché condicional. El resto del enrutamiento queda intacto y sin ETag:
#   405 (verbo no soportado), 404 (ruta no definida), 302 del guard de sesión,
#   400 de validación, 302 de login/logout.
# - El ETag de un 200 es función exclusiva de su cuerpo: mismo cuerpo → mismo
#   ETag (determinista entre peticiones y entre reinicios del proceso);
#   cuerpo distinto → ETag distinto. Nunca depende de timestamps, cabeceras
#   de la petición ni identidad del proceso. Consecuencia observable: la misma
#   página pedida con query equivalente produce el mismo ETag.
# - Un 304 lleva los headers ETag y Cache-Control idénticos al 200
#   correspondiente y cuerpo vacío; nunca renderiza HTML.
# - La revalidación ocurre en cada petición: no hay TTL, expiración ni
#   estado que dependa del tiempo.
# - El Content-Type de los 200 sigue siendo "text/html; charset=utf-8".
# - El dominio (listAuthors, listAuthorsPage, addBook, addAuthor) queda
#   intacto: la caché condicional vive íntegramente en la capa web.

# Out of scope:
# - GET /books/new, GET /login, POST /login, POST /logout: sin ETag ni
#   manejo condicional (decisión del cliente: el formulario protegido se
#   excluye para no arriesgar un <select> de autores desactualizado).
# - Caché a nivel de aplicación (memoización de listAuthorsPage con
#   invalidación en addAuthor): explícitamente descartada en las preguntas
#   resueltas del change.
# - Cabeceras Last-Modified, Expires, Vary; ETags débiles (W/"...").
# - If-Match, If-Range, If-Modified-Since: solo se soporta If-None-Match.
# - Semántica de listas en If-None-Match ("a", "b"): cualquier valor que no
#   coincida exactamente con el ETag vigente (comillas incluidas) se trata
#   como miss → 200, que es siempre una respuesta segura.
# - Freshness caching (max-age > 0), semántica de proxies/CDN.
# - Verbos no GET (siguen la política 405 existente) y HEAD.
