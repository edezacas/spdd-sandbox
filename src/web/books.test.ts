import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { server } from "./server";
import { addAuthor } from "../domain/author";
import { addBook, listBooks } from "../domain/book";

/**
 * Task 3 — Paginate `GET /books` (HTTP contract). Spec criteria 6-12, 15.
 *
 * This file runs in its own process: importing `./server` seeds only the
 * librarian account, so the book/author stores start EMPTY. The first describe
 * pins the empty-catalog cases (and the invalid-param 400s) before anything is
 * seeded; the next describe seeds in a `before` hook and computes every numeric
 * expectation from `listBooks()` — never a hard-coded count.
 */

const ERROR_MESSAGE =
  "Los parámetros page y pageSize deben ser enteros positivos (pageSize máximo 100).";

/** Local copy of the view's escaper, used to build expected HTML fixtures. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** True when `text` is rendered as the content of a table cell. */
function rendersCell(html: string, text: string): boolean {
  return html.includes(`<td>${escapeHtml(text)}</td>`);
}

let baseUrl: string;
let authCookie: string;

async function librarianCookie(): Promise<string> {
  const res = await fetch(`${baseUrl}/login`, {
    method: "POST",
    body: new URLSearchParams({
      username: "bibliotecario",
      password: "biblioteca123",
    }),
    redirect: "manual",
  });
  assert.equal(res.status, 302);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "el login debe establecer una cookie de sesión");
  return setCookie.split(";")[0].trim();
}

