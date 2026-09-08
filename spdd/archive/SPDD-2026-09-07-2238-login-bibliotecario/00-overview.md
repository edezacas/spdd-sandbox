# Change: Login (autenticación) para el bibliotecario

> Petición original: "Tenemos que añadir un login al sistema." No especifica qué se protege ni quién inicia sesión. Este directorio contiene el alcance mínimo razonable que propongo, explícitamente documentado como supuesto — ver "Scope decisions" abajo; las preguntas de producto abiertas se registraron en "open-questions.md" y están todas resueltas.

## Goal

Añadir autenticación basada en sesión al sistema, protegiendo la única acción de escritura hoy expuesta por la capa web (`GET /books/new` + `POST /books`, alta manual de libros) detrás de un login de un único rol "bibliotecario". El resto de la app (`GET /books`, `GET /authors`) permanece público, sin cambios de comportamiento.

## Why this scope (assumptions, documented explicitly)

El dominio actual (`Author`, `Book`, `Loan`) no tiene ningún concepto de usuario/cuenta/rol. La petición no dice qué debe proteger el login. Elijo el alcance mínimo razonable basándome en precedente ya existente en `spdd/specs/biblioteca.md`:

1. **Un único rol, "bibliotecario".** El histórico del proyecto ya distingue implícitamente dos audiencias: alguien que *inserta* libros (acción de escritura, típicamente un bibliotecario) y alguien que *navega* el catálogo/autores (lectura, "library user" — así lo dice literalmente el `canvas.md` archivado del listado de autores). No hay ninguna funcionalidad hoy que necesite una cuenta de "lector" (no hay autoservicio de préstamos expuesto en la web). Por tanto: **un solo rol**, sin sistema de permisos granular.
2. **Solo se protege la escritura.** `GET /books/new` y `POST /books` requieren sesión. `GET /books` y `GET /authors` (ambos de solo lectura) quedan exactamente como están hoy — públicos, sin login. Esto es el cambio de menor superficie que satisface "añadir un login" sin inventar requisitos no pedidos (p. ej. ocultar el catálogo a los lectores).
3. **Una única cuenta sembrada ("bibliotecario"/"biblioteca123"), sin alta de usuarios.** No existe hoy ningún concepto de cuenta ni UI de administración; crear una completa (registro, gestión de cuentas, roles múltiples) es una feature mucho mayor que "añadir un login". Se siembra una cuenta fija al arrancar el servidor — consistente con que todo el estado del proyecto es en memoria y se resetea al reiniciar el proceso (mismo criterio que `Author`/`Book`/`Loan`).
4. **Sesión en memoria vía cookie**, sin expiración/TTL, sin "recordar sesión", sin CSRF, sin rate limiting/bloqueo de cuenta, sin HTTPS/cookie `Secure` — todo consistente con que el resto del stack no tiene framework, ni base de datos, ni HTTPS, y con que el propósito del repo es servir de banco de pruebas SPDD, no un sistema de producción.

Estos cuatro puntos son supuestos de producto, no hechos verificados en código — están marcados como tal y se sometieron como preguntas abiertas en `open-questions.md`, ya resueltas: cada resolución confirmó el alcance aquí descrito.

## Sub-specs (ordenados por dependencia)

1. `01-domain-user-auth.md` — entidad `User` + repositorio en memoria + hashing/verificación de contraseña (capa de dominio, sin dependencias web). Base de todo lo demás.
2. `02-web-login-session.md` — flujo web de login/logout (`GET /login`, `POST /login`, `POST /logout`), sesión en memoria vía cookie. Depende de (1).
3. `03-protect-book-mutation.md` — aplica el guard de sesión a las rutas de alta de libros ya existentes (`GET /books/new`, `POST /books`), **modificando** dos escenarios ya registrados en `spdd/specs/biblioteca.md`. Depende de (2).

Cada sub-spec es implementable y verificable de forma independiente (con un stub/mock de la capa de la que depende).

## Shared contracts

Ver `shared-contracts.md` — forma de `User`/sesión, códigos de estado por situación, copy de error en español.

## End-to-end QA

Ver `e2e-qa.md` — flujo completo observable por HTTP/HTML (no hay capa de API interna aparte de esto; el "UI" de este proyecto es el HTML servido).

## Open questions (resueltas)

Ver `open-questions.md` — las cinco decisiones de producto quedaron cerradas con decisión explícita, rationale y archivos tocados; ninguna deja escenarios ni contratos bloqueados.
