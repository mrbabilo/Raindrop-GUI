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
          body: JSON.stringify({ url }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        });
        if (!res.ok) {
          return { ok: false, code: "RAINDROP_API", message: `raindrop api http ${res.status}` };
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
        return { ok: true, data: { restored: ids.length } };
      } catch (e) {
        return { ok: false, code: "RAINDROP_API", message: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
