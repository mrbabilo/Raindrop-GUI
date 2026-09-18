// Faux serveur Raindrop — un VRAI serveur HTTP local, pas un `fetch` mocké.
//
// Leçon de l'incident `unrestore` (§7) : un `fetch` mocké valide notre appel,
// jamais l'API d'en face — c'est ainsi qu'un endpoint inexistant a traversé
// l'implémentation ET la revue. Ici, une requête HTTP part réellement sur
// 127.0.0.1 et une vraie réponse (statut, en-têtes, JSON) revient.
//
// Extensible : une route s'ajoute comme un `if` de plus dans le handler,
// sans toucher au reste. `port` est déjà exposé pour les tasks à venir
// (ex. construire une URL de redirection vers un faux S3).

import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";

export interface FauxApi {
  port: number;
  close(): Promise<void>;
  /** La bibliothèque servie, triable et paginable. */
  items: { _id: number; created: string; lastUpdate: string; title: string }[];
  /** Combien de requêtes ont été reçues, par chemin. */
  appels: string[];
  /**
   * L'en-tête `Authorization` reçu à chaque requête, dans le même ordre que
   * `appels` (une entrée par requête, `""` si absent). Prouve la PRÉSENCE
   * du jeton attendu — `appels` ne prouve que son absence de l'URL.
   */
  authorizations: string[];
  /** Fait répondre 429 aux N prochaines requêtes de liste. */
  repondre429(n: number): void;
}

export async function startFauxApi(items: FauxApi["items"] = []): Promise<FauxApi> {
  let reste429 = 0;
  let portServi = 0;
  const appels: string[] = [];
  const authorizations: string[] = [];
  const etat = { items };
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    // Chemin ET query : un jeton égaré en paramètre d'URL (au lieu de
    // l'en-tête Authorization) doit apparaître ici, sinon le test qui
    // vérifie son absence ne peut jamais échouer — c'est exactement la
    // forme de l'incident `unrestore` reproduite un cran plus haut.
    appels.push(url.pathname + url.search);
    authorizations.push(req.headers.authorization ?? "");
    const json = (code: number, corps: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(corps));
    };
    if (url.pathname.startsWith("/rest/v1/raindrops/")) {
      if (reste429 > 0) {
        reste429--;
        return json(429, { error: "rate" });
      }
      const sort = url.searchParams.get("sort") ?? "created";
      const page = Number(url.searchParams.get("page") ?? 0);
      const perpage = Number(url.searchParams.get("perpage") ?? 50);
      const cle = sort.replace(/^-/, "") as "created" | "lastUpdate";
      const desc = sort.startsWith("-");
      const tries = [...etat.items].sort((a, b) =>
        desc ? b[cle].localeCompare(a[cle]) : a[cle].localeCompare(b[cle]),
      );
      return json(200, {
        count: etat.items.length,
        items: tries.slice(page * perpage, page * perpage + perpage),
      });
    }
    if (url.pathname === "/rest/v1/collections") return json(200, { items: [{ _id: 1, title: "A" }] });
    // Les collections IMBRIQUÉES, endpoint distinct (§5.1, 2 requêtes).
    if (url.pathname === "/rest/v1/collections/childrens") {
      return json(200, { items: [{ _id: 2, title: "A/enfant", parent: { $id: 1 } }] });
    }
    if (url.pathname === "/rest/v1/highlights") {
      return json(200, {
        count: 2,
        items: [
          { _id: 501, text: "surlignage" },
          { _id: 502, text: "autre" },
        ],
      });
    }
    if (url.pathname === "/rest/v1/user") return json(200, { user: { _id: 7 } });
    if (/^\/rest\/v1\/raindrop\/\d+\/cache$/.test(url.pathname)) {
      // 303, le code MESURÉ — la doc annonce 307 (spec §5.4).
      res.writeHead(303, { Location: `http://127.0.0.1:${portServi}/s3/objet?X-Amz-Signature=abc` });
      res.end();
      return;
    }
    if (url.pathname === "/s3/objet") {
      // La signature ne couvre que GET : un HEAD est refusé (403), mesuré.
      if (req.method === "HEAD") {
        res.writeHead(403);
        res.end();
        return;
      }
      // Un en-tête d'authentification sur une URL DÉJÀ signée est rejeté —
      // c'est ce que la redirection suivie automatiquement provoquerait.
      if (req.headers.authorization) {
        res.writeHead(400);
        res.end("signature + auth");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(gzipSync(Buffer.from("<html>archive</html>")));
      return;
    }
    json(404, { error: "inconnu" });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  portServi = port;
  return {
    port,
    items: etat.items,
    appels,
    authorizations,
    repondre429: (n) => {
      reste429 = n;
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
