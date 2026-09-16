import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Hono } from "hono";
import { createApp, type SidecarDeps } from "../app.js";
import { connectFake } from "../../testing/fakeServer.js";
import { McpConnection } from "../../mcp/connection.js";
import type { Collection } from "../../../../shared/types.js";

let conn: McpConnection;
let app: Hono;
const deps = (c: McpConnection): SidecarDeps => ({
  mcp: (tool, args, t) => c.call(tool, args, t),
  state: () => "connected",
  restart: async () => undefined,
  jobs: { get: () => undefined, list: () => [] } as unknown as SidecarDeps["jobs"],
  cache: {} as SidecarDeps["cache"],
  scanner: { startScan: () => "", isRunning: () => false },
  direct: { updateRaindropUrl: async () => ({ ok: true as const, data: { id: 1 } }) },
});

// Adaptation brief : l'API locale est derrière l'auth Bearer (Task 7, spec §3.7)
// → chaque requête du test fournit le token local (même motif que raindrops.test.ts).
const TOKEN = "test-token";
const req = (hono: Hono, path: string, init?: RequestInit, token: string = TOKEN): Promise<Response> =>
  hono.request(path, { ...init, headers: { Authorization: `Bearer ${token}` } });

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 12 });
  conn = McpConnection.fromClient(fake.client);
  app = createApp(deps(conn), { localToken: "test-token" });
});
afterEach(async () => conn.close());

describe("routes collections", () => {
  it("GET / fusionne root et children", async () => {
    const res = await req(app, "/api/collections");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Collection[] };
    const ids = body.items.map((c) => c.id);
    expect(ids).toContain(101);
    expect(ids).toContain(201);
    const child = body.items.find((c) => c.id === 201)!;
    expect(child.parentId).toBe(101);
  });

  it("POST / crée une collection imbriquée (201)", async () => {
    const res = await req(app, "/api/collections", {
      method: "POST",
      body: JSON.stringify({ title: "Nouvelle", parent_id: 101 }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as Collection).parentId).toBe(101);
  });

  it("POST /cleanup passe le confirm au tool", async () => {
    const res = await req(app, "/api/collections/cleanup", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    });
    expect(res.status).toBe(200);
  });

  // Régression : l'incident d'origine (Task 7c) venait d'une lecture `.items`
  // sur une réponse MCP qui est en réalité un tableau nu. Si `{items: [...]}`
  // (l'ancienne enveloppe fausse) réapparaît un jour, ce test doit le voir.
  it("échoue bruyamment (502) si le MCP renvoie {items:[...]} au lieu d'un tableau nu", async () => {
    const badDeps: SidecarDeps = {
      ...deps(conn),
      mcp: async (tool) =>
        tool === "get_collections"
          ? { ok: true, data: { items: [] } }
          : { ok: true, data: [] },
    };
    const badApp = createApp(badDeps, { localToken: "test-token" });
    const res = await req(badApp, "/api/collections");
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("RAINDROP_API");
  });
});
