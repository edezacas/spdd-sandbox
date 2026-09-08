import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { addUser, getUserByUsername, hashPassword, verifyPassword, User } from "./user";

// The module-level `users` array is shared across tests in this file and grows
// as users are added (no reset between tests; node --test gives each file its
// own process). The first describe therefore runs before any seeding and can
// observe the empty repository; later describes build on the users seeded by
// earlier tests.

describe("addUser and getUserByUsername with an empty repository", () => {
  test("user-auth-1: stores and retrieves a user by username", () => {
    assert.equal(getUserByUsername("bibliotecario"), undefined, "seed guard: this test must run before others seed users");
    const user: User = { id: "u1", username: "bibliotecario", passwordHash: "hash-u1" };
    const added = addUser(user);
    assert.deepEqual(getUserByUsername("bibliotecario"), added);
  });

  test("user-auth-2: unknown username returns undefined and never throws", () => {
    assert.equal(getUserByUsername("no-existe"), undefined);
  });
});

describe("getUserByUsername matching rules", () => {
  test("user-auth-3: username lookup is case-sensitive", () => {
    assert.equal(getUserByUsername("Bibliotecario"), undefined);
    assert.equal(getUserByUsername("BIBLIOTECARIO"), undefined);
  });

  test("user-auth-4: duplicate usernames are stored and the first one added wins", () => {
    const first = getUserByUsername("bibliotecario");
    assert.ok(first);
    const duplicate: User = { id: "u2", username: "bibliotecario", passwordHash: "hash-u2" };
    addUser(duplicate);
    // Both entries coexist: if the duplicate had replaced the first entry,
    // the lookup would now return the duplicate instead.
    assert.deepEqual(getUserByUsername("bibliotecario"), first);
    assert.notDeepEqual(getUserByUsername("bibliotecario"), duplicate);
  });
});

describe("hashPassword and verifyPassword", () => {
  test("user-auth-5: hashes are salted and never equal the plaintext", () => {
    const firstHash = hashPassword("biblioteca123");
    const secondHash = hashPassword("biblioteca123");
    assert.notEqual(firstHash, "biblioteca123");
    assert.notEqual(secondHash, "biblioteca123");
    assert.notEqual(firstHash, secondHash);
  });

  test("user-auth-6: verification round-trips for the correct password", () => {
    const passwordHash = hashPassword("biblioteca123");
    assert.equal(verifyPassword("biblioteca123", passwordHash), true);
  });

  test("user-auth-7: verification fails for a wrong password", () => {
    const passwordHash = hashPassword("biblioteca123");
    assert.equal(verifyPassword("otra-cosa", passwordHash), false);
  });

  test("returns false instead of throwing for a hash not in the expected format", () => {
    assert.equal(verifyPassword("biblioteca123", "no-separator-hash"), false);
  });
});
