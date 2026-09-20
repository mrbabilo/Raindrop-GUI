import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { createApp } from "./app.js";
import type { SidecarDeps } from "./deps.js";
import { connectFake } from "../testing/fakeServer.js";
import { McpConnection } from "../mcp/connection.js";

let conn: McpConnection;

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 25 });
  conn = McpConnection.fromClient(fake.client);
});
afterEach(async () => conn.close());

function makeDeps(overrides?: Partial<SidecarDeps>): SidecarDeps {
  // Le spread d'un Partial rend chaque clé optionnelle aux yeux de TS, alors
  // que la base ci-dessous est complète : l'union est totale au runtime, le
  // `as` ne masque donc rien que l'appelant ne maîtrise déjà.
  return {
    mcp: (tool, args, timeoutMs) => conn.call(tool, args, timeoutMs),
    state: () => "connected",
    restart: async () => undefined,
    jobs: { get: () => undefined, list: () => [] } as unknown as SidecarDeps["jobs"],
    cache: {} as SidecarDeps["cache"],
    scanner: { startScan: () => "", isRunning: () => false } as unknown as SidecarDeps["scanner"],
    direct: {
      updateRaindropUrl: async () => ({ ok: true as const, data: { id: 1 } }),
      unrestore: async () => ({ ok: true as const, data: { restored: 0 } }),
    },
    origins: {
      remember: async () => undefined,
      take: async () => ({ known: new Map(), unknown: [] }),
      forget: async () => undefined,
      flush: async () => undefined,
    } as unknown as SidecarDeps["origins"],
    journal: { info: () => undefined, warn: () => undefined, error: () => undefined },
    logsDir: "/non-existant",
    ...overrides,
  } as SidecarDeps;
}

const appFor = (deps?: Partial<SidecarDeps>) =>
  createApp(makeDeps(deps), { localToken: "test-token" });

const get = (app: Hono, path: string, token = "test-token") =>
  app.request(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe("app", () => {
  it("refuse sans Bearer (401)", async () => {
    const res = await get(appFor(), "/api/health", "");
    expect(res.status).toBe(401);
  });

  it("refuse un mauvais token (401)", async () => {
    const res = await get(appFor(), "/api/health", "wrong");
    expect(res.status).toBe(401);
  });

  it("refuse une origine non locale (403, spec §3.7)", async () => {
    const res = await appFor().request("/api/health", {
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  it("GET /api/health reflète l'état MCP", async () => {
    const res = await get(appFor(), "/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; mcp: string };
    expect(body.mcp).toBe("connected");
  });

  it("les erreurs MCP sont converties en erreur uniforme (503 sur crash)", async () => {
    const app = appFor({
      mcp: async () => ({ ok: false, code: "MCP_CRASHED", message: "subprocess mort" }),
    });
    const res = await get(app, "/api/user");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("MCP_CRASHED");
  });

  it("POST /api/mcp/restart appelle le restart", async () => {
    let called = false;
    const app = appFor({ restart: async () => { called = true; } });
    // Adaptation brief : l'endpoint reste derrière l'auth Bearer (spec §3.7,
    // le code du brief le monte après le middleware) → le test fournit le token.
    const res = await app.request("/api/mcp/restart", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    });
    expect(res.status).toBe(200);
    expect(called).toBe(true);
  });

  it("POST /api/mcp/restart en échec → 503 MCP_CRASHED (erreur uniforme)", async () => {
    const app = appFor({ restart: async () => { throw new Error("reconnexion impossible"); } });
    const res = await app.request("/api/mcp/restart", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("MCP_CRASHED");
    expect(body.error.message).toBe("reconnexion impossible");
  });

  it("preflight OPTIONS depuis une origine Tauri → 204 + headers CORS", async () => {
    const res = await appFor().request("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: "tauri://localhost",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("tauri://localhost");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PATCH, DELETE, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Authorization, Content-Type");
    expect(res.headers.get("Access-Control-Max-Age")).toBe("86400");
  });

  it("GET avec Origin Tauri → header ACAO présent (sans origine : aucun header CORS)", async () => {
    const res = await appFor().request("/api/health", {
      headers: { Origin: "tauri://localhost", Authorization: "Bearer test-token" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("tauri://localhost");

    const noOrigin = await get(appFor(), "/api/health");
    expect(noOrigin.status).toBe(200);
    expect(noOrigin.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
