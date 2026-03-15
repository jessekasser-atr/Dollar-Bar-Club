import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "public");
const indexPath = join(root, "index.html");

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const html = readFileSync(indexPath, "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.url === "/app.js") {
    const file = join(root, "app.js");
    if (!existsSync(file)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
    res.end(readFileSync(file, "utf8"));
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

const port = Number(process.env.WEB_PORT || 5173);
server.listen(port, () => {
  console.log(`DBC web listening on http://localhost:${port}`);
});
