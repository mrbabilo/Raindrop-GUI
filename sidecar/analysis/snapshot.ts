import type { CallOutcome } from "../../shared/errors.js";
import type { RaindropItem } from "../../shared/types.js";
import { toRaindropItem } from "../api/mappers.js";
import type { RawRaindrop } from "../api/mappers.js";

export type McpCaller = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<CallOutcome<unknown>>;

const PAGE = 50;

/**
 * La bibliothèque active, lue page par page — et lue JUSTE (audit du
 * 2026-09-23). Les pièges sont ceux que la sauvegarde a mesurés
 * (`backup/balayage.ts`, traps de CLAUDE.md), et qui s'appliquent ici autant :
 * - tri `created` CROISSANT : une création se range en fin, elle ne décale
 *   rien. Sans tri, l'ordre par défaut (« récent d'abord ») faisait relire un
 *   signet — un faux groupe de doublons avec lui-même ;
 * - identifiants DÉDOUBLONNÉS : une restauration réinsère un signet à sa
 *   date d'origine et fait relire un déjà-lu ;
 * - la DÉCROISSANCE du `count` au fil des pages trahit une suppression, qui
 *   fait SAUTER un vivant — `setItemsIndex` REMPLACE l'index, un signet
 *   sauté en disparaîtrait. Second passage ; s'il change encore, un échec
 *   NOMMÉ plutôt qu'un index amputé en silence.
 */
export async function fetchLibrarySnapshot(
  mcp: McpCaller,
  opts: { onProgress?: (done: number, total: number) => void; isCancelled?: () => boolean } = {},
): Promise<{ items: RaindropItem[]; cancelled: boolean }> {
  for (let essai = 1; essai <= 2; essai++) {
    const p = await passer(mcp, opts);
    if (p.cancelled || p.coherent) return { items: p.items, cancelled: p.cancelled };
  }
  throw new Error("la bibliothèque a changé pendant la lecture, deux fois de suite — relancez l'analyse");
}

async function passer(
  mcp: McpCaller,
  opts: { onProgress?: (done: number, total: number) => void; isCancelled?: () => boolean },
): Promise<{ items: RaindropItem[]; cancelled: boolean; coherent: boolean }> {
  const items: RaindropItem[] = [];
  const vus = new Set<number>();
  let page = 0;
  let count = 0;
  let countMax = 0;
  let decroissance = false;
  for (;;) {
    if (opts.isCancelled?.()) return { items, cancelled: true, coherent: false };
    const out = await mcp("search_raindrops", {
      collection_id: 0, // bibliothèque active, hors corbeille
      sort: "created",
      per_page: PAGE,
      page,
    });
    if (!out.ok) throw new Error(`${out.code}: ${out.message}`);
    const raw = out.data as { count: number; items: RawRaindrop[] };
    count = raw.count;
    if (count < countMax) decroissance = true;
    countMax = Math.max(countMax, count);
    for (const r of raw.items) {
      if (vus.has(r._id)) continue;
      vus.add(r._id);
      items.push(toRaindropItem(r));
    }
    opts.onProgress?.(items.length, count);
    if (raw.items.length < PAGE) break; // dernière page (vide comprise : garde-fou)
    page++;
  }
  return { items, cancelled: false, coherent: !decroissance && items.length === count };
}
