import * as http from "http";
import { handleCreateBook, handleListBooks, handleNewBookForm } from "./routes/books";
import { handleListAuthors } from "./routes/authors";

const PORT = 3000;

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
        handleNewBookForm(req, res);
        return;
      }

      if (pathname === "/books" && method === "GET") {
        handleListBooks(req, res);
        return;
      }

      if (pathname === "/books" && method === "POST") {
        const body = await collectBody(req);
        handleCreateBook(body, res);
        return;
      }

      if (pathname === "/authors" && method === "GET") {
        handleListAuthors(req, res);
        return;
      }

      if (pathname === "/books" || pathname === "/books/new" || pathname === "/authors") {
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
