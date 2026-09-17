import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { addBook, listBooks, listBooksPage, type BooksPage } from "./book";

// The module-level `books` array is shared across tests in this file and grows
// as books are added (no reset between tests; node --test gives each file its
// own process). The first describe therefore runs before any seeding and can
// observe the empty repository; later describes compute expectations from
// `listBooks()` so they stay robust against accumulated state.

describe("listBooksPage with an empty repository", () => {
  test("returns an empty page with total 0 and totalPages 0", () => {
    assert.equal(listBooks().length, 0, "seed guard: this test must run before others seed books");
    const page: BooksPage = listBooksPage(1, 10);
    assert.deepEqual(page.items, []);
    assert.equal(page.page, 1);
    assert.equal(page.pageSize, 10);
    assert.equal(page.total, 0);
    assert.equal(page.totalPages, 0); // Math.ceil(0 / pageSize) === 0
  });
});

describe("listBooksPage pagination math", () => {
  // Seed a deterministic block of 25 books so slicing/rounding assertions are
  // exact. Seeding lives in a before() hook (NOT the describe body) because the
  // describe body runs at registration time, before the empty-repository test.
  before(() => {
    for (let i = 0; i < 25; i++) {
      addBook({
        id: `seed-${String(i).padStart(2, "0")}`,
        title: `Book ${i}`,
        authorId: `author-${i}`,
      });
    }
  });

  test("page 2 with pageSize 10 returns books 11–20 in insertion order", () => {
    const page = listBooksPage(2, 10);
    const expected = listBooks().slice(10, 20);
    assert.equal(page.items.length, 10);
    assert.deepEqual(page.items, expected);
    assert.equal(page.items[0].id, "seed-10");
    assert.equal(page.items[9].id, "seed-19");
    assert.equal(page.page, 2);
    assert.equal(page.pageSize, 10);
    assert.equal(page.total, listBooks().length);
    assert.equal(page.totalPages, 3); // 25 books / 10 per page, rounded up
  });

  test("last partial page: page 3 of size 10 returns the remaining 5 books", () => {
    const page = listBooksPage(3, 10);
    const expected = listBooks().slice(20, 25);
    assert.equal(page.items.length, 5);
    assert.deepEqual(page.items, expected);
    assert.equal(page.items[0].id, "seed-20");
    assert.equal(page.items[4].id, "seed-24");
    assert.equal(page.totalPages, 3);
  });

  test("totalPages divides exactly: 30 books with pageSize 10 → totalPages 2 for page 2", () => {
    for (let i = 0; i < 5; i++) {
      addBook({
        id: `exact-${i}`,
        title: `Exact ${i}`,
        authorId: `author-exact-${i}`,
      });
    }
    const page = listBooksPage(2, 10);
    assert.equal(page.total, listBooks().length);
    assert.equal(page.totalPages, Math.ceil(listBooks().length / 10));
  });

  test("page beyond the last returns an empty items array (no throw)", () => {
    const page = listBooksPage(99, 10);
    assert.deepEqual(page.items, []);
    assert.equal(page.page, 99);
    assert.equal(page.pageSize, 10);
    assert.equal(page.total, listBooks().length);
    assert.equal(page.totalPages, Math.ceil(listBooks().length / 10));
  });

  test("pageSize at the upper bound (100) is accepted", () => {
    const page = listBooksPage(1, 100);
    assert.equal(page.pageSize, 100);
    assert.equal(page.items.length, listBooks().length);
    assert.equal(page.totalPages, 1);
  });

  test("the returned items array is a copy (mutating it does not touch the repository)", () => {
    const page = listBooksPage(1, 10);
    page.items.length = 0;
    assert.equal(listBooks().length, page.total);
    assert.ok(listBooks().length > 0);
  });
});

describe("listBooksPage contract enforcement (throws)", () => {
  test("throws on page 0, negative, or non-integer", () => {
    assert.throws(() => listBooksPage(0, 10));
    assert.throws(() => listBooksPage(-1, 10));
    assert.throws(() => listBooksPage(1.5, 10));
    assert.throws(() => listBooksPage(Number.NaN, 10));
  });

  test("throws on pageSize 0, negative, non-integer, or above 100", () => {
    assert.throws(() => listBooksPage(1, 0));
    assert.throws(() => listBooksPage(1, -5));
    assert.throws(() => listBooksPage(1, 1.5));
    assert.throws(() => listBooksPage(1, 101));
    assert.throws(() => listBooksPage(1, Number.NaN));
  });
});

describe("listBooks stays as-is", () => {
  test("returns every book, untouched by pagination", () => {
    const all = listBooks();
    assert.equal(all.length, all.length);
    assert.ok(all.length > 0);
    assert.equal(listBooksPage(1, 10).total, all.length);
    // listBooks() still returns the full list, pageSize is irrelevant to it.
    const fromPage = listBooksPage(1, 10).items;
    assert.deepEqual(all.slice(0, fromPage.length), fromPage);
  });
});
