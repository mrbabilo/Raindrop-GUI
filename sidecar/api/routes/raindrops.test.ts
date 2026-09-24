import { repertoireTemporaire } from "../../testing/tmp.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Hono } from "hono";
import { join } from "node:path";
import { createApp } from "../app.js";
import type { SidecarDeps } from "../deps.js";
import { connectFake } from "../../testing/fakeServer.js";
import { McpConnection } from "../../mcp/connection.js";
import { JobStore } from "../../jobs/store.js";
import { makeOriginStore } from "../../trash/origins.js";
import type { Paginated, RaindropItem } from "../../../shared/types.js";

let conn: McpConnection;
let app: Hono;
let baseDeps: SidecarDeps;

// Adaptation brief : l'API locale est derrière l'auth Bearer (Task 7, spec §3.7)
// → chaque requête du test fournit le token local (même motif que app.test.ts).
const TOKEN = "test-token";
const req = async (hono: Hono, path: string, init?: RequestInit, token: string = TOKEN): Promise<Response> =>
  hono.request(path, { ...init, headers: { Authorization: `Bearer ${token}` } });

/** Store d'origines factice : état en mémoire + journal d'appels (ordre). */
const makeOriginsFake = (journal: string[], initial?: Map<number, number>) => {
  const map = new Map(initial);
  const store = {
    remember: async (id: number, collectionId: number) => {
      journal.push(`remember:${id}:${collectionId}`);
      map.set(id, collectionId);
    },
    take: async (ids: number[]) => {
      const known = new Map<number, number>();
      const unknown: number[] = [];
      for (const id of ids) {
        const dest = map.get(id);
        if (dest === undefined) unknown.push(id);
        else known.set(id, dest);
      }
      return { known, unknown };
    },
    forget: async (ids: number[]) => {
      journal.push(`forget:${ids.join(",")}`);
      for (const id of ids) map.delete(id);
    },
    flush: async () => undefined,
  };
  return { map, store: store as unknown as SidecarDeps["origins"] };
};

/** App espionnant mcp + origins dans un journal partagé (ordre remember/delete). */
const journalApp = (journal: string[]): Hono =>
  createApp(
    {
      ...baseDeps,
      mcp: async (tool: string, args: Record<string, unknown>) => {
        journal.push(`mcp:${tool}`);
        return conn.call(tool, args);
      },
      origins: makeOriginsFake(journal).store,
    },
    { localToken: TOKEN },
  );

const unrestoreDirect = (calls: [number[], number][], failTo?: number) => ({
  updateRaindropUrl: async () => ({ ok: true as const, data: { id: 1 } }),
  unrestore: async (ids: number[], toCollectionId: number) => {
    calls.push([ids, toCollectionId]);
    if (toCollectionId === failTo) return { ok: false as const, code: "RAINDROP_API" as const, message: "http 500" };
    return { ok: true as const, data: { restored: ids.length } };
  },
});

/** Vrai store dont TOUTE écriture échoue (répertoire parent inexistant → ENOENT) :
 *  verrouille « un échec d'écriture du store ne fait jamais échouer la route ». */
const brokenOrigins = () => makeOriginStore({ file: join(repertoireTemporaire("origines-ko-"), "pas-de-rep", "origins.json") });

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 30 });
  conn = McpConnection.fromClient(fake.client);
  baseDeps = {
    mcp: (tool, args, timeoutMs) => conn.call(tool, args, timeoutMs),
    state: () => "connected",
    restart: async () => undefined,
    jobs: { get: () => undefined, list: () => [] } as unknown as SidecarDeps["jobs"],
    cache: {} as SidecarDeps["cache"],
    smartlists: {} as SidecarDeps["smartlists"],
    scanner: { startScan: () => "", isRunning: () => false } as unknown as SidecarDeps["scanner"],
    direct: unrestoreDirect([]),
    origins: makeOriginsFake([]).store,
    journal: { info: () => undefined, warn: () => undefined, error: () => undefined },
    logsDir: "/non-existant",
  };
  app = createApp(baseDeps, { localToken: TOKEN });
});
afterEach(async () => conn.close());

