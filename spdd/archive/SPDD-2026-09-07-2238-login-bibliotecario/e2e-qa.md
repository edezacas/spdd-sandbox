# End-to-end QA suite

Operates at the served-HTML level (this project has no separate client/API split — the "UI" is the HTML the native `http` server renders, consistent with the existing `src/web/server.test.ts` integration style). No internal domain function is called directly; every step is an HTTP request against a rendered page, following a link or submitting a form.

```gherkin
Feature: Librarian login end-to-end

  Background:
    Given an author "Jane Austen" exists
    And exactly one seeded user exists: username "bibliotecario", password "biblioteca123"

  # ADD librarian-login-e2e-1: full happy path — blocked, log in, insert a book, log out, blocked again
  Scenario: librarian-login-e2e-1
    Given no session cookie is held
    When the librarian opens GET /books/new
    Then they are redirected to the login page (GET /login?next=/books/new)
    When they submit the login form with username "bibliotecario" and password "biblioteca123"
    Then they are redirected to GET /books/new, which now renders 200 with the book form
    When they submit the book form with title "Persuasión" and author "Jane Austen"
    Then they are redirected to GET /books and see "Persuasión" listed with author "Jane Austen"
    When they submit the logout action (POST /logout)
    Then they are redirected to the login page
    When they open GET /books/new again, reusing the same (now-invalidated) session cookie
    Then they are redirected to the login page again — the old session no longer grants access

  # ADD librarian-login-e2e-2: wrong credentials keep the visitor locked out
  Scenario: librarian-login-e2e-2
    Given no session cookie is held
    When the visitor submits the login form with username "bibliotecario" and an incorrect password
    Then the server responds 401 and the login page is shown again with the message
      "Usuario o contraseña incorrectos."
    When the visitor then opens GET /books/new
    Then they are still redirected to the login page (no session was created)

  # REGRESSION librarian-login-e2e-3: public catalog pages remain reachable without logging in
  Scenario Outline: librarian-login-e2e-3
    Given no session cookie is held
    When a visitor opens "<route>"
    Then they see the page directly (200), without being redirected to the login page

    Examples:
      | route     |
      | /books    |
      | /authors  |
```

## Notes for whoever implements/verifies this suite

- Steps that "submit a form" are `POST` requests with the same body shape as the form's fields (`username`/`password` for `/login`; `title`/`authorId` for `/books`), mirroring how `src/web/server.test.ts` already drives `POST /books` today via `fetch(...).body: new URLSearchParams(...)`.
- "Redirected to the login page" means `302` with a `Location` header pointing at `/login` (optionally with a `next` query param) — assert on the header, not by following the redirect blindly, to keep assertions precise (same convention already used in `server.test.ts` for `POST /books`'s `302`).
- The `401` in `librarian-login-e2e-2` is asserted on the response status of the wrong-credentials `POST /login` itself (resolved in `open-questions.md` #5) — the re-rendered login page arrives in that same `401` response body, not via a redirect.
