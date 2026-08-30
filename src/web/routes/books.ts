import { IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";
import { addBook, listBooks } from "../../domain/book";
import { getAuthor, listAuthors } from "../../domain/author";
import { BookListRow, renderBookForm, renderBookList } from "../views/bookForm";

function sendHtml(res: ServerResponse, statusCode: number, html: string): void {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

/** GET /books/new — muestra el formulario con el <select> de autores existentes. */
export function handleNewBookForm(_req: IncomingMessage, res: ServerResponse): void {
  const authors = listAuthors();
  sendHtml(res, 200, renderBookForm(authors));
}

/** GET /books — lista todos los libros existentes (título + nombre de autor). */
export function handleListBooks(_req: IncomingMessage, res: ServerResponse): void {
  const rows: BookListRow[] = listBooks().map((book) => ({
    book,
    authorName: getAuthor(book.authorId)?.name ?? "Autor desconocido",
  }));
  sendHtml(res, 200, renderBookList(rows));
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
