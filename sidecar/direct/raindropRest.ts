import type { CallOutcome } from "../../shared/errors.js";

const API_BASE = "https://api.raindrop.io/rest/v1";

export interface RaindropRestClient {
  updateRaindropUrl(id: number, url: string): Promise<CallOutcome<{ id: number }>>;
  unrestore(ids: number[]): Promise<CallOutcome<{ restored: number }>>;
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

    async unrestore(ids) {
      try {
        const res = await f(`${base}/raindrops/unrestore`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${opts.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids }),
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
