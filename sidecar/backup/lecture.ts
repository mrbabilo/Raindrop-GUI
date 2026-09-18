//! Le canal de lecture de la sauvegarde : REST direct, pas le MCP.
//!
//! Le pont n'expose pas `sort=-lastUpdate` (vérifié dans le JS du paquet
//! épinglé) : sans lui AUCUN incrémental n'est possible et chaque
//! rafraîchissement coûterait 245 requêtes. Il aplatit aussi les codes HTTP
//! en `Error: failed to …`, or un job de plusieurs minutes doit distinguer
//! un 429 d'une panne réseau (spec §3.2).

import type { File } from "../mcp/throttle.js";

const API_BASE = "https://api.raindrop.io/rest/v1";

/**
 * **50 items par requête, c'est le plafond de l'API** (CLAUDE.md) — pas un
 * réglage. Déclaré ICI, chez le canal qui parle à l'API, plutôt que recopié
 * chez chaque appelant : il l'était quatre fois, et une valeur de pagination
 * qui divergerait d'un module à l'autre ferait sauter des éléments sans
 * lever la moindre erreur (la boucle s'arrête sur `items.length < PAR_PAGE`).
 */
export const PAR_PAGE = 50;

/**
 * Le code HTTP structuré, pas seulement en sous-chaîne du message.
 *
 * La spec justifie le REST direct par « distinguer un 429 d'une panne
 * réseau » et promet qu'un 429, désormais visible, déclenche une pause
 * avant reprise (§3.2). Laisser ce statut à une expression régulière sur
 * `error.message` rendrait cette promesse dépendante d'une chaîne de
 * caractères, et chaque consommateur (Tasks 4, 5, 8) devrait réinventer son
 * propre parsing. `status` est la source de vérité ; le message reste pour
 * la lisibilité des logs.
 */
export class ErreurHttpRaindrop extends Error {
  constructor(public readonly status: number) {
    super(`raindrop api http ${status}`);
    this.name = "ErreurHttpRaindrop";
  }
}

export interface PageBrute {
  count: number;
  items: unknown[];
}

export interface Lecture {
  page(collectionId: number, opts: { sort: string; page: number; perpage?: number }): Promise<PageBrute>;
  compteur(collectionId: number): Promise<number>;
  collections(): Promise<unknown[]>;
  /** Les collections IMBRIQUÉES (`/collections/childrens`). §5.1 compte deux
   *  requêtes pour « l'arborescence complète » : `/collections` ne rend que
   *  les racines, et s'en contenter perdrait en silence l'essentiel de la
   *  hiérarchie d'une bibliothèque de 12 210 signets. */
  collectionsEnfants(): Promise<unknown[]>;
  highlights(page: number): Promise<PageBrute>;
  user(): Promise<unknown>;
}

export function makeLecture(opts: {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  file: File;
  timeoutMs?: number;
}): Lecture {
  const base = opts.baseUrl ?? API_BASE;
  const f = opts.fetchImpl ?? fetch;

  // TOUT passe par la file, au rang « fond » : la limite de 120 req/min est
  // globale par utilisateur, et l'interface doit rester vive pendant les
  // 2 min 20 d'un balayage (spec §4.4).
  const lire = async (chemin: string): Promise<unknown> =>
    opts.file.run(
      async () => {
        const res = await f(`${base}${chemin}`, {
          headers: { Authorization: `Bearer ${opts.token}` },
          signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        });
        if (!res.ok) {
          // Le code HTTP est conservé : c'est précisément ce que le MCP perd,
          // et ce qui permet de distinguer une pause 429 d'un échec.
          throw new ErreurHttpRaindrop(res.status);
        }
        return res.json();
      },
      { rang: "fond" },
    );

  const pageBrute = async (chemin: string): Promise<PageBrute> => {
    const j = (await lire(chemin)) as { count?: number; items?: unknown[] };
    return { count: j.count ?? 0, items: j.items ?? [] };
  };

  return {
    page: (collectionId, { sort, page, perpage = PAR_PAGE }) =>
      pageBrute(`/raindrops/${collectionId}?sort=${encodeURIComponent(sort)}&page=${page}&perpage=${perpage}`),
    // perpage=1 : un compteur ne doit pas coûter une page entière (§5.3, la
    // comparaison de compteurs se veut « une requête »).
    compteur: async (collectionId) => (await pageBrute(`/raindrops/${collectionId}?perpage=1&page=0`)).count,
    collections: async () => ((await lire("/collections")) as { items?: unknown[] }).items ?? [],
    collectionsEnfants: async () =>
      ((await lire("/collections/childrens")) as { items?: unknown[] }).items ?? [],
    highlights: (page) => pageBrute(`/highlights?page=${page}&perpage=50`),
    user: () => lire("/user"),
  };
}
