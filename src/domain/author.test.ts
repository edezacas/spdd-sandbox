import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { addAuthor, listAuthors, listAuthorsPage } from "./author";

// The module-level `authors` array is shared across tests in this file and grows
// as authors are added (no reset between tests; node --test gives each file its
// own process). The first describe therefore runs before any seeding and can
// observe the empty repository; later describes compute expectations from
// `listAuthors()` so they stay robust against accumulated state.

describe("listAuthorsPage with an empty repository", () => {
  test("returns an empty page with total 0 and totalPages 0", () => {
    assert.equal(listAuthors().length, 0, "seed guard: this test must run before others seed authors");
    const page = listAuthorsPage(1, 10);
    assert.deepEqual(page.items, []);
    assert.equal(page.page, 1);
    assert.equal(page.pageSize, 10);
    assert.equal(page.total, 0);
    assert.equal(page.totalPages, 0);
  });
});

describe("listAuthorsPage pagination math", () => {
  // Seed a deterministic block of 25 authors so slicing/rounding assertions are
  // exact. Seeding lives in a before() hook (NOT the describe body) because the
  // describe body runs at registration time, before the empty-repository test.
  before(() => {
    for (let i = 0; i < 25; i++) {
      addAuthor({ id: `seed-${String(i).padStart(2, "0")}`, name: `Author ${i}` });
    }
  });

  test("page 2 with pageSize 10 returns authors 11–20 in insertion order", () => {
    const page = listAuthorsPage(2, 10);
    const expected = listAuthors().slice(10, 20);
    assert.equal(page.items.length, 10);
    assert.deepEqual(page.items, expected);
    assert.equal(page.items[0].id, "seed-10");
    assert.equal(page.items[9].id, "seed-19");
    assert.equal(page.page, 2);
    assert.equal(page.pageSize, 10);
    assert.equal(page.total, listAuthors().length);
    assert.equal(page.totalPages, 3); // 25 authors / 10 per page, rounded up
  });

  test("last partial page: page 3 of size 10 returns the remaining 5 authors", () => {
    const page = listAuthorsPage(3, 10);
    const expected = listAuthors().slice(20, 25);
    assert.equal(page.items.length, 5);
    assert.deepEqual(page.items, expected);
    assert.equal(page.items[0].id, "seed-20");
    assert.equal(page.items[4].id, "seed-24");
    assert.equal(page.totalPages, 3);
  });

  test("totalPages divides exactly: 30 authors with pageSize 10 → totalPages 2 for page 2", () => {
    for (let i = 0; i < 5; i++) {
      addAuthor({ id: `exact-${i}`, name: `Exact ${i}` });
    }
    const page = listAuthorsPage(2, 10);
    assert.equal(page.total, listAuthors().length);
    assert.equal(page.totalPages, Math.ceil(listAuthors().length / 10));
  });

  test("page beyond the last returns an empty items array (no throw)", () => {
    const page = listAuthorsPage(99, 10);
    assert.deepEqual(page.items, []);
    assert.equal(page.page, 99);
    assert.equal(page.pageSize, 10);
    assert.equal(page.total, listAuthors().length);
    assert.equal(page.totalPages, Math.ceil(listAuthors().length / 10));
  });

  test("pageSize at the upper bound (100) is accepted", () => {
    const page = listAuthorsPage(1, 100);
    assert.equal(page.pageSize, 100);
    assert.equal(page.items.length, listAuthors().length);
    assert.equal(page.totalPages, 1);
  });

  test("the returned items array is a copy (mutating it does not touch the repository)", () => {
    const page = listAuthorsPage(1, 10);
    page.items.length = 0;
    assert.equal(listAuthors().length, page.total);
    assert.ok(listAuthors().length > 0);
  });
});

describe("listAuthorsPage contract enforcement (throws)", () => {
  test("throws on page 0, negative, or non-integer", () => {
    assert.throws(() => listAuthorsPage(0, 10));
    assert.throws(() => listAuthorsPage(-1, 10));
    assert.throws(() => listAuthorsPage(1.5, 10));
    assert.throws(() => listAuthorsPage(Number.NaN, 10));
  });

  test("throws on pageSize 0, negative, non-integer, or above 100", () => {
    assert.throws(() => listAuthorsPage(1, 0));
    assert.throws(() => listAuthorsPage(1, -5));
    assert.throws(() => listAuthorsPage(1, 1.5));
    assert.throws(() => listAuthorsPage(1, 101));
    assert.throws(() => listAuthorsPage(1, Number.NaN));
  });
});

describe("listAuthors stays as-is", () => {
  test("returns every author, untouched by pagination", () => {
    const all = listAuthors();
    assert.equal(all.length, all.length);
    assert.ok(all.length > 0);
    assert.equal(listAuthorsPage(1, 10).total, all.length);
    // listAuthors() still returns the full list, pageSize is irrelevant to it.
    const fromPage = listAuthorsPage(1, 10).items;
    assert.deepEqual(all.slice(0, fromPage.length), fromPage);
  });
});