before(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  authCookie = await librarianCookie();
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

// --- Estado: repositorio vacío (0 autores, 0 libros). Debe correr primero. ---

describe("GET /books con repositorio vacío (D1)", () => {
  test("seed guard: este describe observa el repositorio vacío", () => {
    assert.equal(listBooks().length, 0, "no debe haber libros sembrados todavía");
  });

  test("parámetros inválidos → 400 por el send path plano: sin <table> y sin ETag", async () => {
    const invalid = [
      "page=abc",
      "page=0",
      "page=-1",
      "page=1.5",
      "page=1e2",
      "page=%2B1", // "+1" crudo: el trim no lo salva
      "page=", // string vacío
      "pageSize=0",
      "pageSize=-10",
      "pageSize=abc",
      "pageSize=1.5",
      "pageSize=101", // por encima del máximo 100
    ];

    for (const qs of invalid) {
      const res = await fetch(`${baseUrl}/books?${qs}`);
      assert.equal(res.status, 400, `esperaba 400 para ?${qs}`);
      const html = await res.text();
      assert.match(html, /<h1>Libros<\/h1>/, `?${qs}`);
      assert.ok(html.includes(ERROR_MESSAGE), `?${qs} debe mostrar el mensaje de error`);
      assert.doesNotMatch(html, /<table/, `?${qs} no debe renderizar el listado`);
      assert.doesNotMatch(html, /Página \d+ de \d+/, `?${qs} no debe renderizar el pager`);
      assert.equal(res.headers.get("etag"), null, `?${qs} no debe llevar ETag`);
    }
  });

  test("sin parámetros: 200, página vacía sin <table> ni navegación", async () => {
    const res = await fetch(`${baseUrl}/books`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<h1>Libros<\/h1>/);
    assert.ok(html.includes("No hay libros todavía."));
    assert.match(html, /href="\/books\/new"/);
    assert.doesNotMatch(html, /<table/);
    assert.doesNotMatch(html, /Página \d+ de \d+/);
    assert.doesNotMatch(html, /Anterior/);
    assert.doesNotMatch(html, /Siguiente/);
  });

  test("?page=99 con repositorio vacío: 200 y ningún pager (D1)", async () => {
    const res = await fetch(`${baseUrl}/books?page=99`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<h1>Libros<\/h1>/);
    assert.ok(html.includes("No hay libros todavía."));
    assert.doesNotMatch(html, /<table/);
    assert.doesNotMatch(html, /Página \d+ de \d+/);
    assert.doesNotMatch(html, /Anterior/);
    assert.doesNotMatch(html, /Siguiente/);
  });
});

// --- Estado: catálogo sembrado vía el dominio (sin HTTP POST) ---

const AUTHOR_ID = "books-route-author-1";
const AUTHOR_NAME = "Ursula & <Co>";
const UNKNOWN_AUTHOR_ID = "books-route-author-inexistente";

describe("GET /books paginado con libros sembrados", () => {
  before(() => {
    addAuthor({ id: AUTHOR_ID, name: AUTHOR_NAME });
    for (let i = 1; i <= 10; i++) {
      addBook({ id: `books-seed-${i}`, title: `Libro ${i}`, authorId: AUTHOR_ID });
    }
    addBook({ id: "books-seed-xss", title: "A & B <script>", authorId: AUTHOR_ID });
    addBook({ id: "books-seed-orphan", title: "Libro huérfano", authorId: UNKNOWN_AUTHOR_ID });
  });

  test("sin parámetros: 200, página 1 de N, pageSize 10 por defecto, sin Anterior y con Siguiente", async () => {
    const all = listBooks();
    const totalPages = Math.ceil(all.length / 10);
    assert.ok(all.length > 10, "guard: hace falta más de una página");

    const res = await fetch(`${baseUrl}/books`);
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.match(html, /<h1>Libros<\/h1>/);
    assert.match(html, new RegExp(`Página 1 de ${totalPages}`));
    for (const book of all.slice(0, 10)) {
      assert.ok(rendersCell(html, book.title), `debe aparecer ${book.title}`);
    }
    assert.ok(!rendersCell(html, all[10].title), `no debe aparecer ${all[10].title}`);
    assert.doesNotMatch(html, /Anterior/);
    assert.match(html, /Siguiente/);
    assert.match(html, /href="\/books\?page=2&pageSize=10"/, "el next lleva pageSize explícito");
  });

  test("page=2&pageSize=10: última página con slice correcto, Anterior y sin Siguiente", async () => {
    const all = listBooks();
    const totalPages = Math.ceil(all.length / 10);

    const res = await fetch(`${baseUrl}/books?page=2&pageSize=10`);
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.match(html, new RegExp(`Página 2 de ${totalPages}`));
    for (const book of all.slice(10, 20)) {
      assert.ok(rendersCell(html, book.title), `debe aparecer ${book.title}`);
    }
    assert.ok(!rendersCell(html, all[0].title), `no debe aparecer ${all[0].title}`);
    assert.match(html, /Anterior/);
    assert.match(html, /href="\/books\?page=1&pageSize=10"/, "el prev lleva pageSize explícito");
    assert.doesNotMatch(html, /Siguiente/);
  });

  test("200 válido se sirve con ETag fuerte y Cache-Control: no-cache", async () => {
    const res = await fetch(`${baseUrl}/books`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-cache");
    const etag = res.headers.get("etag");
    assert.ok(etag, "un 200 de /books debe llevar ETag");
    assert.match(etag, /^"[0-9a-f]+"$/, "validador fuerte entre comillas");
  });

  test("dos páginas distintas producen ETags distintos (ETag derivado del cuerpo)", async () => {
    const page1 = await fetch(`${baseUrl}/books?page=1&pageSize=10`);
    const page2 = await fetch(`${baseUrl}/books?page=2&pageSize=10`);
    assert.equal(page1.status, 200);
    assert.equal(page2.status, 200);

    const etag1 = page1.headers.get("etag");
    const etag2 = page2.headers.get("etag");
    assert.ok(etag1);
    assert.ok(etag2);
    assert.notEqual(etag1, etag2);
    assert.notEqual(await page1.text(), await page2.text());
  });

  test("valores aceptados como /authors: ' 10 ', '007', '100'", async () => {
    const accepted = [
      "pageSize=%2010%20", // " 10 "
      "pageSize=007",
      "page=%2002%20&pageSize=10", // " 02 "
      "pageSize=100",
    ];
    for (const qs of accepted) {
      const res = await fetch(`${baseUrl}/books?${qs}`);
      assert.equal(res.status, 200, `esperaba 200 para ?${qs}`);
      assert.ok(res.headers.get("etag"), `?${qs} debe llevar ETag`);
    }
  });

  test("pageSize=100 (el máximo) muestra todo el catálogo en una página", async () => {
    const all = listBooks();
    const res = await fetch(`${baseUrl}/books?pageSize=100`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Página 1 de 1/);
    for (const book of all) {
      assert.ok(rendersCell(html, book.title), `debe aparecer ${book.title}`);
    }
  });

  test("página más allá de la última: 200 con tabla vacía, sin Siguiente y copy intacto", async () => {
    const all = listBooks();
    const totalPages = Math.ceil(all.length / 10);
    const page = totalPages + 5;

    const res = await fetch(`${baseUrl}/books?page=${page}`);
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.match(html, /<h1>Libros<\/h1>/);
    assert.match(html, /<table/);
    assert.match(html, /<tbody>\s*<\/tbody>/, "la tabla se renderiza pero sin filas");
    assert.match(html, new RegExp(`Página ${page} de ${totalPages}`));
    assert.doesNotMatch(html, /Siguiente/);
    assert.match(html, /Anterior/);
    for (const book of all) {
      assert.ok(!rendersCell(html, book.title), `no debe aparecer ${book.title}`);
    }
  });

  test("filas: resuelve authorId al nombre, usa 'Autor desconocido' y escapa título y autor", async () => {
    const res = await fetch(`${baseUrl}/books?pageSize=100`);
    assert.equal(res.status, 200);
    const html = await res.text();

    // authorId conocido → nombre resuelto, escapado
    assert.ok(html.includes(escapeHtml(AUTHOR_NAME)), "el nombre del autor debe aparecer escapado");
    assert.doesNotMatch(html, /Ursula & <Co>/);

    // título escapado (XSS)
    assert.ok(html.includes("A &amp; B &lt;script&gt;"));
    assert.doesNotMatch(html, /A & B <script>/);

    // authorId desconocido → placeholder
    assert.ok(html.includes("Autor desconocido"));
  });
});

// --- No regresión a nivel de ruta ---

describe("no regresión de /books", () => {
  test("GET /books sigue siendo público (sin cookie)", async () => {
    const res = await fetch(`${baseUrl}/books`);
    assert.equal(res.status, 200);
  });

  test("GET /books/new sigue renderizando el <select> de autores", async () => {
    const res = await fetch(`${baseUrl}/books/new`, { headers: { cookie: authCookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<select/);
    assert.match(html, new RegExp(`<option value="${AUTHOR_ID}">${escapeHtml(AUTHOR_NAME)}</option>`));
  });

  test("POST /books válido redirige 302 a /books y crea el libro", async () => {
    const before = listBooks().length;
    const res = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { cookie: authCookie },
      body: new URLSearchParams({ title: "Libro post-regresión", authorId: AUTHOR_ID }),
      redirect: "manual",
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/books");
    assert.equal(listBooks().length, before + 1);
  });
});
