# E2E QA suite: add-caching — caché condicional HTTP en la biblioteca
#
# Suite de extremo a extremo contra el servidor real (src/web/server.ts,
# igual que src/web/e2e.test.ts): peticiones HTTP reales al listener, estado
# en memoria sembrado vía el dominio como affordance de test (sin UI para
# crear autores). Cubre solo los workflows visibles por el usuario de este
# change; el resto es regresión cubierta por las suites existentes.

Feature: Caché condicional HTTP visible por el usuario
  Un visitante (o su navegador) que ya descargó un listado público puede
  revalidarlo sin volver a descargar el cuerpo; tras un cambio de contenido
  el listado se sirve completo; el formulario protegido nunca participa.

  # ADD - e2e-qa-01: Revalidación exitosa de un listado público ahorra el cuerpo
  Scenario: Revalidar un listado público sin cambios responde 304 vacío
    Given el servidor arranca con sus repositorios vacíos (solo la cuenta sembrada del bibliotecario)
    When el visitante hace GET <route> sin cabeceras condicionales
    Then recibe 200 con el HTML completo del listado, un header ETag entre comillas y Cache-Control "no-cache"
    When el visitante repite GET <route> con If-None-Match con el ETag recibido
    Then recibe 304 con el cuerpo vacío, el mismo ETag y Cache-Control "no-cache"

    Examples:
      | route    |
      | /books   |
      | /authors |

  # ADD - e2e-qa-02: El alta real de un libro invalida el listado por contenido
  Scenario: Tras insertar un libro desde el formulario, revalidar /books con el ETag viejo devuelve el listado actualizado
    Given el repositorio tiene el autor "Homero" (sembrado vía el dominio como affordance de test)
    And el visitante hizo GET /books y guardó su ETag
    When el bibliotecario inicia sesión con las credenciales sembradas (bibliotecario / biblioteca123)
    And el bibliotecario inserta el libro "La Odisea" de "Homero" vía POST /books y es redirigido a /books
    And el visitante vuelve a pedir GET /books con If-None-Match con el ETag guardado
    Then recibe 200 con el listado completo, que incluye "La Odisea" y "Homero"
    And el ETag de esta respuesta es distinto del guardado

  # ADD - e2e-qa-03: El formulario protegido se sirve siempre completo y sin ETag
  Scenario: GET /books/new con sesión ignora las cabeceras condicionales
    Given el repositorio tiene el autor "Homero" (sembrado vía el dominio como affordance de test)
    And el bibliotecario inicia sesión con las credenciales sembradas (bibliotecario / biblioteca123)
    When el cliente hace GET /books/new con el header If-None-Match: "lo-que-sea"
    Then recibe 200 con el formulario HTML completo (visible el <select> de autores con "Homero")
    And la respuesta no lleva header ETag
