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

/** Fila del listado: el título del libro y el nombre ya resuelto de su autor. */
export interface BookListRow {
  title: string;
  authorName: string;
}

/** Envelope de página listo para renderizar. */
export interface BookListPage {
  rows: BookListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Renders the paginated book listing. Pure function: takes the view-model and
 * returns an HTML string. All titles and author names are HTML-escaped.
 *
 * - Empty repository (total 0) → message instead of a table, no navigation.
 * - Page beyond the last → empty table (no rows), no next link.
 */
export function renderBookList(page: BookListPage): string {
  if (page.total === 0) {
    const body = `
    <h1>Libros</h1>
    <p>No hay libros todavía.</p>
    <p><a href="/books/new">Insertar nuevo libro</a></p>
  `;
    return layout("Libros", body);
  }

  const rowsHtml =
    page.rows.length > 0
      ? page.rows
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.authorName)}</td></tr>`
          )
          .join("\n")
      : "";

  const prevLink =
    page.page > 1
      ? `<a href="/books?page=${page.page - 1}&pageSize=${page.pageSize}">Anterior</a>`
      : "";
  const nextLink =
    page.page < page.totalPages
      ? `<a href="/books?page=${page.page + 1}&pageSize=${page.pageSize}">Siguiente</a>`
      : "";
  const navHtml =
    prevLink || nextLink
      ? `<p>${prevLink}${prevLink && nextLink ? " · " : ""}${nextLink}</p>`
      : "";

  const body = `
    <h1>Libros</h1>
    <p>Página ${page.page} de ${page.totalPages}</p>
    <table border="1" cellpadding="4">
      <thead><tr><th>Título</th><th>Autor</th></tr></thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    ${navHtml}
    <p><a href="/books/new">Insertar nuevo libro</a></p>
  `;

  return layout("Libros", body);
}

/** Renders the `400` error page for invalid pagination params. */
export function renderBookListError(message: string): string {
  const body = `
    <h1>Libros</h1>
    <p style="color: red;">${escapeHtml(message)}</p>
    <p><a href="/books">Volver al listado de libros</a></p>
  `;
  return layout("Libros", body);
}
