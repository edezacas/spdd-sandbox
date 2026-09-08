import { IncomingMessage, ServerResponse } from "http";
import { getUserByUsername, verifyPassword } from "../../domain/user";
import {
  clearedSessionCookieHeader,
  createSession,
  deleteSession,
  getSessionFromRequest,
  sessionCookieHeader,
} from "../session";
import { renderLoginForm } from "../views/loginForm";

const LOGIN_PATH = "/login";
const DEFAULT_REDIRECT = "/books/new";

// Mensaje idéntico para usuario inexistente y contraseña errónea (sin
// enumeración de usuarios, invariante del sub-spec 2).
const WRONG_CREDENTIALS_MESSAGE = "Usuario o contraseña incorrectos.";
const EMPTY_FIELDS_MESSAGE = "El usuario y la contraseña no pueden estar vacíos.";

function sendHtml(res: ServerResponse, statusCode: number, html: string): void {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

/** GET /login — muestra el formulario; si ya hay sesión válida, 302 a /books/new. */
export function handleLoginForm(req: IncomingMessage, res: ServerResponse): void {
  if (getSessionFromRequest(req)) {
    res.writeHead(302, { Location: DEFAULT_REDIRECT });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  sendHtml(res, 200, renderLoginForm(undefined, url.searchParams.get("next") ?? undefined));
}

/**
 * POST /login — campos vacíos → 400 con el formulario re-renderizado;
 * credenciales incorrectas → 401 con el formulario y mensaje genérico, sin
 * cookie; credenciales correctas → crea la sesión, establece la cookie y
 * redirige a `next` si es un path same-origin, si no a /books/new.
 */
export function handleLoginSubmit(body: string, res: ServerResponse): void {
  const params = new URLSearchParams(body);
  const username = (params.get("username") ?? "").trim();
  const password = (params.get("password") ?? "").trim();
  const next = params.get("next");

  if (username === "" || password === "") {
    sendHtml(res, 400, renderLoginForm(EMPTY_FIELDS_MESSAGE, next ?? undefined));
    return;
  }

  const user = getUserByUsername(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    sendHtml(res, 401, renderLoginForm(WRONG_CREDENTIALS_MESSAGE, next ?? undefined));
    return;
  }

  const session = createSession(user.id);
  res.writeHead(302, {
    Location: safeRedirectTarget(next),
    "Set-Cookie": sessionCookieHeader(session.id),
  });
  res.end();
}

/**
 * POST /logout — invalida la sesión actual si existe (no-op seguro si no hay
 * cookie o ya es inválida) y expira la cookie en la respuesta. Siempre
 * 302 a /login.
 */
export function handleLogout(req: IncomingMessage, res: ServerResponse): void {
  const session = getSessionFromRequest(req);
  if (session) {
    deleteSession(session.id);
  }
  res.writeHead(302, { Location: LOGIN_PATH, "Set-Cookie": clearedSessionCookieHeader() });
  res.end();
}

/**
 * Solo se honra un path same-origin: empieza por "/" y no es "//host"
 * (protocol-relative, que el navegador trata como URL absoluta). Se descartan
 * además los caracteres de control: writeHead los rechazaría
 * (ERR_INVALID_CHAR) y convertirían un input alterado en un 500.
 */
function safeRedirectTarget(next: string | null): string {
  const isSafePath =
    next !== null &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !/[\x00-\x1f\x7f]/.test(next);
  return isSafePath ? next : DEFAULT_REDIRECT;
}
