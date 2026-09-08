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
 * Genera el HTML del formulario de login, con mensaje de error inline opcional
 * (mismo patrón que el formulario de libros). Si la petición GET llegó con
 * `?next=`, se preserva como campo oculto para que el POST pueda honrarlo.
 */
export function renderLoginForm(errorMessage?: string, next?: string): string {
  const errorHtml = errorMessage
    ? `<p style="color: red;">${escapeHtml(errorMessage)}</p>`
    : "";

  const nextHtml = next
    ? `<input type="hidden" name="next" value="${escapeHtml(next)}">`
    : "";

  const body = `
    <h1>Iniciar sesión</h1>
    ${errorHtml}
    <form method="POST" action="/login">
      <p><label>Usuario: <input type="text" name="username"></label></p>
      <p><label>Contraseña: <input type="password" name="password"></label></p>
      ${nextHtml}
      <p><button type="submit">Entrar</button></p>
    </form>
  `;

  return layout("Iniciar sesión", body);
}
