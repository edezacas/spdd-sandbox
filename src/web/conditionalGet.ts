import { IncomingMessage, ServerResponse } from "http";
import { createHash } from "node:crypto";

/**
 * ETag fuerte (RFC 7232) para un cuerpo de respuesta exacto: digest
 * hexadecimal SHA-256 entre comillas dobles. Función pura del cuerpo:
 * mismo cuerpo → mismo ETag (determinista entre peticiones y entre
 * reinicios del proceso); cuerpo distinto → ETag distinto (la
 * invalidación es automática por contenido, sin TTL ni estado que
 * dependa del tiempo).
 */
function strongEtag(body: string): string {
  return `"${createHash("sha256").update(body, "utf8").digest("hex")}"`;
}

/**
 * Envía `html` aplicando la semántica de caché condicional HTTP,
 * compartida por los dos listados públicos (GET /books y GET /authors):
 * la lógica vive aquí una única vez, no se duplica por handler.
 *
 * - Todo 200 lleva `ETag: "<hex>"` (validador fuerte) y
 *   `Cache-Control: no-cache` (revalidar en cada uso).
 * - `If-None-Match` igual al ETag vigente (coincidencia exacta, comillas
 *   incluidas) o `*` → `304` con cuerpo vacío y los mismos headers ETag y
 *   Cache-Control que el 200 correspondiente.
 * - Cualquier otro valor (ausente, basura, ETag de otro recurso, listas) →
 *   `200` completo con el ETag vigente: siempre una respuesta segura.
 */
export function sendHtmlWithConditionalGet(
  req: IncomingMessage,
  res: ServerResponse,
  html: string
): void {
  const etag = strongEtag(html);
  const ifNoneMatch = req.headers["if-none-match"];

  if (ifNoneMatch === etag || ifNoneMatch === "*") {
    res.writeHead(304, { ETag: etag, "Cache-Control": "no-cache" });
    res.end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    ETag: etag,
    "Cache-Control": "no-cache",
  });
  res.end(html);
}
