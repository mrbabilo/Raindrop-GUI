import type { CallOutcome } from "../../shared/errors.js";

const API_BASE = "https://api.raindrop.io/rest/v1";

export interface RaindropRestClient {
  updateRaindropUrl(id: number, url: string): Promise<CallOutcome<{ id: number }>>;
  /** Destination OBLIGATOIRE à ce niveau : c'est la route (Task 0b) qui
   *  résout l'origine mémorisée. POST /raindrops/unrestore n'existe pas
   *  (404 en réel, 2026-09-16) — la seule voie est PUT /raindrops/-99. */
  unrestore(ids: number[], toCollectionId: number): Promise<CallOutcome<{ restored: number }>>;
}

export function makeRestClient(
  opts: { token: string; baseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch },
): RaindropRestClient {
  const base = opts.baseUrl ?? API_BASE;
  const f = opts.fetchImpl ?? fetch;
  return {
    async updateRaindropUrl(id, url) {
      try {
        const res = await f(`${base}/raindrop/${id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${opts.token}`,
            "Content-Type": "application/json",
          },
          // `link`, pas `url` : c'est le nom DOCUMENTÉ du champ (PUT
          // /raindrop/{id}, developer.raindrop.io). Sondé en réel le
          // 2026-09-22 : `{url}` répond 200 result:true en IGNORANT le
          // champ — le signet restait inchangé, succès inventé.
          body: JSON.stringify({ link: url }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        });
        if (!res.ok) {
          return { ok: false, code: "RAINDROP_API", message: `raindrop api http ${res.status}` };
        }
        // Le statut ne suffit pas : l'API ignore en silence ce qu'elle ne
        // connaît pas. Le seul verdict honnête est ce que le CORPS dit avoir
        // appliqué — item.link doit être exactement l'URL demandée.
        let body: { result?: unknown; item?: { link?: unknown } | null };
        try {
          body = (await res.json()) as typeof body;
        } catch {
          return { ok: false, code: "RAINDROP_API", message: "réponse illisible de l'api raindrop" };
        }
        if (body.result !== true) {
          return { ok: false, code: "RAINDROP_API", message: `raindrop api a refusé la modification (result ${String(body.result)})` };
        }
        if (body.item?.link !== url) {
          return { ok: false, code: "RAINDROP_API", message: `URL non appliquée par l'api raindrop (demandé ${url}, lu ${String(body.item?.link)})` };
        }
        return { ok: true, data: { id } };
      } catch (e) {
        return { ok: false, code: "RAINDROP_API", message: e instanceof Error ? e.message : String(e) };
      }
    },

    async unrestore(ids, toCollectionId) {
      try {
        const res = await f(`${base}/raindrops/-99`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${opts.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids, collection: { $id: toCollectionId } }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        });
        if (!res.ok) {
          return { ok: false, code: "RAINDROP_API", message: `raindrop api http ${res.status}` };
        }
        // Garde TOLÉRANTE : la doc de PUT /raindrops ne montre aucun corps
        // d'exemple — durcir au niveau d'updateRaindropUrl (vérifier item
        // relu) casserait une restauration vérifiée en réel si la forme
        // réelle diffère. On refuse seulement un refus EXPLICITE ; le
        // compte reste déclaré (ids.length), faute de forme mesurable —
        // à trancher au premier sondage réel (corbeille non vide).
        const brut = await res.text();
        if (brut.trim() !== "") {
          try {
            const body = JSON.parse(brut) as { result?: unknown };
            if (body.result === false) {
              return { ok: false, code: "RAINDROP_API", message: "raindrop api a refusé la restauration (result false)" };
            }
          } catch { /* corps non JSON : forme inconnue, pas un refus documenté */ }
        }
        return { ok: true, data: { restored: ids.length } };
      } catch (e) {
        return { ok: false, code: "RAINDROP_API", message: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
