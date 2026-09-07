import { AuthorsPage } from "../../domain/author";

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
 * Renders the paginated author listing. Pure function: takes the domain page
 * envelope and returns an HTML string. All author names are HTML-escaped.
 *
 * - Empty repository (total 0) → message instead of a table, no navigation.
 * - Page beyond the last → empty table (no rows), no next link.
 */
export function renderAuthorList(page: AuthorsPage): string {
  if (page.total === 0) {
    const body = `
    <h1>Autores</h1>
    <p>No hay autores todavía.</p>
    <p><a href="/books">Ver listado de libros</a></p>
  `;
    return layout("Autores", body);
  }

  const rowsHtml =
    page.items.length > 0
      ? page.items.map((author) => `<tr><td>${escapeHtml(author.name)}</td></tr>`).join("\n")
      : "";

  const prevLink =
    page.page > 1
      ? `<a href="/authors?page=${page.page - 1}&pageSize=${page.pageSize}">Anterior</a>`
      : "";
  const nextLink =
    page.page < page.totalPages
      ? `<a href="/authors?page=${page.page + 1}&pageSize=${page.pageSize}">Siguiente</a>`
      : "";
  const navHtml =
    prevLink || nextLink
      ? `<p>${prevLink}${prevLink && nextLink ? " · " : ""}${nextLink}</p>`
      : "";

  const body = `
    <h1>Autores</h1>
    <p>Página ${page.page} de ${page.totalPages}</p>
    <table border="1" cellpadding="4">
      <thead><tr><th>Nombre</th></tr></thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    ${navHtml}
    <p><a href="/books">Ver listado de libros</a></p>
  `;

  return layout("Autores", body);
}

/** Renders the `400` error page for invalid pagination params. */
export function renderAuthorListError(message: string): string {
  const body = `
    <h1>Autores</h1>
    <p style="color: red;">${escapeHtml(message)}</p>
    <p><a href="/authors">Volver al listado de autores</a></p>
  `;
  return layout("Autores", body);
}