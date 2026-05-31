import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");
const port = Number.parseInt(process.env.SITE_PORT || "4173", 10);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const requested = decoded === "/" ? "/index.html" : decoded;
  const fullPath = path.resolve(root, "." + requested);
  if (fullPath !== root && !fullPath.startsWith(root + path.sep)) return null;
  return fullPath;
}

const server = http.createServer((req, res) => {
  const fullPath = safePath(req.url || "/");
  if (!fullPath || !existsSync(fullPath) || !statSync(fullPath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": mime[path.extname(fullPath).toLowerCase()] || "application/octet-stream"
  });
  createReadStream(fullPath).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Gemini UI Bridge site: http://127.0.0.1:${port}`);
});
