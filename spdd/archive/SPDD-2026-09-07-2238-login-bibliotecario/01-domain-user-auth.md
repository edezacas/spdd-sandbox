# Sub-spec 1: `User` entity + password hashing (domain layer)

## Goal

Provide an in-memory `User` entity, a repository for it, and password hashing/verification, mirroring the module conventions already established by `Author`/`Book`/`Loan` (module-level array, plain functions, domain enforces only its own invariants by throwing — external-input validation stays in the web layer). This is the foundation for the login web flow (sub-spec 2); it has no HTTP dependency and is independently unit-testable.

## Contract

```ts
interface User {
  id: string;
  username: string;
  passwordHash: string; // opaque; never the plaintext password
}

function addUser(user: User): User;
function getUserByUsername(username: string): User | undefined;

function hashPassword(plainPassword: string): string;   // salted: two calls with the same input return different strings
function verifyPassword(plainPassword: string, passwordHash: string): boolean;
```

- `getUserByUsername` does an exact, case-sensitive match, mirroring `getAuthor`/`getBook`'s `find`-based lookup.
- Neither `addUser` nor `getUserByUsername` performs input validation (empty username, etc.) — consistent with the project norm that external-input validation lives in the web layer, not the domain.
- `hashPassword`/`verifyPassword` do not prescribe a specific algorithm; the only externally observable requirements are: (a) the output is never equal to the input, (b) hashing the same input twice yields two different outputs (salted), and (c) `verifyPassword` correctly round-trips.

## Scenarios

```gherkin
Feature: User authentication (domain layer)

  # ADD user-auth-1: store and retrieve a user by username
  Scenario: user-auth-1
    Given no users exist in the repository
    When a user is added via addUser with username "bibliotecario" and some passwordHash
    Then getUserByUsername("bibliotecario") returns that same user

  # ADD user-auth-2: unknown username returns undefined, never throws
  Scenario: user-auth-2
    Given no user with username "no-existe" exists
    When getUserByUsername("no-existe") is called
    Then it returns undefined

  # ADD user-auth-3: username lookup is case-sensitive
  Scenario: user-auth-3
    Given a user exists with username "bibliotecario"
    When getUserByUsername("Bibliotecario") is called
    Then it returns undefined (no case-insensitive match)

  # ADD user-auth-4: duplicate usernames are not rejected by the domain
  Scenario: user-auth-4
    Given a user exists with username "bibliotecario"
    When a second user is added via addUser with the same username "bibliotecario"
    Then both entries are stored — addUser enforces no uniqueness constraint, consistent with
      Book having no uniqueness constraint on title — and getUserByUsername returns the first
      one added (insertion order, same precedent as getAuthor/getBook)

  # ADD user-auth-5: password hash is salted and never equals the plaintext
  Scenario: user-auth-5
    When hashPassword("biblioteca123") is called twice
    Then both returned hashes differ from "biblioteca123", and the two hashes differ from each other

  # ADD user-auth-6: password verification round-trip succeeds for the correct password
  Scenario: user-auth-6
    Given passwordHash is the result of hashPassword("biblioteca123")
    When verifyPassword("biblioteca123", passwordHash) is called
    Then it returns true

  # ADD user-auth-7: password verification fails for a wrong password
  Scenario: user-auth-7
    Given passwordHash is the result of hashPassword("biblioteca123")
    When verifyPassword("otra-cosa", passwordHash) is called
    Then it returns false
```

## Invariants

- No function in this module ever logs, returns, or stores the plaintext password.
- The plaintext password is never compared with `===`/`==` against a `passwordHash` anywhere in the system — only `verifyPassword` performs that comparison.

## Out of scope

- Roles/permissions on `User` beyond a flat account concept (no `role` field needed — see `open-questions.md`).
- Email, password-strength rules, password change/reset, account lockout.
- Self-registration / any UI to create users (seeding is covered in sub-spec 2's "Background").

## Relevant files (existing, investigated)

- `src/domain/author.ts`, `src/domain/book.ts` — module-level array + `add`/`get`/`list` convention to mirror.
- `src/domain/loan.ts` — precedent for a domain function throwing on its own invariant (`borrowBook` throws on unknown book / already-on-loan) — same posture applies here if `addUser`/`getUserByUsername` ever need to throw, though this spec doesn't require them to.
