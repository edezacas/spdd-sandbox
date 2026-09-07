import { IncomingMessage, ServerResponse } from "http";
import { listAuthorsPage } from "../../domain/author";
import { renderAuthorList, renderAuthorListError } from "../views/authorList";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function sendHtml(res: ServerResponse, statusCode: number, html: string): void {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

/**
 * GET /authors — paginated HTML listing of authors in insertion order.
 * Both params are optional: `page` (1-based, default 1) and `pageSize`
 * (default 10, max 100). Invalid values (non-numeric, non-integer, 0,
 * negative, or a `pageSize` above 100) → 400 with an HTML error message,
 * without rendering the listing. A page beyond the last one → 200 with an
 * empty page.
 *
 * Validation of external input lives here in the web layer (precedent:
 * `authorId` validation in `src/web/routes/books.ts`); the domain query
 * enforces its own numeric contract by throwing as a backstop.
 */
export function handleListAuthors(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pagination = readPagination(url.searchParams);

  if (pagination === null) {
    sendHtml(
      res,
      400,
      renderAuthorListError(
        "Los parámetros page y pageSize deben ser enteros positivos (pageSize máximo 100)."
      )
    );
    return;
  }

  const page = listAuthorsPage(pagination.page, pagination.pageSize);
  sendHtml(res, 200, renderAuthorList(page));
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