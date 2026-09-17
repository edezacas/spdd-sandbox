import { IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";
import { addBook, listBooksPage } from "../../domain/book";
import { getAuthor, listAuthors } from "../../domain/author";
import { renderBookForm } from "../views/bookForm";
import { BookListRow, renderBookList, renderBookListError } from "../views/bookList";
import { sendHtmlWithConditionalGet } from "../conditionalGet";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function sendHtml(res: ServerResponse, statusCode: number, html: string): void {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

/** GET /books/new — muestra el formulario con el <select> de autores existentes. */
export function handleNewBookForm(_req: IncomingMessage, res: ServerResponse): void {
  const authors = listAuthors();
  sendHtml(res, 200, renderBookForm(authors));
}

/**
 * GET /books — paginated HTML listing of books in insertion order.
 * Both params are optional: `page` (1-based, default 1) and `pageSize`
 * (default 10, max 100). Invalid values (non-numeric, non-integer, 0,
 * negative, or a `pageSize` above 100) → 400 with an HTML error message,
 * without rendering the listing. A page beyond the last one → 200 with an
 * empty page.
 */
export function handleListBooks(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pagination = readPagination(url.searchParams);

  if (pagination === null) {
    // El 400 de validación no participa en la caché condicional: sin ETag
    // ni manejo de If-None-Match.
    sendHtml(
      res,
      400,
      renderBookListError(
        "Los parámetros page y pageSize deben ser enteros positivos (pageSize máximo 100)."
      )
    );
    return;
  }

  const page = listBooksPage(pagination.page, pagination.pageSize);
  const rows: BookListRow[] = page.items.map((book) => ({
    title: book.title,
    authorName: getAuthor(book.authorId)?.name ?? "Autor desconocido",
  }));
  sendHtmlWithConditionalGet(
    req,
    res,
    renderBookList({ rows, page: page.page, pageSize: page.pageSize, total: page.total, totalPages: page.totalPages })
  );
}

/** Returns null when any present param is not a strict positive integer (or pageSize > 100). */
function readPagination(searchParams: URLSearchParams): { page: number; pageSize: number } | null {
  const page = readStrictPositiveInt(searchParams.get("page"), DEFAULT_PAGE);
  const pageSize = readStrictPositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE);

  if (page === null || pageSize === null || pageSize > MAX_PAGE_SIZE) {
    return null;
  }
  return { page, pageSize };
}

/** Returns the fallback when the param is absent, null when present but not a strict positive integer. */
function readStrictPositiveInt(raw: string | null, fallback: number): number | null {
  if (raw === null) return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (value < 1) return null;
  return value;
}

/**
 * POST /books — valida title y authorId, crea el libro vía addBook() con un
 * id generado por el servidor (crypto.randomUUID()), y redirige a /books.
 * En caso de validación fallida responde 400 y no crea el libro.
 */
export function handleCreateBook(body: string, res: ServerResponse): void {
  const params = new URLSearchParams(body);
  const title = (params.get("title") ?? "").trim();
  const authorId = (params.get("authorId") ?? "").trim();

  if (title === "") {
    sendHtml(res, 400, renderBookForm(listAuthors(), "El título no puede estar vacío."));
    return;
  }

  if (authorId === "" || !getAuthor(authorId)) {
    sendHtml(res, 400, renderBookForm(listAuthors(), "Debes seleccionar un autor válido."));
    return;
  }

  addBook({ id: randomUUID(), title, authorId });

  res.writeHead(302, { Location: "/books" });
  res.end();
}
