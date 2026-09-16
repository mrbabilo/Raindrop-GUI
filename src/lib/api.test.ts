import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ApiError } from "./api";

// Sous jsdom il n'y a pas de window.RAINDROP_GUI : getConnection() suit la
// branche dev et lit le token de l'env. stubEnv patche process.env ET
// import.meta.env — aucun .env requis, le test reste hermétique.
beforeEach(() => {
  vi.stubEnv("VITE_LOCAL_API_TOKEN", "dev-local-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("api", () => {
  it("get parse le JSON et pose le Bearer", async () => {
    const f = vi.fn(async () => okJson({ items: [], count: 0 }));
    vi.stubGlobal("fetch", f);
    const out = await api.get<{ count: number }>("/api/raindrops", { per_page: 50, important: undefined });
    expect(out.count).toBe(0);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/raindrops?per_page=50"); // undefined filtré
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer dev-local-token");
  });

  it("jette ApiError{code,message} sur erreur uniforme", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "MCP_CRASHED", message: "mort" } }), { status: 503 })));
    const err = await api.get("/api/user").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("MCP_CRASHED");
    expect((err as ApiError).status).toBe(503);
  });

  it("send POST sérialise le body JSON", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ restored: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await api.send("POST", "/api/raindrops/unrestore", { ids: [1] });  // contrat étendu Task 0b : {ids, toCollectionId?}
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ ids: [1] });
  });

  it("préserve code ET statut indépendamment (401 porte INVALID_INPUT)", async () => {
    // Le sidecar classe 401/403 comme INVALID_INPUT : le front ne doit pas
    // dériver le statut du code — les deux sont reportés tels quels.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "INVALID_INPUT", message: "token invalide" } }), { status: 401 })));
    const err = await api.get("/api/collections").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("INVALID_INPUT");
    expect((err as ApiError).status).toBe(401);
    expect((err as ApiError).message).toBe("token invalide");
  });

  it("erreur sans corps JSON → code RAINDROP_API, message http <status>", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("proxy indisponible", { status: 500 })));
    const err = await api.get("/api/user").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("RAINDROP_API");
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).message).toBe("http 500");
  });

  it("get sans query ne produit pas de '?'", async () => {
    const f = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", f);
    await api.get("/api/user");
    const [url] = f.mock.calls[0] as unknown as [string];
    expect(url).toBe("/api/user");
  });

  it("send sans body n'envoie ni corps ni Content-Type", async () => {
    const f = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", f);
    await api.send("DELETE", "/api/raindrops/1000");
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty("Content-Type");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer dev-local-token");
  });
});
