import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { server } from "./server";
import { addAuthor } from "../domain/author";

/**
 * Caché condicional HTTP (ETag) en los listados públicos — sub-spec
 * 01-conditional_get.feature. Un test por escenario, filas de la tabla de
 * ejemplos como casos dentro del test.
 *
 * El estado del repositorio es module-level (arrays en el dominio) y este
 * archivo corre en su propio proceso (igual que los demás tests web), así
 * que el orden de declaración fija los givens: conditional_get-02 corre con
 * el repositorio vacío, la siembra se hace después vía el dominio y el alta
 * real de "Dune" del escenario conditional_get-05 deja el repositorio exacto
 * (2 autores "Ana" y "Beto" + 1 libro "Dune" de "Ana") que piden los
 * escenarios conditional_get-01/03/04.
 */

let baseUrl: string;

const ANA_ID = "conditional-get-ana";
const BETO_ID = "conditional-get-beto";

/** Validador fuerte: entre comillas dobles, hexadecimal, sin prefijo W/. */
const STRONG_ETAG_PATTERN = /^"[0-9a-f]+"$/;

async function librarianCookie(): Promise<string> {
  const res = await fetch(`${baseUrl}/login`, {
    method: "POST",
    body: new URLSearchParams({ username: "bibliotecario", password: "biblioteca123" }),
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
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

// --- Estado: repositorio vacío (0 autores, 0 libros) ---

describe("conditional_get-02 — repositorio vacío", () => {
  test("conditional_get-02: los listados vacíos llevan ETag y Cache-Control", async () => {
    const rows: Array<{ route: string; emptyText: RegExp }> = [
      { route: "/books", emptyText: /No hay libros todavía\./ },
      { route: "/authors", emptyText: /No hay autores todavía\./ },
    ];
    for (const { route, emptyText } of rows) {
      const res = await fetch(`${baseUrl}${route}`);
      assert.equal(res.status, 200, route);
      assert.match(await res.text(), emptyText, route);

      const etag = res.headers.get("etag");
      assert.ok(etag, `${route} debe llevar un header ETag`);
      assert.match(etag, STRONG_ETAG_PATTERN, route);
      assert.equal(res.headers.get("cache-control"), "no-cache", route);
    }
  });
});

// --- Estado: 1 autor ("Ana"), 0 libros ---

describe("conditional_get-06 y conditional_get-05 — con 1 autor (Ana)", () => {
  before(() => {
    addAuthor({ id: ANA_ID, name: "Ana" });
  });

  test("conditional_get-06: If-None-Match: * revalida a 304 con el ETag vigente", async () => {
    for (const route of ["/books", "/authors"]) {
      const currentRes = await fetch(`${baseUrl}${route}`);
      const currentEtag = currentRes.headers.get("etag");
      assert.ok(currentEtag, `${route} debe llevar un header ETag`);

      const res = await fetch(`${baseUrl}${route}`, {
        headers: { "if-none-match": "*" },
      });
      assert.equal(res.status, 304, route);
      assert.equal(await res.text(), "", `${route}: el 304 no lleva cuerpo`);
      assert.equal(res.headers.get("etag"), currentEtag, route);
      assert.equal(res.headers.get("cache-control"), "no-cache", route);
    }
  });

  test("conditional_get-05: insertar un libro desde la UI invalida el ETag de GET /books", async () => {
    const firstRes = await fetch(`${baseUrl}/books`);
    const savedEtag = firstRes.headers.get("etag");
    assert.ok(savedEtag, "el primer GET /books debe llevar un header ETag");

    const cookie = await librarianCookie();
    const createRes = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { cookie },
      body: new URLSearchParams({ title: "Dune", authorId: ANA_ID }),
      redirect: "manual",
    });
    assert.equal(createRes.status, 302);

    const revalidateRes = await fetch(`${baseUrl}/books`, {
      headers: { "if-none-match": savedEtag },
    });
    assert.equal(revalidateRes.status, 200);
    assert.match(await revalidateRes.text(), /Dune/);
    const newEtag = revalidateRes.headers.get("etag");
    assert.ok(newEtag);
    assert.notEqual(newEtag, savedEtag, "el ETag debe cambiar tras insertar el libro");
  });

  test("conditional_get-08: un 400 de /authors ignora las cabeceras condicionales", async () => {
    const res = await fetch(`${baseUrl}/authors?page=abc`, {
      headers: { "if-none-match": '"lo-que-sea"' },
    });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /enteros positivos/);
    assert.equal(res.headers.get("etag"), null, "un 400 no lleva header ETag");
  });
});

