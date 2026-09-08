# Sub-spec 2: Web login/logout flow + session

## Goal

Expose a login/logout web flow (`GET /login`, `POST /login`, `POST /logout`) on top of the `User` module from sub-spec 1, establishing a server-side session referenced by an HttpOnly cookie — following the existing native-`http`, pure-view-function, Spanish-copy conventions used by `/books` and `/authors`. This sub-spec is independently verifiable: it does not require sub-spec 3 (protecting `/books/new`/`POST /books`) to exist — it can be tested standalone against `/login`/`/logout`.

## Contract

**Session** (server-side concept, in-memory, module-level — same "no persistence" posture as `authors`/`books`/`loans`):
```ts
interface Session {
  id: string;      // opaque token, unguessable
  userId: string;  // User.id
  createdAt: Date;
}
```
- No expiry/TTL in this scope: a session is valid until an explicit `POST /logout` or until the process restarts (which wipes the in-memory store, same as every other entity).
- A session is referenced by a cookie set on the response after a successful login. The cookie is `HttpOnly` (not readable via client-side script) and scoped to `Path=/`. It has no `Secure` attribute (the dev server runs over plain HTTP, same as the rest of the project — see `open-questions.md` / out-of-scope). The exact cookie name is an implementation detail left to design; every scenario below only depends on the cookie's presence/validity, never its literal name.
- An unrecognized, missing, or tampered session reference is always treated as "not authenticated" — never a server error.

**Seeded account** (see `00-overview.md` assumption #3): exactly one account exists at server start, username `bibliotecario`, password `biblioteca123` (used verbatim in the scenarios below as the valid-credentials example).

## Routes

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/login` | Renders the login form (username + password fields, `method="POST" action="/login"`). If the requester already holds a valid session, redirects (`302`) to `/books/new` instead of showing the form. |
| `POST` | `/login` | Body: `username`, `password`, optional `next`. Empty `username` or `password` → `400` (structurally invalid, same posture as the existing empty-title check in `POST /books`). Otherwise looks up the user and verifies the password; wrong username/password → `401`, re-renders the login form with a generic error message (no username enumeration). Correct credentials → creates a session, sets the session cookie, `302` redirect to `next` if it is a same-origin path starting with `/`, else to `/books/new` (open-redirect guard). |
| `POST` | `/logout` | Invalidates the current session if one exists (no-op, no error, if none exists or it's already invalid) and clears the cookie in the response. Always `302` redirect to `/login`. |

Non-`GET` verbs on `/login` other than `POST`, and non-`POST` verbs on `/logout`, follow the existing `405` policy (`/books`, `/books/new`, `/authors`).

## Scenarios

```gherkin
Feature: Login/logout web flow

  Background:
    Given exactly one seeded user exists: username "bibliotecario", password "biblioteca123"

  # ADD login-session-1: login form renders
  Scenario: login-session-1
    Given the client holds no session cookie
    When it opens GET /login
    Then the server responds 200 with an HTML page containing a form with a username field,
      a password field, and method POST action /login

  # ADD login-session-2: successful login, default destination
  Scenario: login-session-2
    Given the client holds no session cookie
    When it submits POST /login with username "bibliotecario" and password "biblioteca123", no next
    Then the server responds 302 to /books/new and sets a session cookie in the response

  # ADD login-session-3: successful login honors a same-origin "next", ignores an off-origin one
  Scenario Outline: login-session-3
    Given the client holds no session cookie
    When it submits POST /login with valid credentials and next="<next>"
    Then the server responds 302 to "<redirectTo>" and sets a session cookie

    Examples:
      | next               | redirectTo  |
      | (absent)           | /books/new  |
      | /books             | /books      |
      | https://evil.com   | /books/new  |
      | not-a-path         | /books/new  |

  # ADD login-session-4: invalid credentials are rejected with a generic message
  Scenario Outline: login-session-4
    Given the client holds no session cookie
    When it submits POST /login with username "<username>" and password "<password>"
    Then the server responds 401, re-renders the login form with the message
      "Usuario o contraseña incorrectos.", and does not set a session cookie

    Examples:
      | username      | password       |
      | bibliotecario | wrong-password |
      | no-existe     | biblioteca123  |

  # ADD login-session-5: empty username/password is a structural 400, not an auth attempt
  Scenario Outline: login-session-5
    When a client submits POST /login with username "<username>" and password "<password>"
    Then the server responds 400 and does not set a session cookie

    Examples:
      | username      | password      |
      | (empty)       | biblioteca123 |
      | bibliotecario | (empty)       |
      | (empty)       | (empty)       |

  # ADD login-session-6: already-authenticated visit to /login skips the form
  Scenario: login-session-6
    Given the client holds a valid session cookie from a prior successful login
    When it opens GET /login
    Then the server responds 302 to /books/new without rendering the form

  # ADD login-session-7: logout invalidates the session
  Scenario: login-session-7
    Given the client holds a valid session cookie
    When it submits POST /logout
    Then the server responds 302 to /login, clears/expires the session cookie in the response,
      and a subsequent request reusing the old cookie value is treated as unauthenticated

  # ADD login-session-8: logout with no active session is a harmless no-op
  Scenario: login-session-8
    When a client submits POST /logout without a session cookie (or with an unrecognized one)
    Then the server responds 302 to /login without error

  # ADD login-session-9: unsupported verb on /login
  Scenario: login-session-9
    When a client sends DELETE /login
    Then the server responds 405 without an unhandled exception

  # ADD login-session-10: unsupported verb on /logout
  Scenario: login-session-10
    When a client sends GET /logout
    Then the server responds 405 without an unhandled exception
```

## Invariants

- The login error message is identical whether the username doesn't exist or the password is wrong (no username enumeration).
- A tampered or unrecognized session cookie value never causes a server error (500); it is always treated as "no session".
- The `next` redirect target is only ever a same-origin path beginning with `/` (never an absolute URL) — open-redirect guard.

## Out of scope

- Session expiry / idle timeout, "remember me".
- Password reset, password change, account lockout / login rate limiting.
- CSRF protection (no token in the login/logout forms).
- HTTPS / `Secure` cookie attribute.
- Any UI to create, list, or manage user accounts (single hardcoded seed only — see `open-questions.md`).
- Multiple concurrent sessions listing / "log out of all devices".

## Relevant files (existing, investigated)

- `src/web/server.ts` — router dispatch, `404`/`405` conventions, query-string-splitting precedent to reuse for `/login`.
- `src/web/routes/books.ts` — `sendHtml` helper, `400`-with-re-rendered-form pattern (`handleCreateBook`), `302` redirect pattern (happy path of `POST /books`) to mirror for `POST /login`/`POST /logout`.
- `src/web/routes/authors.ts` — precedent for parsing/validating query params in the web layer and returning `400` with a rendered error page (`handleListAuthors`, `renderAuthorListError`).
- `src/web/views/bookForm.ts` — `escapeHtml`, inline error-message rendering (`<p style="color: red;">`) to mirror for the login error message.
