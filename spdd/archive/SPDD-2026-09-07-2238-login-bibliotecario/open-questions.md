# Open questions (resolved)

The request ("Tenemos que añadir un login al sistema") left the scope of "login" undefined. The five questions below were originally written with assumed defaults so work could proceed unblocked. **All five are now resolved.** Each entry keeps the original question for traceability, records the original assumed default, the explicit decision with rationale, and the files touched because of it. No scenario or contract in this change remains blocked by an open question.

## 1. Which routes require login?

Original question: **Which routes require login?**
Original assumed default: only the book-mutation routes (`GET /books/new`, `POST /books`) — sub-spec 3. `GET /books` and `GET /authors` stay public.

Resolved: only `GET /books/new` and `POST /books` require login; `GET /books` and `GET /authors` remain public and unchanged.

Rationale: the narrow reading is the smallest change that satisfies "add a login" without contradicting the existing explicitly-public author listing (framed in its own canvas as a public "library user" feature). The sandbox is an SPDD test bench with no reader-facing self-service feature, so protecting read-only pages would be a bigger, different-shaped change with no driver here.

Files touched: `03-protect-book-mutation.md` — invariant and out-of-scope notes updated from "flagged for confirmation" to resolved; no scenario changes were needed (`protect-book-mutation-5` and `librarian-login-e2e-3` already pin the public routes).

## 2. Is a single flat role ("librarian") enough?

Original question: **Is a single flat role ("librarian") enough, or is a "reader" role/self-service login also wanted, now or as groundwork?**
Original assumed default: a single role, no `role` field on `User`, no reader-specific behavior (there is no reader-facing self-service feature in the app today to protect).

Resolved: single flat role ("librarian"). No `role` field on `User`, no reader accounts, no permission concept in this change.

Rationale: there is no reader-facing feature to protect today (no self-service loans exposed on the web), so a role field would be speculative groundwork for a feature that does not exist. The already-implemented `src/domain/user.ts` `User` shape (`{ id, username, passwordHash }`) matches this exactly.

Files touched: none — sub-spec 1's contract and scenarios, sub-spec 2, and `shared-contracts.md` already encode a role-less `User`, and the implemented domain code required no change.

## 3. Seeded credentials: hardcoded in the spec vs. configurable

Original question: **Seeded credentials: hardcoded in the spec vs. configurable.**
Original assumed default: one hardcoded seed account (`bibliotecario` / `biblioteca123`) created at every server start, with no way to change it short of editing code — no self-registration, no account management UI.

Resolved: keep the hardcoded seed — exactly one account, username `bibliotecario`, password `biblioteca123` as literal values, created at every server start. No `LIBRARIAN_PASSWORD` (or any other) environment variable or configuration knob in this change. The seeded username is `bibliotecario` and the password `biblioteca123` verbatim everywhere in the Gherkin scenarios and the E2E suite.

Rationale: this repo is an explicitly non-production SPDD test bench with in-memory state wiped on every process restart — `biblioteca123` is a fixture, not a secret, so the committed-password precedent concern carries minimal weight here. Concrete literals keep the Gherkin scenarios and E2E assertions deterministic, whereas an env var would introduce the project's first configuration surface (read timing, empty/unset handling, documented override behavior) and split truth between "the default" and "the configured value" across every scenario that uses the credential — real scope for zero user-visible benefit in this sandbox. If the sandbox ever gains persistence or a deployment target, revisiting this via a new change is cheap: seeding lives in sub-spec 2's server-start Background, not in the already-implemented domain code.

Files touched: `shared-contracts.md` — seeded-account section annotated as resolved/hardcoded, with an explicit sentence stating the values are literals, not configurable. No scenario edits anywhere: every Gherkin step already uses the concrete literals.

## 4. Post-login default destination

Original question: **Post-login default destination.**
Original assumed default: `/books/new` (the protected action the login exists to gate).

Resolved: `/books/new` is the post-login default destination — it is also the `next` fallback (when `next` is absent or off-origin) and the redirect target for an already-authenticated `GET /login`.

Rationale: the login exists to gate `/books/new`; landing on the gated action completes the blocked → log in → act loop, while `/books` (public) would dead-end the flow right after authenticating. Keeps `login-session-6` consistent with the same default.

Files touched: none — `login-session-2`/`login-session-3`/`login-session-6`, the status-code table in `shared-contracts.md`, and `librarian-login-e2e-1` already specify `/books/new`.

## 5. Status code for wrong credentials on the login form

Original question: **Status code for wrong credentials on the login form.**
Original assumed default: `401` for wrong username/password on `POST /login`, distinct from the `400` used for empty fields.

Resolved: keep `401` for wrong username/password on `POST /login`; `400` remains reserved for structurally invalid submissions (empty username/password). This intentionally extends the project's status-code vocabulary (`200`/`302`/`400`/`404`/`405`, see `spdd/specs/biblioteca.md`) with a first use of `401`.

Rationale: HTTP semantics genuinely separate "malformed submission" from "authentication failure"; collapsing both into `400` would make `login-session-5` and `login-session-4` indistinguishable and weaken the E2E wrong-credentials assertion. The absence of a `401` precedent is the absence of a constraint, not a reason to avoid it — the `/login` web layer does not exist yet, so nothing fights the addition. It differs intentionally from the auth guard's `302` redirect on protected routes (see `03-protect-book-mutation.md` invariants).

Files touched: `03-protect-book-mutation.md` — invariant note about the intentional `401`/`302` split updated from "flagged for confirmation" to resolved; `e2e-qa.md` — `librarian-login-e2e-2` now pins the concrete `401` on the wrong-credentials submission. (`02-web-login-session.md`'s `login-session-4` and the status-code table in `shared-contracts.md` already specified `401`.)

## Closing note

Sub-spec 1 (`01-domain-user-auth.md`) required no changes: it is already implemented (`src/domain/user.ts`, `src/domain/user.test.ts`) and matches every resolution above — role-less `User`, no seeding in the domain (seeding is sub-spec 2's server-start Background), no configurable credentials. No pending code changes were introduced by any resolution.