// --- Estado: 2 autores ("Ana" y "Beto") + 1 libro ("Dune" de "Ana"),
//     resultado del alta real del escenario conditional_get-05 ---

describe("conditional_get-01, 03 y 04 — con 2 autores y 1 libro", () => {
  before(() => {
    addAuthor({ id: BETO_ID, name: "Beto" });
  });

  test("conditional_get-01: los 200 de los listados públicos llevan ETag fuerte y Cache-Control", async () => {
    const rows: Array<{ route: string; content: RegExp }> = [
      { route: "/books", content: /Dune/ },
      { route: "/authors", content: /Ana/ },
      { route: "/authors?page=2&pageSize=1", content: /Beto/ },
    ];
    for (const { route, content } of rows) {
      const res = await fetch(`${baseUrl}${route}`);
      assert.equal(res.status, 200, route);
      const html = await res.text();
      assert.match(html, content, route);
      assert.match(html, /<h1>/, route);

      const etag = res.headers.get("etag");
      assert.ok(etag, `${route} debe llevar un header ETag`);
      assert.match(etag, STRONG_ETAG_PATTERN, route);
      assert.doesNotMatch(etag, /^W\//, `${route}: validador fuerte, sin prefijo W/`);
      assert.equal(res.headers.get("cache-control"), "no-cache", route);
      assert.match(
        res.headers.get("content-type") ?? "",
        /^text\/html; charset=utf-8$/,
        route
      );

      const repeatRes = await fetch(`${baseUrl}${route}`);
      assert.equal(
        repeatRes.headers.get("etag"),
        etag,
        `${route}: repetir la misma petición devuelve el mismo ETag`
      );
    }
  });

  test("conditional_get-03: If-None-Match coincidente responde 304 con cuerpo vacío", async () => {
    for (const route of ["/books", "/authors"]) {
      const firstRes = await fetch(`${baseUrl}${route}`);
      const firstEtag = firstRes.headers.get("etag");
      assert.ok(firstEtag, `${route} debe llevar un header ETag`);

      const revalidateRes = await fetch(`${baseUrl}${route}`, {
        headers: { "if-none-match": firstEtag },
      });
      assert.equal(revalidateRes.status, 304, route);
      assert.equal(await revalidateRes.text(), "", `${route}: el 304 no lleva cuerpo`);
      assert.equal(revalidateRes.headers.get("etag"), firstEtag, route);
      assert.equal(revalidateRes.headers.get("cache-control"), "no-cache", route);
    }
  });

  test("conditional_get-04: If-None-Match ausente, basura o de otro recurso responde 200 completo", async () => {
    const booksCurrent = await fetch(`${baseUrl}/books`);
    const booksEtag = booksCurrent.headers.get("etag") as string;
    const booksBody = await booksCurrent.text();
    const authorsCurrent = await fetch(`${baseUrl}/authors`);
    const authorsEtag = authorsCurrent.headers.get("etag") as string;
    const authorsBody = await authorsCurrent.text();
    assert.notEqual(booksEtag, authorsEtag, "recursos distintos tienen ETags distintos");

    const rows: Array<{
      route: string;
      ifNoneMatch: string | null;
      expectedEtag: string;
      expectedBody: string;
    }> = [
      { route: "/books", ifNoneMatch: null, expectedEtag: booksEtag, expectedBody: booksBody },
      {
        route: "/books",
        ifNoneMatch: '"no-existe"',
        expectedEtag: booksEtag,
        expectedBody: booksBody,
      },
      {
        route: "/authors",
        ifNoneMatch: booksEtag,
        expectedEtag: authorsEtag,
        expectedBody: authorsBody,
      },
    ];
    for (const { route, ifNoneMatch, expectedEtag, expectedBody } of rows) {
      const res = await fetch(`${baseUrl}${route}`, {
        headers: ifNoneMatch === null ? {} : { "if-none-match": ifNoneMatch },
      });
      assert.equal(res.status, 200, `${route} con If-None-Match: ${String(ifNoneMatch)}`);
      assert.equal(await res.text(), expectedBody, `${route}: cuerpo completo`);
      assert.equal(res.headers.get("etag"), expectedEtag, `${route}: ETag vigente`);
    }
  });
});

// --- Endpoints excluidos de la caché condicional ---

describe("conditional_get-07 — formulario protegido excluido", () => {
  test("conditional_get-07: GET /books/new no participa en la caché condicional", async () => {
    const cookie = await librarianCookie();
    const res = await fetch(`${baseUrl}/books/new`, {
      headers: { cookie, "if-none-match": '"lo-que-sea"' },
    });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<select/);
    assert.equal(res.headers.get("etag"), null);
  });
});
