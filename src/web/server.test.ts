import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { server } from "./server";
import { addAuthor } from "../domain/author";
import { listBooks } from "../domain/book";

let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

// --- Scenario: no hay ningún autor todavía (debe ejecutarse antes de crear autores) ---
describe("sin autores registrados", () => {
  test("GET /books/new muestra aviso y no renderiza <select> de autores", async () => {
    const res = await fetch(`${baseUrl}/books/new`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /No hay autores disponibles/);
    assert.doesNotMatch(html, /<select/);
  });
});

describe("con autores registrados", () => {
  let authorId: string;

  before(() => {
    const author = addAuthor({ id: "test-author-1", name: "Jane Austen" });
    authorId = author.id;
  });

  test("GET /books/new incluye un <select> con los autores existentes", async () => {
    const res = await fetch(`${baseUrl}/books/new`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<select/);
    assert.match(html, new RegExp(`<option value="${authorId}">Jane Austen</option>`));
  });

  test("Happy path: POST /books válido crea el libro y GET /books lo muestra", async () => {
    const before = listBooks().length;

    const postRes = await fetch(`${baseUrl}/books`, {
      method: "POST",
      body: new URLSearchParams({ title: "Orgullo y prejuicio", authorId }),
      redirect: "manual",
    });

    assert.equal(postRes.status, 302);
    assert.equal(postRes.headers.get("location"), "/books");
    assert.equal(listBooks().length, before + 1);

    const listRes = await fetch(`${baseUrl}/books`);
    assert.equal(listRes.status, 200);
    const html = await listRes.text();
    assert.match(html, /Orgullo y prejuicio/);
    assert.match(html, /Jane Austen/);
  });

  test("Título vacío responde 400 y no crea el libro", async () => {
    const before = listBooks().length;
    const res = await fetch(`${baseUrl}/books`, {
      method: "POST",
      body: new URLSearchParams({ title: "", authorId }),
    });
    assert.equal(res.status, 400);
    assert.equal(listBooks().length, before);
  });

  test("Título compuesto solo de espacios responde 400 y no crea el libro", async () => {
    const before = listBooks().length;
    const res = await fetch(`${baseUrl}/books`, {
      method: "POST",
      body: new URLSearchParams({ title: "   ", authorId }),
    });
    assert.equal(res.status, 400);
    assert.equal(listBooks().length, before);
  });

  test("authorId inexistente responde 400 y no crea el libro", async () => {
    const before = listBooks().length;
    const res = await fetch(`${baseUrl}/books`, {
      method: "POST",
      body: new URLSearchParams({ title: "Libro huérfano", authorId: "no-existe" }),
    });
    assert.equal(res.status, 400);
    assert.equal(listBooks().length, before);
  });

  test("authorId vacío (sin seleccionar autor) responde 400 y no crea el libro", async () => {
    const before = listBooks().length;
    const res = await fetch(`${baseUrl}/books`, {
      method: "POST",
      body: new URLSearchParams({ title: "Libro sin autor", authorId: "" }),
    });
    assert.equal(res.status, 400);
    assert.equal(listBooks().length, before);
  });

  test("cada libro insertado recibe un id único generado por el servidor", async () => {
    await fetch(`${baseUrl}/books`, {
      method: "POST",
      body: new URLSearchParams({ title: "Libro A", authorId }),
    });
    await fetch(`${baseUrl}/books`, {
      method: "POST",
      body: new URLSearchParams({ title: "Libro B", authorId }),
    });

    const books = listBooks();
    const ids = books.map((b) => b.id);
    assert.equal(new Set(ids).size, ids.length, "todos los ids deben ser únicos");
  });

  test("dos libros con el mismo título se crean sin error", async () => {
    const before = listBooks().length;

    const first = await fetch(`${baseUrl}/books`, {
      method: "POST",
      body: new URLSearchParams({ title: "Título repetido", authorId }),
      redirect: "manual",
    });
    const second = await fetch(`${baseUrl}/books`, {
      method: "POST",
      body: new URLSearchParams({ title: "Título repetido", authorId }),
      redirect: "manual",
    });

    assert.equal(first.status, 302);
    assert.equal(second.status, 302);
    assert.equal(listBooks().length, before + 2);
  });

  test("DELETE /books (verbo no soportado en ruta conocida) responde 405", async () => {
    const res = await fetch(`${baseUrl}/books`, { method: "DELETE" });
    assert.equal(res.status, 405);
  });

  test("GET a una ruta no definida responde 404", async () => {
    const res = await fetch(`${baseUrl}/does-not-exist`);
    assert.equal(res.status, 404);
  });
});
