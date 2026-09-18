import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Hono } from "hono";
import { createApp } from "../app.js";
import type { SidecarDeps } from "../deps.js";
import { connectFake } from "../../testing/fakeServer.js";
import { McpConnection } from "../../mcp/connection.js";
import type { Paginated, RaindropItem } from "../../../shared/types.js";

// Les routes de LECTURE, séparées des écritures : le fichier unique avait
// franchi le plafond dur de 400 lignes (CLAUDE.md), et sa frontière naturelle
// est là — lire ne demande ni store d'origines, ni espion d'`unrestore`, ni
// rien de l'échafaudage que réclame la mise à la corbeille.
//
// Ce que ces tests verrouillent tient en une phrase : les filtres qui ne sont
// PAS des paramètres du pont MCP (`domain`, `tags`) doivent devenir des termes
// de recherche, et ne jamais atteindre le tool. Un paramètre que le pont
// transmet et que l'API ignore ne filtre rien — sans erreur, avec une liste
// trop large pour seul symptôme.

let conn: McpConnection;
let app: Hono;
let baseDeps: SidecarDeps;

const TOKEN = "test-token";
const req = async (hono: Hono, path: string, init?: RequestInit, token: string = TOKEN): Promise<Response> =>
  hono.request(path, { ...init, headers: { Authorization: `Bearer ${token}` } });

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 30 });
  conn = McpConnection.fromClient(fake.client);
  baseDeps = {
    mcp: (tool, args, timeoutMs) => conn.call(tool, args, timeoutMs),
    state: () => "connected",
    restart: async () => undefined,
    jobs: { get: () => undefined, list: () => [] } as unknown as SidecarDeps["jobs"],
    cache: {} as SidecarDeps["cache"],
    scanner: { startScan: () => "", isRunning: () => false } as unknown as SidecarDeps["scanner"],
    direct: {} as SidecarDeps["direct"],
    origins: {} as SidecarDeps["origins"],
  };
  app = createApp(baseDeps, { localToken: TOKEN });
});
afterEach(async () => conn.close());

describe("routes raindrops — lecture et filtres", () => {
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
      { ...baseDeps, mcp: async (tool: string, args: Record<string, unknown>) => { vus.push([tool, args]); return conn.call(tool, args); } },
      { localToken: "t" },
    );
    await req(app2, "/api/raindrops?domain=https://WWW.YouTube.com/watch", undefined, "t");
    const [tool, args] = vus[0] as [string, Record<string, unknown>];
    expect(tool).toBe("search_raindrops");
    expect(args.search).toBe('domain:"youtube.com"');
    expect("domain" in args).toBe(false);
  });

  // Le filtre MULTI-ÉTIQUETTES. Deux étiquettes, et non une : c'est le seul
  // nombre qui attrape le piège. `Object.fromEntries(searchParams)` ne garde
  // que la DERNIÈRE valeur d'une clé répétée — un test à une étiquette
  // passerait au vert sur une route qui les perd toutes sauf une, et l'écran
  // afficherait alors une liste trop large que rien n'expliquerait.
  it("GET / : DEUX étiquettes répétées arrivent toutes les deux", async () => {
    const vus: unknown[] = [];
    const app2 = createApp(
      { ...baseDeps, mcp: async (tool: string, args: Record<string, unknown>) => { vus.push(args); return conn.call(tool, args); } },
      { localToken: "t" },
    );
    await req(app2, "/api/raindrops?tags=webdesign&tags=code", undefined, "t");
    const args = vus[0] as Record<string, unknown>;
    expect(args.search).toBe('#"webdesign" #"code"');
    // Et le tableau ne part PAS au pont : comme `domain`, ce n'est pas un
    // paramètre du tool — il ne filtrerait rien et brouillerait les arguments.
    expect("tags" in args).toBe(false);
  });

  it("GET / : sans étiquette, aucun terme n'est ajouté", async () => {
    const vus: unknown[] = [];
    const app2 = createApp(
      { ...baseDeps, mcp: async (tool: string, args: Record<string, unknown>) => { vus.push(args); return conn.call(tool, args); } },
      { localToken: "t" },
    );
    await req(app2, "/api/raindrops?search=rust", undefined, "t");
    expect((vus[0] as Record<string, unknown>).search).toBe("rust");
  });

  it("GET / : le domaine s'ajoute à la recherche saisie sans l'écraser", async () => {
    const vus: unknown[] = [];
    const app2 = createApp(
      { ...baseDeps, mcp: async (tool: string, args: Record<string, unknown>) => { vus.push(args); return conn.call(tool, args); } },
      { localToken: "t" },
    );
    await req(app2, "/api/raindrops?search=%23webdesign&domain=youtube.com", undefined, "t");
    expect((vus[0] as Record<string, unknown>).search).toBe('#webdesign domain:"youtube.com"');
  });

  it("GET / : un domaine vide ne pose aucun terme (il rendrait zéro résultat)", async () => {
    const vus: unknown[] = [];
    const app2 = createApp(
      { ...baseDeps, mcp: async (tool: string, args: Record<string, unknown>) => { vus.push(args); return conn.call(tool, args); } },
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

});
