import { repertoireTemporaire } from "../../testing/tmp.js";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Hono } from "hono";
import { join } from "node:path";
import { createApp, type SidecarDeps } from "../app.js";
import { connectFake } from "../../testing/fakeServer.js";
import { McpConnection } from "../../mcp/connection.js";
import { makeOriginStore } from "../../trash/origins.js";
import type { Paginated, RaindropItem } from "../../../../shared/types.js";

let conn: McpConnection;
let app: Hono;
let baseDeps: SidecarDeps;

// Adaptation brief : l'API locale est derrière l'auth Bearer (Task 7, spec §3.7)
// → chaque requête du test fournit le token local (même motif que app.test.ts).
const TOKEN = "test-token";
const req = (hono: Hono, path: string, init?: RequestInit, token: string = TOKEN): Promise<Response> =>
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

/** App pour POST /unrestore : direct espion + origines factices fournies. */
const unrestoreApp = (calls: [number[], number][], origins: ReturnType<typeof makeOriginsFake>, failTo?: number): Hono =>
  createApp({ ...baseDeps, direct: unrestoreDirect(calls, failTo), origins: origins.store }, { localToken: TOKEN });

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
    scanner: { startScan: () => "", isRunning: () => false },
    direct: unrestoreDirect([]),
    origins: makeOriginsFake([]).store,
  };
  app = createApp(baseDeps, { localToken: TOKEN });
});
afterEach(async () => conn.close());

