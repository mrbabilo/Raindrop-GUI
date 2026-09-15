// Serveur de simulation cible pour le link checker (tests réseau 127.0.0.1).
// Contenu verbatim du plan (Task 12, Step 1).

import { createServer, type Server } from "node:http";

// Routes : /ok /moved (301→/final) /temp (302→/final) /chain (301→/moved)
// /notfound 404 /gone 410 /forbidden 403 /unauth 401 /rate-limit 429
// /method 405-HEAD-mais-GET-ok /server-error 500 /slow (délai 500 ms)
// /loop (301 vers lui-même) /redirect-to-404 (301→/notfound)
export async function startTargetServer(): Promise<{ port: number; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const finish = (code: number, body = "") => {
      res.writeHead(code, { "Content-Type": "text/plain" });
      res.end(body);
    };
    if (req.method === "HEAD" && path === "/method") {
      res.writeHead(405);
      res.end();
      return;
    }
    switch (path) {
      case "/ok": return finish(200, "ok");
      case "/final": return finish(200, "final");
      case "/moved": { res.writeHead(301, { Location: "/final" }); return res.end(); }
      case "/temp": { res.writeHead(302, { Location: "/final" }); return res.end(); }
      case "/chain": { res.writeHead(301, { Location: "/moved" }); return res.end(); }
      case "/notfound": return finish(404);
      case "/gone": return finish(410);
      case "/forbidden": return finish(403);
      case "/unauth": return finish(401);
      case "/rate-limit": return finish(429);
      case "/method": return finish(200, "get ok");
      case "/server-error": return finish(500);
      case "/slow": return setTimeout(() => finish(200), 500);
      case "/loop": { res.writeHead(301, { Location: "/loop" }); return res.end(); }
      case "/redirect-to-404": { res.writeHead(301, { Location: "/notfound" }); return res.end(); }
      default: return finish(404);
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("adresse serveur inattendue");
  return {
    port: addr.port,
    close: () => new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r()))),
  };
}
