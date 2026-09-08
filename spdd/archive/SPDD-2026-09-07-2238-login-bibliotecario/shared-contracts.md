# Shared contracts

Identical across sub-specs 1–3 and the E2E QA suite.

## Data shapes

```ts
interface User {
  id: string;
  username: string;
  passwordHash: string; // opaque; never the plaintext password
}

interface Session {
  id: string;      // opaque token, unguessable
  userId: string;  // User.id
  createdAt: Date;
}
```

## Seeded account (resolved: hardcoded literal — see `open-questions.md` #3)

| Field | Value |
|---|---|
| username | `bibliotecario` |
| password | `biblioteca123` |

Exactly one such account exists at server start. These values are hardcoded literals, not configurable — no environment variable or other mechanism overrides them (resolved in `open-questions.md` #3). No UI in this change creates, lists, or removes accounts.

## Status codes by situation

| Situation | Status | Notes |
|---|---|---|
| `GET /login` (no session) | `200` | Renders the login form |
| `GET /login` (valid session already) | `302` → `/books/new` | Skips the form |
| `POST /login`, empty username or password | `400` | Structural, same posture as empty-title on `POST /books` |
| `POST /login`, wrong username/password | `401` | Generic message, no username enumeration |
| `POST /login`, correct credentials | `302` → `next` or `/books/new` | Sets session cookie |
| `POST /logout` (any session state) | `302` → `/login` | Idempotent no-op if no valid session |
| Unsupported verb on `/login` (not GET/POST) | `405` | Same policy as `/books` |
| Unsupported verb on `/logout` (not POST) | `405` | Same policy as `/books` |
| `GET /books/new` or `POST /books`, no valid session | `302` → `/login?next=<path>` | No book/author data leaked, no book created |
| `GET /books/new` or `POST /books`, valid session | as `spdd/specs/biblioteca.md` | Unchanged happy path |
| `GET /books`, `GET /authors` | unaffected | Public, unchanged in this scope |

## Error copy (Spanish, matching existing UI copy conventions)

- `"Usuario o contraseña incorrectos."` — wrong credentials on `POST /login` (`401`).
- Empty-field message on `POST /login` (`400`) — exact wording left to design, following the existing pattern of `"El título no puede estar vacío."` / `"Debes seleccionar un autor válido."` in `src/web/views/bookForm.ts`.

## Cookie

- Set on successful `POST /login`; cleared/expired on `POST /logout`.
- `HttpOnly`; `Path=/`. No `Secure` attribute in this scope (plain HTTP dev server).
- Exact cookie name is an implementation detail — no scenario in this change depends on it.
- An unrecognized, missing, or tampered cookie value is always treated as "unauthenticated", never a server error.

## Redirect (`next`) validation

- Only a same-origin path starting with `/` is honored as a `next` redirect target after login.
- Anything else (absolute URL, missing leading `/`, absent) falls back to `/books/new`.