describe("routes raindrops", () => {
  it("GET / normalise les items vers le DTO partagé", async () => {
    const res = await req(app, "/api/raindrops?per_page=10&collection_id=0");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Paginated<RaindropItem>;
    expect(body.count).toBe(32); // 30 demandés + 2 doublons fixture
    expect(body.items).toHaveLength(10);
    expect(body.items[0]).toMatchObject({ url: expect.stringContaining("https://"), collectionId: expect.any(Number), tags: expect.any(Array) });
    expect(body.items[0]!.id).toBeDefined();
  });

  it("GET / : important=false désactive le filtre (piège du coerce booléen)", async () => {
    const res = await req(app, "/api/raindrops?per_page=50&important=false");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Paginated<RaindropItem>;
    // si Boolean("false")===true fuyait, seul le sous-ensemble important (~7) serait renvoyé
    expect(body.count).toBe(32);
  });

  // CLAUDE.md §Traps : `domain` passé au pont MCP ne filtre RIEN — il part
  // en paramètre d'URL, que l'API Raindrop ignore (12 210 items avec comme
  // sans). Le filtre n'existe que dans la recherche. Ce test verrouille les
  // DEUX moitiés : le terme composé arrive, et `domain` ne part plus.
  // La composition elle-même est prouvée sur l'API réelle dans
  // recherche.test.ts — un tool mocké ne saurait rien en dire.
  it("GET / : le domaine devient un terme de recherche, jamais un paramètre du tool", async () => {
    const vus: unknown[] = [];
    const app2 = createApp(
      { ...baseDeps, mcp: async (tool, args) => { vus.push([tool, args]); return conn.call(tool, args); } },
      { localToken: "t" },
    );
    await req(app2, "/api/raindrops?domain=https://WWW.YouTube.com/watch", undefined, "t");
    const [tool, args] = vus[0] as [string, Record<string, unknown>];
    expect(tool).toBe("search_raindrops");
    expect(args.search).toBe('domain:"youtube.com"');
    expect("domain" in args).toBe(false);
  });

  it("GET / : le domaine s'ajoute à la recherche saisie sans l'écraser", async () => {
    const vus: unknown[] = [];
    const app2 = createApp(
      { ...baseDeps, mcp: async (tool, args) => { vus.push(args); return conn.call(tool, args); } },
      { localToken: "t" },
    );
    await req(app2, "/api/raindrops?search=%23webdesign&domain=youtube.com", undefined, "t");
    expect((vus[0] as Record<string, unknown>).search).toBe('#webdesign domain:"youtube.com"');
  });

  it("GET / : un domaine vide ne pose aucun terme (il rendrait zéro résultat)", async () => {
    const vus: unknown[] = [];
    const app2 = createApp(
      { ...baseDeps, mcp: async (tool, args) => { vus.push(args); return conn.call(tool, args); } },
      { localToken: "t" },
    );
    await req(app2, "/api/raindrops?search=rust&domain=%20%20", undefined, "t");
    const args = vus[0] as Record<string, unknown>;
    expect(args.search).toBe("rust");
    expect("domain" in args).toBe(false);
  });

  it("GET /:id renvoie un DTO", async () => {
    const list = (await (await req(app, "/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
    const res = await req(app, `/api/raindrops/${list.items[0]!.id}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as RaindropItem).url).toBeTruthy();
  });

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

  it("DELETE /:id?from= mémorise l'origine AVANT la suppression (corbeille aveugle, §4.2)", async () => {
    const journal: string[] = [];
    const list = (await (await req(app, "/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
    const id = list.items[0]!.id;
    const res = await req(journalApp(journal), `/api/raindrops/${id}?from=42`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(journal).toEqual([`remember:${id}:42`, "mcp:delete_raindrop"]);
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
  it("DELETE /:id?from= (vide) ne mémorise rien — pas 0", async () => {
    const journal: string[] = [];
    const list = (await (await req(app, "/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
    const id = list.items[0]!.id; // un id qui existe vraiment dans le fake
    const res = await req(journalApp(journal), `/api/raindrops/${id}?from=`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(journal).toEqual(["mcp:delete_raindrop"]); // delete sans remember
  });

  it("DELETE /:id sans from ne mémorise rien", async () => {
    const journal: string[] = [];
    const list = (await (await req(app, "/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
    const res = await req(journalApp(journal), `/api/raindrops/${list.items[0]!.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(journal).toEqual(["mcp:delete_raindrop"]);
  });

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

  // Task 0b — remplace le test de la Task 0 (POST /raindrops/unrestore, 404 réel)
  it("POST /unrestore avec toCollectionId : un appel, origines oubliées, unknown:[]", async () => {
    const calls: [number[], number][] = [];
    const origins = makeOriginsFake([], new Map([[1000, 5]]));
    const res = await req(unrestoreApp(calls, origins), "/api/raindrops/unrestore", {
      method: "POST",
      body: JSON.stringify({ ids: [1000, 1002], toCollectionId: 9 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restored: 2, unknown: [] });
    expect(calls).toEqual([[[1000, 1002], 9]]);
    expect(origins.map.has(1000)).toBe(false); // forget des ids restaurés
  });

  it("POST /unrestore avec destination et écriture du store impossible → 200, forget avalé", async () => {
    const calls: [number[], number][] = [];
    const store = brokenOrigins();
    // préchauffe la MÉMOIRE (le disque est KO) : sinon forget n'a rien à retirer
    // et ne déclenche jamais l'écriture qui doit être avalée
    await store.remember(1000, 9).catch(() => undefined);
    await store.remember(1002, 9).catch(() => undefined);
    const res = await req(
      createApp({ ...baseDeps, direct: unrestoreDirect(calls), origins: store }, { localToken: TOKEN }),
      "/api/raindrops/unrestore",
      { method: "POST", body: JSON.stringify({ ids: [1000, 1002], toCollectionId: 9 }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restored: 2, unknown: [] });
  });

  it("POST /unrestore sans destination : un appel par origine, unknown renvoyé tel quel", async () => {
    const calls: [number[], number][] = [];
    const origins = makeOriginsFake([], new Map([[1000, 5], [1001, 5], [1002, 7]]));
    const res = await req(unrestoreApp(calls, origins), "/api/raindrops/unrestore", {
      method: "POST",
      body: JSON.stringify({ ids: [1000, 1001, 1002, 1003] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restored: 3, unknown: [1003] });
    // les groupes passent par la file (throttle 550 ms en prod), l'un après l'autre
    expect(calls).toEqual([[[1000, 1001], 5], [[1002], 7]]);
    expect(origins.map.has(1000)).toBe(false);
    expect(origins.map.has(1002)).toBe(false);
    expect(origins.map.get(1003)).toBeUndefined();
  });

  it("échec d'une destination : origines du groupe en échec conservées (retry possible)", async () => {
    const calls: [number[], number][] = [];
    const origins = makeOriginsFake([], new Map([[1000, 5], [1002, 7]]));
    const res = await req(unrestoreApp(calls, origins, 7), "/api/raindrops/unrestore", {
      method: "POST",
      body: JSON.stringify({ ids: [1000, 1002] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restored: 1, unknown: [] });
    expect(origins.map.get(1002)).toBe(7); // PAS forget — sinon irrécupérable à l'origine
    expect(origins.map.has(1000)).toBe(false);
  });

  it("POST /unrestore avec toCollectionId en échec → erreur, origines conservées", async () => {
    const calls: [number[], number][] = [];
    const origins = makeOriginsFake([], new Map([[1000, 5]]));
    const res = await req(unrestoreApp(calls, origins, 9), "/api/raindrops/unrestore", {
      method: "POST",
      body: JSON.stringify({ ids: [1000, 1001], toCollectionId: 9 }),
    });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("RAINDROP_API");
    expect(origins.map.get(1000)).toBe(5);
  });

  it("POST /unrestore exige ids non vides (400)", async () => {
    const res = await req(app, "/api/raindrops/unrestore", {
      method: "POST",
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(400);
  });
});
