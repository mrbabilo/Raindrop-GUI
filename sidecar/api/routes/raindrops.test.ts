import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Hono } from "hono";
import { createApp, type SidecarDeps } from "../app.js";
import { connectFake } from "../../testing/fakeServer.js";
import { McpConnection } from "../../mcp/connection.js";
import type { Paginated, RaindropItem } from "../../../../shared/types.js";

let conn: McpConnection;
let app: Hono;

// Adaptation brief : l'API locale est derrière l'auth Bearer (Task 7, spec §3.7)
// → chaque requête du test fournit le token local (même motif que app.test.ts).
const TOKEN = "test-token";
const req = (hono: Hono, path: string, init?: RequestInit, token: string = TOKEN): Promise<Response> =>
  hono.request(path, { ...init, headers: { Authorization: `Bearer ${token}` } });

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 30 });
  conn = McpConnection.fromClient(fake.client);
  const deps: SidecarDeps = {
    mcp: (tool, args, timeoutMs) => conn.call(tool, args, timeoutMs),
    state: () => "connected",
    restart: async () => undefined,
    jobs: { get: () => undefined, list: () => [] } as unknown as SidecarDeps["jobs"],
    cache: {} as SidecarDeps["cache"],
    scanner: { startScan: () => "", isRunning: () => false },
    direct: {
      updateRaindropUrl: vi.fn(async () => ({ ok: true, data: { id: 1 } })),
    },
  };
  app = createApp(deps, { localToken: "test-token" });
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

  it("DELETE /:id renvoie deleted:true (→ corbeille)", async () => {
    const list = (await (await req(app, "/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
    const res = await req(app, `/api/raindrops/${list.items[0]!.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { deleted: boolean }).toEqual({ deleted: true });
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
    const deps = {
      mcp: (tool: string, args: Record<string, unknown>) => connSpy.call(tool, args),
      state: () => "connected" as const,
      restart: async () => undefined,
      jobs: { get: () => undefined, list: () => [] } as unknown as SidecarDeps["jobs"],
      cache: {} as SidecarDeps["cache"],
      scanner: { startScan: () => "", isRunning: () => false },
      direct: { updateRaindropUrl: async () => ({ ok: true as const, data: { id: 1 } }) },
    };
    const app2 = createApp(deps as SidecarDeps, { localToken: "t" });
    const res = await req(app2, "/api/raindrops/bulk", {
      method: "POST",
      body: JSON.stringify({ operation: "move", collection_id: 0, ids: [1000, 1001], to_collection_id: 101 }),
    }, "t");
    expect(res.status).toBe(200);
    expect(spy[0]).toEqual(["bulk_raindrops", { operation: "move", collection_id: 0, ids: [1000, 1001], to_collection_id: 101 }]);
  });
});
