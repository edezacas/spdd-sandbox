import { Author } from "../../domain/author";
import { Book } from "../../domain/book";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Genera el HTML del formulario para insertar un libro nuevo.
 * Si no hay autores, muestra un aviso en vez del <select> (fuera de alcance
 * crear autores desde aquí, ver canvas.md).
 */
export function renderBookForm(authors: Author[], errorMessage?: string): string {
  const errorHtml = errorMessage
    ? `<p style="color: red;">${escapeHtml(errorMessage)}</p>`
    : "";

  const authorFieldHtml =
    authors.length > 0
      ? `<label>Autor:
          <select name="authorId">
            ${authors
              .map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`)
              .join("\n")}
          </select>
        </label>`
      : `<p>No hay autores disponibles todavía. Hace falta crear un autor antes de poder insertar un libro.</p>`;

  const body = `
    <h1>Insertar libro</h1>
    ${errorHtml}
    <form method="POST" action="/books">
      <p><label>Título: <input type="text" name="title"></label></p>
      <p>${authorFieldHtml}</p>
      <p><button type="submit">Guardar</button></p>
    </form>
    <p><a href="/books">Ver listado de libros</a></p>
  `;

  return layout("Insertar libro", body);
}

/** Fila del listado: el libro junto con el nombre ya resuelto de su autor. */
export interface BookListRow {
  book: Book;
  authorName: string;
}

/** Genera el HTML del listado de libros (título + autor). */
export function renderBookList(rows: BookListRow[]): string {
  const rowsHtml =
    rows.length > 0
      ? rows
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r.book.title)}</td><td>${escapeHtml(r.authorName)}</td></tr>`
          )
          .join("\n")
      : `<tr><td colspan="2">No hay libros todavía.</td></tr>`;

  const body = `
    <h1>Libros</h1>
    <table border="1" cellpadding="4">
      <thead><tr><th>Título</th><th>Autor</th></tr></thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    <p><a href="/books/new">Insertar nuevo libro</a></p>
  `;

  return layout("Libros", body);
}
