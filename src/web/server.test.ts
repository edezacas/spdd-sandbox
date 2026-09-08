import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { server } from "./server";
import { addAuthor, listAuthors } from "../domain/author";
import { listBooks } from "../domain/book";

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

// --- Scenario: no hay ningún autor todavía (debe ejecutarse antes de crear autores) ---
describe("sin autores registrados", () => {
  test("GET /books/new muestra aviso y no renderiza <select> de autores", async () => {
    const res = await fetch(`${baseUrl}/books/new`, { headers: { cookie: authCookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /No hay autores disponibles/);
    assert.doesNotMatch(html, /<select/);
  });

  test("GET /authors con repositorio vacío muestra aviso y sin navegación", async () => {
    const res = await fetch(`${baseUrl}/authors`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /No hay autores todavía\./);
    assert.doesNotMatch(html, /<table/);
    assert.doesNotMatch(html, /Anterior/);
    assert.doesNotMatch(html, /Siguiente/);
  });
});

describe("con autores registrados", () => {
  let authorId: string;

  before(() => {
    const author = addAuthor({ id: "test-author-1", name: "Jane Austen" });
    authorId = author.id;
  });

  test("GET /books/new incluye un <select> con los autores existentes", async () => {
    const res = await fetch(`${baseUrl}/books/new`, { headers: { cookie: authCookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<select/);
    assert.match(html, new RegExp(`<option value="${authorId}">Jane Austen</option>`));
  });

  test("Happy path: POST /books válido crea el libro y GET /books lo muestra", async () => {
    const before = listBooks().length;

    const postRes = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { cookie: authCookie },
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
      headers: { cookie: authCookie },
      body: new URLSearchParams({ title: "", authorId }),
    });
    assert.equal(res.status, 400);
    assert.equal(listBooks().length, before);
  });

  test("Título compuesto solo de espacios responde 400 y no crea el libro", async () => {
    const before = listBooks().length;
    const res = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { cookie: authCookie },
      body: new URLSearchParams({ title: "   ", authorId }),
    });
    assert.equal(res.status, 400);
    assert.equal(listBooks().length, before);
  });

  test("authorId inexistente responde 400 y no crea el libro", async () => {
    const before = listBooks().length;
    const res = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { cookie: authCookie },
      body: new URLSearchParams({ title: "Libro huérfano", authorId: "no-existe" }),
    });
    assert.equal(res.status, 400);
    assert.equal(listBooks().length, before);
  });

  test("authorId vacío (sin seleccionar autor) responde 400 y no crea el libro", async () => {
    const before = listBooks().length;
    const res = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { cookie: authCookie },
      body: new URLSearchParams({ title: "Libro sin autor", authorId: "" }),
    });
    assert.equal(res.status, 400);
    assert.equal(listBooks().length, before);
  });

  test("cada libro insertado recibe un id único generado por el servidor", async () => {
    await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { cookie: authCookie },
      body: new URLSearchParams({ title: "Libro A", authorId }),
    });
    await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { cookie: authCookie },
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
      headers: { cookie: authCookie },
      body: new URLSearchParams({ title: "Título repetido", authorId }),
      redirect: "manual",
    });
    const second = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { cookie: authCookie },
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

