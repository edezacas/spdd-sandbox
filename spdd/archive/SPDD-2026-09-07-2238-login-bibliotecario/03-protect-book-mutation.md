# Sub-spec 3: Require login for book insertion

## Goal

Require a valid librarian session (from sub-spec 2) to reach the existing book-insertion flow — `GET /books/new` and `POST /books` — while leaving `GET /books` and `GET /authors` untouched and public, per the scope decision in `00-overview.md`. This sub-spec **modifies** two scenarios already recorded in `spdd/specs/biblioteca.md` by adding an authentication precondition to them; it does not change their happy-path behavior once authenticated.

## Contract

An auth guard is applied to `GET /books/new` and `POST /books`. A request without a valid session is redirected (`302`) to `/login?next=<originally requested path>` — the book form is never rendered and no book is created for an unauthenticated request, regardless of otherwise-valid submitted data.

| Route | Unauthenticated | Authenticated |
|---|---|---|
| `GET /books/new` | `302` → `/login?next=/books/new` | `200`, same as `spdd/specs/biblioteca.md` today |
| `POST /books` | `302` → `/login?next=/books/new`, no book created | same validation/creation behavior as `spdd/specs/biblioteca.md` today |
| `GET /books` | unaffected — `200`, public | unaffected |
| `GET /authors` | unaffected — `200`, public | unaffected |

## Scenarios

```gherkin
Feature: Protect book insertion behind login

  Background:
    Given an author "Jane Austen" exists
    And exactly one seeded user exists: username "bibliotecario", password "biblioteca123"

  # MODIFY protect-book-mutation-1: authenticated access to the book form
  # (supersedes "Formulario muestra los autores existentes" in spdd/specs/biblioteca.md —
  # same response, now preconditioned on a valid session)
  Scenario: protect-book-mutation-1
    Given the client is logged in as the librarian
    When it opens GET /books/new
    Then the server responds 200 with the book form, unchanged from spdd/specs/biblioteca.md
      (a <select> listing all authors via listAuthors())

  # ADD protect-book-mutation-2: unauthenticated access to the book form is redirected
  Scenario: protect-book-mutation-2
    Given the client holds no session cookie
    When it opens GET /books/new
    Then the server responds 302 to "/login?next=/books/new", without rendering the form
      or exposing the author list

  # MODIFY protect-book-mutation-3: authenticated book insertion
  # (supersedes "Insertar un libro válido" in spdd/specs/biblioteca.md — same response,
  # now preconditioned on a valid session)
  Scenario: protect-book-mutation-3
    Given the client is logged in as the librarian
    When it submits POST /books with title "Persuasión" and Jane Austen's authorId
    Then the book is created and the response behaves exactly as specified in
      spdd/specs/biblioteca.md (302 to /books, book visible with its author)

  # ADD protect-book-mutation-4: unauthenticated book insertion is rejected
  Scenario: protect-book-mutation-4
    Given the client holds no session cookie
    When it submits POST /books with an otherwise-valid title and Jane Austen's authorId
    Then the server responds 302 to "/login?next=/books/new", no book is created, and the
      submitted title/authorId are discarded (not preserved across the login redirect)

  # REGRESSION protect-book-mutation-5: public read routes stay public
  Scenario Outline: protect-book-mutation-5
    Given the client holds no session cookie
    When it opens "<route>"
    Then the server responds 200 exactly as specified in spdd/specs/biblioteca.md,
      unaffected by this change

    Examples:
      | route     |
      | /books    |
      | /authors  |

  # REGRESSION protect-book-mutation-6: existing 404/405 policy is unaffected
  Scenario: protect-book-mutation-6
    When a client sends DELETE /books, or GET on an undefined route
    Then the server responds 405 or 404 respectively, exactly as specified in
      spdd/specs/biblioteca.md
```

## Invariants

- Every response to an unauthenticated `GET`/`POST` on a protected route is a `302` redirect to `/login`, never a bare `401`/`403` error page — this keeps the guard's UX consistent with the existing redirect-driven web-form flow (`POST /books`'s happy path is already a `302`). This differs intentionally from `login-session-4`'s `401` for *wrong credentials on the login form itself* — "no session at all" and "wrong credentials while trying to log in" are different situations; this split is resolved in `open-questions.md` (#5 keeps the `401` on the form, #1 confirms only these routes are guarded).
- No book or author data appears in the response body of a redirected (unauthenticated) request to a protected route.
- Existing validation of `title`/`authorId` on `POST /books` (empty title, unknown/empty `authorId`) is unchanged and only reachable once authenticated.

## Out of scope

- Protecting `GET /books` or `GET /authors` — resolved out of scope, see `open-questions.md` #1.
- Any permission granularity beyond "logged in / not logged in" (no per-action permissions).
- Preserving an in-flight `POST /books` form submission across the login redirect (the user must re-enter the title/author after logging in).

## Relevant files (existing, investigated)

- `src/web/routes/books.ts` — `handleNewBookForm`, `handleCreateBook`: the two handlers the guard wraps.
- `src/web/server.ts` — router: where `GET /books/new` and `POST /books` are currently dispatched unconditionally; the guard must run before these handlers without disturbing `/books` (`GET`), `/authors`, or the `404`/`405` fallbacks.
- `spdd/specs/biblioteca.md` — lines 11–17 ("Formulario muestra los autores existentes", "Insertar un libro válido") are the two scenarios this sub-spec modifies; lines 43–49 currently list "Autenticación/autorización" as out of scope for the whole living spec — this change is the one that removes that blanket exclusion, narrowed to just these two routes.
