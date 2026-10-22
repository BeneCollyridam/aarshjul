// Development server only. Production is plain files on GitHub Pages.
import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".ttf": "font/ttf", ".typ": "text/plain; charset=utf-8", ".pdf": "application/pdf" };

export function createStaticServer(prefix = "/") {
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      if (!pathname.startsWith(prefix)) throw new Error("Not found");
      const relative = pathname.slice(prefix.length) || "index.html";
      if (relative.split("/").some(part => part.startsWith("."))) throw new Error("Not found");
      const path = await realpath(resolve(root, relative));
      if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error("Not found");
      const content = await readFile(path);
      response.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-store" });
      response.end(content);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Not found");
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  createStaticServer().listen(port, "127.0.0.1", () => console.log(`Årshjul: http://127.0.0.1:${port}`));
}
