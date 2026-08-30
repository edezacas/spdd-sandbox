import * as http from "http";
import { handleCreateBook, handleListBooks, handleNewBookForm } from "./routes/books";

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

  void (async () => {
    try {
      if (url === "/books/new" && method === "GET") {
        handleNewBookForm(req, res);
        return;
      }

      if (url === "/books" && method === "GET") {
        handleListBooks(req, res);
        return;
      }

      if (url === "/books" && method === "POST") {
        const body = await collectBody(req);
        handleCreateBook(body, res);
        return;
      }

      if (url === "/books" || url === "/books/new") {
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
