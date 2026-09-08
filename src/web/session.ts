import { IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "node:crypto";

export interface Session {
  id: string; // token opaco, no adivinable
  userId: string; // User.id
  createdAt: Date;
}

// Almacén en memoria a nivel de módulo, misma postura "sin persistencia" que
// authors/books/loans: las sesiones viven hasta un POST /logout o hasta que
// el proceso se reinicia. Sin expiración/TTL (fuera de alcance).
const sessions: Session[] = [];

// El nombre exacto de la cookie es un detalle de implementación: ningún
// escenario depende de su valor literal, solo de su presencia/validez.
export const SESSION_COOKIE_NAME = "biblioteca_session";

export function createSession(userId: string): Session {
  const session: Session = { id: randomUUID(), userId, createdAt: new Date() };
  sessions.push(session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.find((session) => session.id === id);
}

export function deleteSession(id: string): void {
  const index = sessions.findIndex((session) => session.id === id);
  if (index !== -1) {
    sessions.splice(index, 1);
  }
}

/**
 * Resuelve la sesión de la petición a partir de la cookie. Una cookie
 * ausente, alterada o con un valor irreconocible es siempre "no
 * autenticado": devuelve undefined, nunca lanza.
 */
export function getSessionFromRequest(req: IncomingMessage): Session | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (name === SESSION_COOKIE_NAME && value !== "") {
      return getSession(value);
    }
  }
  return undefined;
}

/** Valor del header Set-Cookie que establece la cookie de sesión. */
export function sessionCookieHeader(sessionId: string): string {
  return `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Path=/`;
}

/** Valor del header Set-Cookie que expira/limpia la cookie de sesión. */
export function clearedSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0`;
}