describe("GET /authors — listado paginado", () => {
  // Añade 24 autores (page-00..page-23) además del "test-author-1" (Jane Austen)
  // creado en la suite anterior → total 25 autores para páginas exactas de 10.
  before(() => {
    for (let i = 0; i < 24; i++) {
      addAuthor({ id: `page-${String(i).padStart(2, "0")}`, name: `Autor ${i}` });
    }
  });

  test("Happy path: page 2 pageSize 10 muestra autores 11–20, 'Página 2 de 3' y links prev/next", async () => {
    const res = await fetch(`${baseUrl}/authors?page=2&pageSize=10`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Página 2 de 3/);
    // 25 autores: índices 0..9 = página 1 (Jane + Autor 0..8), 10..19 = página 2 (Autor 9..18), 20..24 = página 3
    for (let i = 9; i <= 18; i++) {
      assert.match(html, new RegExp(`>Autor ${i}<`));
    }
    assert.doesNotMatch(html, />Autor 8</);
    assert.doesNotMatch(html, />Autor 19</);
    assert.doesNotMatch(html, />Jane Austen</);
    assert.match(html, /Anterior/);
    assert.match(html, /Siguiente/);
    assert.match(html, /href="\/authors\?page=1&pageSize=10"/);
    assert.match(html, /href="\/authors\?page=3&pageSize=10"/);
  });

  test("sin params: página 1 con pageSize 10", async () => {
    const res = await fetch(`${baseUrl}/authors`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Página 1 de 3/);
    assert.match(html, />Jane Austen</);
    assert.match(html, />Autor 0</);
    assert.doesNotMatch(html, />Autor 9</);
    assert.doesNotMatch(html, /Anterior/);
    assert.match(html, /Siguiente/);
  });

  test("última página parcial: page 3 pageSize 10 muestra los 5 restantes y sin next", async () => {
    const res = await fetch(`${baseUrl}/authors?page=3&pageSize=10`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Página 3 de 3/);
    assert.match(html, />Autor 19</);
    assert.match(html, />Autor 23</);
    assert.doesNotMatch(html, />Autor 18</);
    assert.match(html, /Anterior/);
    assert.doesNotMatch(html, /Siguiente/);
  });

  test("pageSize=100 en el límite superior responde 200 con todos los autores en una página", async () => {
    const res = await fetch(`${baseUrl}/authors?pageSize=100`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Página 1 de 1/);
    assert.match(html, />Jane Austen</);
    assert.match(html, />Autor 23</);
  });

  test("parámetros inválidos responden 400 sin renderizar el listado", async () => {
    const cases = ["page=abc", "page=0", "page=-1", "page=1.5", "pageSize=0", "pageSize=500", "pageSize=abc"];
    for (const qs of cases) {
      const res = await fetch(`${baseUrl}/authors?${qs}`);
      assert.equal(res.status, 400, `expected 400 for ?${qs}`);
      const html = await res.text();
      assert.match(html, /enteros positivos/);
      assert.doesNotMatch(html, /<table/);
      assert.doesNotMatch(html, /Página \d+ de \d+/);
    }
  });

  test("página más allá de la última: 200 con página vacía y sin next", async () => {
    const res = await fetch(`${baseUrl}/authors?page=99`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.doesNotMatch(html, />Autor /);
    assert.doesNotMatch(html, />Jane Austen</);
    assert.doesNotMatch(html, /Siguiente/);
  });

  test("POST /authors (verbo no soportado en ruta conocida) responde 405", async () => {
    const res = await fetch(`${baseUrl}/authors`, { method: "POST" });
    assert.equal(res.status, 405);
  });

  test("los nombres de autor se escapan en el HTML (XSS)", async () => {
    addAuthor({ id: "esc-1", name: "Le Guin & <Sons>" });
    const res = await fetch(`${baseUrl}/authors?pageSize=100`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Le Guin &amp; &lt;Sons&gt;/);
    assert.doesNotMatch(html, /Le Guin & <Sons>/);
  });

  test("regresión: GET /books/new sigue listando TODOS los autores en el <select>", async () => {
    const res = await fetch(`${baseUrl}/books/new`, { headers: { cookie: authCookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    const optionCount = (html.match(/<option value=/g) ?? []).length;
    assert.equal(optionCount, listAuthors().length);
    assert.match(html, /Jane Austen/);
  });

  // --- spdd-verify: targeted tests for uncovered Safeguards scenarios ---

  test("negative pageSize responds 400 without rendering the listing", async () => {
    const res = await fetch(`${baseUrl}/authors?pageSize=-10`);
    assert.equal(res.status, 400);
    const html = await res.text();
    assert.match(html, /enteros positivos/);
    assert.doesNotMatch(html, /<table/);
    assert.doesNotMatch(html, /Página \d+ de \d+/);
  });

  test("total divides exactly by pageSize: last full page shows 'Página N de N' with no next link", async () => {
    // Pad the accumulated total (26) up to an exact multiple of 10 (30).
    for (let i = 0; i < 4; i++) {
      addAuthor({ id: `exact-w-${i}`, name: `Exact W ${i}` });
    }
    assert.equal(listAuthors().length % 10, 0, "pad guard: total must divide exactly by 10");
    const totalPages = Math.ceil(listAuthors().length / 10);

    const res = await fetch(`${baseUrl}/authors?page=${totalPages}&pageSize=10`);
    assert.equal(res.status, 200);
    const html = await res.text();
    // totalPages must be exactly N (not N+1): no off-by-one extra page.
    assert.match(html, new RegExp(`Página ${totalPages} de ${totalPages}`));
    assert.doesNotMatch(html, /Siguiente/);
    assert.match(html, /Anterior/);
    // The very last author is on this page; the first author of the previous page is not.
    assert.match(html, />Exact W 3</);
    assert.doesNotMatch(html, />Autor 18</);
  });

  test("pageSize=100 upper bound with more than 100 authors: first 100 on 'Página 1 de 2'", async () => {
    for (let i = 0; i < 150; i++) {
      addAuthor({ id: `bulk-${String(i).padStart(3, "0")}`, name: `Bulk ${i}` });
    }
    assert.equal(listAuthors().length, 180, "pad guard: 30 previous + 150 bulk authors");

    const res = await fetch(`${baseUrl}/authors?pageSize=100`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Página 1 de 2/);
    // Exactly the first 100 authors are rendered: index 99 is the last item…
    assert.match(html, />Bulk 69</);
    // …and index 100 (the first author of page 2) must not appear.
    assert.doesNotMatch(html, />Bulk 70</);
    assert.match(html, /Siguiente/);
    assert.match(html, /href="\/authors\?page=2&pageSize=100"/);
  });
});

describe("Protección de alta de libros", () => {
  test("protect-book-mutation-2: GET /books/new sin sesión redirige al login y no muestra el formulario", async () => {
    const res = await fetch(`${baseUrl}/books/new`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/login?next=/books/new");
    const html = await res.text();
    assert.doesNotMatch(html, /<select/);
    assert.doesNotMatch(html, /<option/);
    assert.doesNotMatch(html, /<form/);
  });

  test("protect-book-mutation-4: POST /books sin sesión redirige y no crea el libro", async () => {
    const author = addAuthor({ id: "unauth-author-1", name: "Autor para redirigido" });
    const before = listBooks().length;
    const res = await fetch(`${baseUrl}/books`, {
      method: "POST",
      body: new URLSearchParams({ title: "Libro no autorizado", authorId: author.id }),
      redirect: "manual",
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/login?next=/books/new");
    assert.equal(listBooks().length, before);
  });

  test("protect-book-mutation-5: GET /books y GET /authors siguen siendo públicos", async () => {
    const booksRes = await fetch(`${baseUrl}/books`);
    assert.equal(booksRes.status, 200);
    const authorsRes = await fetch(`${baseUrl}/authors`);
    assert.equal(authorsRes.status, 200);
  });

  test("protect-book-mutation-6: DELETE /books responde 405 y ruta inexistente responde 404 sin sesión", async () => {
    const deleteRes = await fetch(`${baseUrl}/books`, { method: "DELETE" });
    assert.equal(deleteRes.status, 405);
    const notFoundRes = await fetch(`${baseUrl}/ruta-inexistente`);
    assert.equal(notFoundRes.status, 404);
  });
});
