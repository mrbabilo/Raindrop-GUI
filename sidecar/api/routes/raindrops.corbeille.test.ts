//! Les gardes de la suppression DÉFINITIVE (audit du 2026-09-23). Chez
//! Raindrop, supprimer un signet DÉJÀ en corbeille le détruit (SOURCES.md) ;
//! l'app réserve ce geste au vidage de niveau 2 (frappe SUPPRIMER). Deux
//! chemins le contournaient : le dépôt sur « Corbeille » (bulk-trash) et un
//! DELETE qui se déclare lui-même en corbeille. Harnais minimal (mcp espion)
//! plutôt que le faux serveur : ce qui compte est ce qui PART vers le pont.

import { describe, it, expect } from "vitest";
import { createApp } from "../app.js";
import type { SidecarDeps } from "../deps.js";

const TOKEN = "t";

const monter = (collections: Record<number, number>) => {
  const appels: string[] = [];
  const deps = {
    mcp: async (tool: string, args: Record<string, unknown>) => {
      appels.push(`${tool}:${String(args.id)}`);
      if (tool === "get_raindrop") return { ok: true as const, data: { _id: args.id, collection: { $id: collections[args.id as number] ?? 0 } } };
      return { ok: true as const, data: { result: true } };
    },
    state: () => "connected",
    restart: async () => undefined,
    jobs: {} as SidecarDeps["jobs"],
    cache: {} as SidecarDeps["cache"],
    scanner: {} as SidecarDeps["scanner"],
    origins: {
      remember: async (id: number, cid: number) => void appels.push(`origine:${id}:${cid}`),
      take: async () => ({ known: new Map(), unknown: [] }),
      forget: async () => undefined,
      flush: async () => undefined,
      purge: async () => undefined,
    } as unknown as SidecarDeps["origins"],
    smartlists: {} as SidecarDeps["smartlists"],
    journal: { info: () => undefined, warn: () => undefined, error: () => undefined },
    logsDir: "/non-existant",
    direct: {} as SidecarDeps["direct"],
  } as unknown as SidecarDeps;
  const app = createApp(deps, { localToken: TOKEN });
  const req = (path: string, init: RequestInit) =>
    Promise.resolve(app.request(path, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } }));
  return { appels, req };
};

describe("suppression définitive — les gardes du sidecar", () => {
  it("témoin : DELETE ?from=42 corbeille bien, origine notée", async () => {
    const { appels, req } = monter({});
    expect((await req("/api/raindrops/7?from=42", { method: "DELETE" })).status).toBe(200);
    expect(appels).toEqual(["origine:7:42", "delete_raindrop:7"]);
  });

  it("DELETE ?from=-99 refusé : rien ne part vers le pont", async () => {
    const { appels, req } = monter({});
    const res = await req("/api/raindrops/7?from=-99", { method: "DELETE" });
    expect(res.status).toBe(400);
    expect(appels).toEqual([]);
  });

  it("bulk-trash : le corbeillé est écarté, le vivant part — câblage de la route", async () => {
    const { appels, req } = monter({ 1: -99, 2: 9 });
    const res = await req("/api/raindrops/bulk-trash", { method: "POST", body: JSON.stringify({ ids: [1, 2] }) });
    expect(await res.json()).toEqual({ corbeille: 1, deja: 1, echecs: [] });
    expect(appels).toContain("delete_raindrop:2");
    expect(appels).not.toContain("delete_raindrop:1");
  });

  // Doc officielle (relue le 2026-09-23) : sans ids, le bulk vise toute la
  // collection ; `tags: []` retire toutes les étiquettes ; DELETE en -99 est
  // définitif. Aucun ne doit passer la porte — rien ne part vers le pont.
  it.each([
    ["update sans ids (toute la bibliothèque)", { operation: "update", collection_id: 0, tags: ["x"] }],
    ["tags vides (toutes les étiquettes retirées)", { operation: "update", collection_id: 0, ids: [1], tags: [] }],
    ["delete depuis -99 (définitif)", { operation: "delete", collection_id: -99, ids: [1] }],
  ])("/bulk refuse : %s", async (_nom, corps) => {
    const { appels, req } = monter({});
    const res = await req("/api/raindrops/bulk", { method: "POST", body: JSON.stringify(corps) });
    expect(res.status).toBe(400);
    expect(appels).toEqual([]);
  });

  it("témoin : un update ciblé passe", async () => {
    const { appels, req } = monter({});
    const res = await req("/api/raindrops/bulk", { method: "POST", body: JSON.stringify({ operation: "update", collection_id: 0, ids: [1], tags: ["x"] }) });
    expect(res.status).toBe(200);
    expect(appels).toEqual(["bulk_raindrops:undefined"]);
  });
});