describe("routes raindrops", () => {
  it("POST / crée (201) puis l'item apparaît dans la liste", async () => {
    const res = await req(app, "/api/raindrops", {
      method: "POST",
      body: JSON.stringify({ link: "https://nouveau.example/page", collection_id: 101 }),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as RaindropItem;
    expect(created.url).toBe("https://nouveau.example/page");
    expect(created.collectionId).toBe(101);
  });

  it("POST / rejette un lien invalide (400 INVALID_INPUT)", async () => {
    const res = await req(app, "/api/raindrops", { method: "POST", body: JSON.stringify({ link: "pas-une-url" }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INVALID_INPUT");
  });

  it("PATCH /:id sans url passe par update_raindrop", async () => {
    const list = (await (await req(app, "/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
    const res = await req(app, `/api/raindrops/${list.items[0]!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Nouveau titre" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as RaindropItem).title).toBe("Nouveau titre");
  });

  it("PATCH /:id avec url bascule sur le REST direct", async () => {
    const list = (await (await req(app, "/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
    const res = await req(app, `/api/raindrops/${list.items[0]!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ url: "https://corrige.example/final" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { urlUpdated: boolean }).urlUpdated).toBe(true);
  });

  it("PATCH /:id refuse url combiné à d'autres champs (400)", async () => {
    const res = await req(app, "/api/raindrops/1000", {
      method: "PATCH",
      body: JSON.stringify({ url: "https://x.example", title: "Aussi" }),
    });
    expect(res.status).toBe(400);
  });

  // Depuis le 2026-09-24 la route RELIT le signet avant d'écrire (un `from`
  // périmé détruisait un corbeillé) : l'origine notée est celle que Raindrop
  // rend, le `from` du front n'étant plus qu'un repli.
  it("DELETE /:id mémorise l'origine LUE, AVANT la suppression (corbeille aveugle, §4.2)", async () => {
    const journal: string[] = [];
    const list = (await (await req(app, "/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
    const { id, collectionId } = list.items[0]!;
    expect(collectionId).not.toBe(42); // la lecture l'emporte sur un `from` faux
    const res = await req(journalApp(journal), `/api/raindrops/${id}?from=42`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(journal).toEqual(["mcp:get_raindrop", `remember:${id}:${collectionId}`, "mcp:delete_raindrop"]);
  });

  it("DELETE /:id?from= avec écriture du store impossible → la suppression réussit quand même", async () => {
    const list = (await (await req(app, "/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
    const appKo = createApp({ ...baseDeps, origins: brokenOrigins() }, { localToken: TOKEN });
    const res = await req(appKo, `/api/raindrops/${list.items[0]!.id}?from=42`, { method: "DELETE" });
    expect(res.status).toBe(200);
  });

  // `z.coerce.number()("")` rend 0 : une chaîne vide mémorisait l'origine 0
  // (« Tous ») au lieu de rien du tout — un DELETE `?from=` mentait sa
  // provenance en silence.
  it.each([["?from= (vide)", "?from="], ["sans from", ""]])(
    "DELETE /:id %s : l'origine est la collection LUE — jamais un 0 inventé",
    async (_nom, suffixe) => {
      const journal: string[] = [];
      const list = (await (await req(app, "/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
      const { id, collectionId } = list.items[0]!; // un id qui existe vraiment dans le fake
      expect(collectionId).not.toBe(0);
      const res = await req(journalApp(journal), `/api/raindrops/${id}${suffixe}`, { method: "DELETE" });
      expect(res.status).toBe(200);
      expect(journal).toEqual(["mcp:get_raindrop", `remember:${id}:${collectionId}`, "mcp:delete_raindrop"]);
    },
  );

  it("DELETE /:id?from=abc → 400 INVALID_INPUT (pas de coerce booléen piégeur, R10)", async () => {
    const res = await req(app, "/api/raindrops/1000?from=abc", { method: "DELETE" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INVALID_INPUT");
  });

  it("POST /bulk delete mémorise l'origine (collection_id de la requête) de chaque id", async () => {
    const journal: string[] = [];
    const res = await req(journalApp(journal), "/api/raindrops/bulk", {
      method: "POST",
      body: JSON.stringify({ operation: "delete", collection_id: 5, ids: [1000, 1001] }),
    });
    expect(res.status).toBe(200);
    // mémorisé AVANT l'appel bulk : sinon tout ce qui part en masse (BulkBar,
    // ReviewPage) reviendrait unknown — la décision §4.2 serait vidée (Task 0b)
    expect(journal).toEqual(["remember:1000:5", "remember:1001:5", "mcp:bulk_raindrops"]);
  });

  it("POST /bulk delete avec écriture du store impossible → le bulk réussit quand même", async () => {
    const res = await req(createApp({ ...baseDeps, origins: brokenOrigins() }, { localToken: TOKEN }), "/api/raindrops/bulk", {
      method: "POST",
      body: JSON.stringify({ operation: "delete", collection_id: 5, ids: [1000, 1001] }),
    });
    expect(res.status).toBe(200);
  });

  // Revue finale : le flux nominal (Revue → bulk delete) envoie les origines
  // RÉELLES de chaque item (collectionId de la vue review) — sinon tout
  // nettoyage en masse est mémorisé « Tous » et restaurerait en silence au
  // mauvais endroit (§4.2). Le champ front ne transite PAS au tool MCP.
  it("POST /bulk delete avec origins mémorise CHAQUE origine fournie, avant l'opération, et les raye des args du tool", async () => {
    const spy: unknown[] = [];
    const journal: string[] = [];
    const connSpy = {
      call: async (tool: string, args: Record<string, unknown>) => {
        spy.push([tool, args]);
        journal.push(`mcp:${tool}`);
        return conn.call(tool, args);
      },
    };
    const app2 = createApp(
      { ...baseDeps, mcp: (tool, args) => connSpy.call(tool, args), origins: makeOriginsFake(journal).store },
      { localToken: "t" },
    );
    const res = await req(app2, "/api/raindrops/bulk", {
      method: "POST",
      body: JSON.stringify({
        operation: "delete",
        collection_id: 0,
        ids: [1000, 1001],
        origins: [{ id: 1000, from: 7 }, { id: 1001, from: 102 }],
      }),
    }, "t");
    expect(res.status).toBe(200);
    expect(journal).toEqual(["remember:1000:7", "remember:1001:102", "mcp:bulk_raindrops"]);
    expect(spy[0]).toEqual(["bulk_raindrops", { operation: "delete", collection_id: 0, ids: [1000, 1001] }]);
  });

  it("POST /bulk delete avec origins partielles : les ids absents retombent sur collection_id (dégradé « Tous »)", async () => {
    const journal: string[] = [];
    const res = await req(journalApp(journal), "/api/raindrops/bulk", {
      method: "POST",
      body: JSON.stringify({
        operation: "delete",
        collection_id: 5,
        ids: [1000, 1001],
        origins: [{ id: 1000, from: 7 }],
      }),
    });
    expect(res.status).toBe(200);
    expect(journal).toEqual(["remember:1000:7", "remember:1001:5", "mcp:bulk_raindrops"]);
  });

  it("POST /bulk move ne mémorise rien (pas une mise à la corbeille)", async () => {
    const journal: string[] = [];
    const res = await req(journalApp(journal), "/api/raindrops/bulk", {
      method: "POST",
      body: JSON.stringify({ operation: "move", collection_id: 0, ids: [1000, 1001], to_collection_id: 101 }),
    });
    expect(res.status).toBe(200);
    expect(journal).toEqual(["mcp:bulk_raindrops"]);
  });

  it("POST /bulk delete exige ids (400)", async () => {
    const res = await req(app, "/api/raindrops/bulk", {
      method: "POST",
      body: JSON.stringify({ operation: "delete", collection_id: 0 }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /bulk move envoie les bons args au tool", async () => {
    const spy: unknown[] = [];
    const connSpy = {
      call: async (tool: string, args: Record<string, unknown>) => {
        spy.push([tool, args]);
        return conn.call(tool, args);
      },
    };
    const app2 = createApp({ ...baseDeps, mcp: (tool, args) => connSpy.call(tool, args) }, { localToken: "t" });
    const res = await req(app2, "/api/raindrops/bulk", {
      method: "POST",
      body: JSON.stringify({ operation: "move", collection_id: 0, ids: [1000, 1001], to_collection_id: 101 }),
    }, "t");
    expect(res.status).toBe(200);
    expect(spy[0]).toEqual(["bulk_raindrops", { operation: "move", collection_id: 0, ids: [1000, 1001], to_collection_id: 101 }]);
  });
});

describe("POST /dedupe", () => {
  it("corps valide → un job COURT et déduplique, pas seulement existe", async () => {
    // Le stub `jobs` de baseDeps ne sait pas créer : un vrai store, ici.
    const jobs = new JobStore();
    const vus: string[] = [];
    const app2 = createApp(
      {
        ...baseDeps,
        jobs,
        mcp: async (tool: string, args: Record<string, unknown>) => {
          vus.push(tool);
          return conn.call(tool, args);
        },
      },
      { localToken: TOKEN },
    );
    const res = await req(app2, "/api/raindrops/dedupe", {
      method: "POST",
      body: JSON.stringify({ paires: [{ garde: 1, copies: [{ id: 2, collectionId: 7 }] }] }),
    });
    expect(res.status).toBe(200);
    const { jobId } = (await res.json()) as { jobId: string };
    // Le job doit EXÉCUTER la consolidation, pas seulement exister : un
    // runJob au corps vide créerait le même jobId pour un travail mort.
    await new Promise<void>((resolve) => {
      const id = setInterval(() => {
        const s = jobs.get(jobId);
        if (s && s.status !== "running") {
          clearInterval(id);
          resolve();
        }
      }, 5);
    });
    expect(jobs.get(jobId)?.status).toBe("done");
    expect(vus).toContain("get_raindrop");
    expect(vus).toContain("bulk_raindrops");
  });

  it("corps invalide → 400 INVALID_INPUT (copie sans collection)", async () => {
    const res = await req(app, "/api/raindrops/dedupe", {
      method: "POST",
      body: JSON.stringify({ paires: [{ garde: 1, copies: [{ id: 2 }] }] }),
    });
    expect(res.status).toBe(400);
  });
});

// Le journal des ÉCRITURES (2026-09-20) : une corbeille qui ne fait rien
// doit laisser une trace lisible depuis l'app — c'est le silence qui a
// permis au défaut `-99` de rester invisible deux semaines.
describe("le journal des écritures", () => {
  const journalDeps = (mcpReffuse = false) => {
    const entrees: { msg: string; champs?: Record<string, unknown> }[] = [];
    const deps: SidecarDeps = {
      ...baseDeps,
      jobs: new JobStore(),
      journal: {
        info: (msg: string, champs?: Record<string, unknown>) => { entrees.push({ msg, champs }); },
        warn: (msg: string, champs?: Record<string, unknown>) => { entrees.push({ msg, champs }); },
        error: (msg: string, champs?: Record<string, unknown>) => { entrees.push({ msg, champs }); },
      },
      logsDir: repertoireTemporaire("journal-ecritures-"),
      ...(mcpReffuse
        ? { mcp: async () => ({ ok: false as const, code: "RAINDROP_API" as const, message: "hoquet" }) }
        : {}),
    };
    return { deps, entrees };
  };

  it("DELETE /:id logge la corbeille avec l'id et l'origine", async () => {
    const { deps, entrees } = journalDeps();
    const h = createApp(deps, { localToken: TOKEN });
    const list = (await (await req(h, "/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
    const id = list.items[0]!.id;
    await req(h, `/api/raindrops/${id}?from=42`, { method: "DELETE" });
    expect(entrees.some((e) => e.msg === "corbeille" && e.champs?.id === id && e.champs?.from === 42)).toBe(true);
  });

  it("une écriture REFUSÉE logge un avertissement avec la raison", async () => {
    const { deps, entrees } = journalDeps(true);
    const h = createApp(deps, { localToken: TOKEN });
    await req(h, "/api/raindrops/999?from=0", { method: "DELETE" });
    expect(entrees.some((e) => e.msg === "corbeille refusée" && String(e.champs?.err).includes("hoquet"))).toBe(true);
  });

  it("POST /bulk logge l'opération et les ids", async () => {
    const { deps, entrees } = journalDeps();
    const h = createApp(deps, { localToken: TOKEN });
    await req(h, "/api/raindrops/bulk", {
      method: "POST",
      body: JSON.stringify({ operation: "delete", collection_id: 0, ids: [11, 12] }),
    });
    expect(entrees.some((e) => e.msg === "bulk" && e.champs?.operation === "delete")).toBe(true);
    expect(entrees.find((e) => e.msg === "bulk")?.champs?.ids).toEqual([11, 12]);
  });

  it("POST /dedupe logge le lancement (le terme passe par le journal du job)", async () => {
    const { deps, entrees } = journalDeps();
    const h = createApp(deps, { localToken: TOKEN });
    const res = await req(h, "/api/raindrops/dedupe", {
      method: "POST",
      body: JSON.stringify({ paires: [{ garde: 1, copies: [{ id: 2, collectionId: 7 }] }] }),
    });
    expect(res.status).toBe(200);
    expect(entrees.some((e) => e.msg === "dedupe lancé")).toBe(true);
  });
});
