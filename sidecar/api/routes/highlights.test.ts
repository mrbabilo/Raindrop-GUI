import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Hono } from "hono";
import { createApp, type SidecarDeps } from "../app.js";
import { connectFake } from "../../testing/fakeServer.js";
import { McpConnection } from "../../mcp/connection.js";

// Forme brute d'un highlight Raindrop telle que renvoyée par get_highlights
// (tableau nu) : _id (pas id) compris — la conversion _id→id reste côté front.
type HighlightRaw = { _id: number; text: string; note: string; color: string };

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
// → chaque requête du test fournit le token local (même motif que tags.test.ts).
const TOKEN = "test-token";
const req = (hono: Hono, path: string, init?: RequestInit, token: string = TOKEN): Promise<Response> =>
  hono.request(path, { ...init, headers: { Authorization: `Bearer ${token}` } });

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 9 });
  conn = McpConnection.fromClient(fake.client);
  app = createApp(deps(conn), { localToken: "test-token" });
});
afterEach(async () => conn.close());

describe("routes highlights", () => {
  // Réponse MCP réelle de get_highlights : tableau nu (getHighlights finit par
  // ok(data.items) dans le code compilé épinglé 1.3.1), jamais {items: [...]}.
  // La route doit l'envelopper pour le front (Task 8 lit raw.items.map(...)).
  it("GET /:id enveloppe le tableau nu du MCP en {items} — items tels quels, _id compris", async () => {
    const hl: HighlightRaw = { _id: 7, text: "passage surligné", note: "une note", color: "yellow" };
    const hlDeps: SidecarDeps = {
      ...deps(conn),
      mcp: async (tool) =>
        tool === "get_highlights"
          ? { ok: true, data: [hl] }
          : { ok: false, code: "RAINDROP_API", message: "tool inattendu dans ce test" },
    };
    const hlApp = createApp(hlDeps, { localToken: "test-token" });
    const res = await req(hlApp, "/api/highlights/42");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: HighlightRaw[] };
    expect(body.items).toEqual([hl]);
    expect(body.items[0]!._id).toBe(7);
  });

  // Régression : même famille que collections/tags (7c) — l'ancienne enveloppe
  // fausse {items: [...]} ne doit pas passer silencieusement.
  it("échoue bruyamment (502) si get_highlights renvoie un objet au lieu d'un tableau nu", async () => {
    const badDeps: SidecarDeps = {
      ...deps(conn),
      mcp: async (tool) =>
        tool === "get_highlights"
          ? { ok: true, data: { items: [] } }
          : { ok: true, data: [] },
    };
    const badApp = createApp(badDeps, { localToken: "test-token" });
    const res = await req(badApp, "/api/highlights/42");
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; tool?: string } };
    expect(body.error.code).toBe("RAINDROP_API");
    expect(body.error.tool).toBe("get_highlights");
  });
});
