import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  BookListPage,
  BookListRow,
  renderBookList,
  renderBookListError,
} from "./views/bookList";

// `renderBookList` is a PURE function: it takes a hand-built view-model (no
// domain import, no module-level state) and returns an HTML string. These tests
// mirror `src/web/views/authorList.ts`'s markup and the plan's Task 2
// acceptance criteria (spec 12-15 plus D1, 10, 13, 14).

function page(overrides: Partial<BookListPage> = {}): BookListPage {
  return {
    rows: [],
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
    ...overrides,
  };
}

function row(title: string, authorName: string): BookListRow {
  return { title, authorName };
}

describe("renderBookList with an empty catalog (total 0, D1)", () => {
  test("renders the heading, the empty message and the /books/new link", () => {
    const html = renderBookList(page());
    assert.match(html, /<h1>Libros<\/h1>/);
    assert.ok(html.includes("No hay libros todavía."));
    assert.ok(html.includes('href="/books/new"'));
    assert.ok(html.includes("Insertar nuevo libro"));
  });

  test("renders NO table, NO pager and NO navigation", () => {
    const html = renderBookList(page());
    assert.ok(!html.includes("<table"), "empty catalog must not render a <table>");
    assert.ok(!html.includes("Página"), "empty catalog must not render a pager");
    assert.ok(!html.includes("Anterior"), "empty catalog must not render a prev link");
    assert.ok(!html.includes("Siguiente"), "empty catalog must not render a next link");
    assert.ok(!html.includes(" · "), "empty catalog must not separate navigation links");
  });
});

describe("renderBookList with rows", () => {
  test("renders the pager and a Título/Autor table", () => {
    const html = renderBookList(
      page({ rows: [row("El Quijote", "Cervantes")], total: 1, totalPages: 1 })
    );
    assert.match(html, /<h1>Libros<\/h1>/);
    assert.ok(html.includes("Página 1 de 1"));
    assert.ok(html.includes("<table"));
    assert.ok(html.includes("<th>Título</th>"));
    assert.ok(html.includes("<th>Autor</th>"));
    assert.ok(html.includes("El Quijote"));
    assert.ok(html.includes("Cervantes"));
  });

  test("HTML-escapes every title and author name", () => {
    const html = renderBookList(
      page({
        rows: [row("Tom & Jerry <script>", 'Ana & <Luis> "la jefa"')],
        total: 1,
        totalPages: 1,
      })
    );
    assert.ok(html.includes("Tom &amp; Jerry &lt;script&gt;"));
    assert.ok(html.includes("Ana &amp; &lt;Luis&gt; &quot;la jefa&quot;"));
    assert.ok(!html.includes("<script>"), "raw <script> must not survive escaping");
    assert.ok(!html.includes("Tom & Jerry"), "raw & must not survive escaping");
  });

  test("renders the literal placeholder 'Autor desconocido' when that is the passed name", () => {
    const html = renderBookList(
      page({ rows: [row("Sin autor", "Autor desconocido")], total: 1, totalPages: 1 })
    );
    assert.ok(html.includes("Autor desconocido"));
  });
});

describe("renderBookList navigation rules", () => {
  test("page 1 of 3: next link only, explicit pageSize in the href", () => {
    const html = renderBookList(
      page({ rows: [row("A", "B")], page: 1, pageSize: 10, total: 25, totalPages: 3 })
    );
    assert.ok(!html.includes("Anterior"), "no prev link on the first page");
    assert.ok(html.includes('href="/books?page=2&pageSize=10"'));
    assert.ok(html.includes("Siguiente"));
  });

  test("last page: prev link only", () => {
    const html = renderBookList(
      page({ rows: [row("A", "B")], page: 3, pageSize: 10, total: 25, totalPages: 3 })
    );
    assert.ok(!html.includes("Siguiente"), "no next link on the last page");
    assert.ok(html.includes('href="/books?page=2&pageSize=10"'));
    assert.ok(html.includes("Anterior"));
  });

  test("middle page: both links exist and are separated by ' · '", () => {
    const html = renderBookList(
      page({ rows: [row("A", "B")], page: 2, pageSize: 10, total: 25, totalPages: 3 })
    );
    assert.ok(html.includes('href="/books?page=1&pageSize=10"'), "prev href");
    assert.ok(html.includes('href="/books?page=3&pageSize=10"'), "next href");
    assert.ok(html.includes("Anterior"));
    assert.ok(html.includes("Siguiente"));
    assert.ok(html.includes(" · "), "both links must be separated by ' · '");
    assert.ok(html.indexOf("Anterior") < html.indexOf("Siguiente"));
  });

  test("single page: neither link exists and there is no navigation separator", () => {
    const html = renderBookList(
      page({ rows: [row("A", "B")], page: 1, pageSize: 10, total: 1, totalPages: 1 })
    );
    assert.ok(!html.includes("Anterior"));
    assert.ok(!html.includes("Siguiente"));
    assert.ok(!html.includes(" · "));
  });
});

describe("renderBookList on a page beyond the last", () => {
  test("renders the heading and pager, an empty tbody, and no next link", () => {
    const html = renderBookList(
      page({ rows: [], page: 99, pageSize: 10, total: 25, totalPages: 3 })
    );
    assert.match(html, /<h1>Libros<\/h1>/);
    assert.ok(html.includes("Página 99 de 3"), "pager stays truthful");
    assert.ok(html.includes("<table"));
    assert.ok(html.includes("<th>Título</th>"));
    assert.ok(html.includes("<th>Autor</th>"));
    assert.match(html, /<tbody>\s*<\/tbody>/, "tbody must be empty");
    assert.ok(!html.includes("Siguiente"), "no next link past the last page");
    assert.ok(html.includes("Anterior"), "prev link is still valid past the last page");
  });
});

describe("renderBookListError", () => {
  test("renders the heading, a red HTML-escaped message and a back link", () => {
    const html = renderBookListError('Error <b> & "pagina" inválida');
    assert.match(html, /<h1>Libros<\/h1>/);
    assert.ok(html.includes('style="color: red;"'));
    assert.ok(html.includes("Error &lt;b&gt; &amp; &quot;pagina&quot; inválida"));
    assert.ok(!html.includes("<b>"), "raw <b> must not survive escaping");
    assert.ok(html.includes('href="/books"'), "error page links back to /books");
  });

  test("renders the spec's pagination error message verbatim", () => {
    const message =
      "Los parámetros page y pageSize deben ser enteros positivos (pageSize máximo 100).";
    const html = renderBookListError(message);
    assert.ok(html.includes(message));
    assert.ok(!html.includes("<table"), "the error page has no table");
  });
});
