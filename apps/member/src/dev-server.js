import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "content-type": MIME_TYPES[".html"] });
    res.end(readFileSync(join(root, "index.html"), "utf8"));
    return;
  }

  const filePath = join(root, url);
  if (existsSync(filePath)) {
    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "content-type": mime });
    res.end(readFileSync(filePath));
    return;
  }

  // SPA fallback — serve index.html for unmatched routes
  res.writeHead(200, { "content-type": MIME_TYPES[".html"] });
  res.end(readFileSync(join(root, "index.html"), "utf8"));
});

const port = Number(process.env.MEMBER_PORT || 5174);
server.listen(port, () => {
  console.log(`DBC member app listening on http://localhost:${port}`);
});
