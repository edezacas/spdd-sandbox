import * as http from "http";
import { handleCreateBook, handleListBooks, handleNewBookForm } from "./routes/books";
import { handleListAuthors } from "./routes/authors";
import { handleLoginForm, handleLoginSubmit, handleLogout } from "./routes/auth";
import { seedLibrarianAccount } from "./seed";
import { getSessionFromRequest } from "./session";

const PORT = 3000;

// Siembra de la única cuenta de bibliotecario al arrancar el servidor
// (Background del sub-spec 2). A nivel de módulo para que también valga
// cuando el server se importa desde los tests.
seedLibrarianAccount();

function collectBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * Guard de sesión para rutas protegidas. Si no hay sesión válida responde
 * 302 a /login?next=<path> y retorna false, sin llegar al handler.
 */
function requireSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  nextPath: string
): boolean {
  if (getSessionFromRequest(req)) {
    return true;
  }
  res.writeHead(302, { Location: `/login?next=${nextPath}` });
  res.end();
  return false;
}

export const server = http.createServer((req, res) => {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";
  // Routes used to be matched against req.url for exact equality, which never
  // saw a query string. Split path from query so `/authors?page=2` still
  // matches `/authors` (the handler reads the query from req.url itself).
  const pathname = url.split("?")[0] || "/";

  void (async () => {
    try {
      if (pathname === "/books/new" && method === "GET") {
        if (!requireSession(req, res, "/books/new")) {
          return;
        }
        handleNewBookForm(req, res);
        return;
      }

      if (pathname === "/books" && method === "GET") {
        handleListBooks(req, res);
        return;
      }

      if (pathname === "/books" && method === "POST") {
        if (!requireSession(req, res, "/books/new")) {
          return;
        }
        const body = await collectBody(req);
        handleCreateBook(body, res);
        return;
      }

      if (pathname === "/authors" && method === "GET") {
        handleListAuthors(req, res);
        return;
      }

      if (pathname === "/login" && method === "GET") {
        handleLoginForm(req, res);
        return;
      }

      if (pathname === "/login" && method === "POST") {
        const body = await collectBody(req);
        handleLoginSubmit(body, res);
        return;
      }

      if (pathname === "/logout" && method === "POST") {
        handleLogout(req, res);
        return;
      }

      if (
        pathname === "/books" ||
        pathname === "/books/new" ||
        pathname === "/authors" ||
        pathname === "/login" ||
        pathname === "/logout"
      ) {
        res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Method Not Allowed");
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal Server Error");
    }
  })();
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}
