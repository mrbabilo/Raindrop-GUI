import { describe, it, expect, vi, afterEach } from "vitest";
import { makeRestClient } from "./raindropRest.js";

afterEach(() => vi.unstubAllGlobals());

describe("raindropRest (abstraction de secours)", () => {
  it("PUT {url} sur /raindrop/:id avec Bearer", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ item: { id: 7, link: "https://nvelle.example" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeRestClient({ token: "rd-token" });
    const out = await client.updateRaindropUrl(7, "https://nvelle.example");
    expect(out).toEqual({ ok: true, data: { id: 7 } });
    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe("https://api.raindrop.io/rest/v1/raindrop/7");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://nvelle.example" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer rd-token");
  });

  // Task 0b : la Task 0 appelait POST /raindrops/unrestore — 404 en réel
  // (vérifié 2026-09-16). La seule voie vivante est PUT /raindrops/-99 avec
  // une destination obligatoire (corps {ids, collection:{$id}}).
  it("unrestore PUT {ids, collection} sur /raindrops/-99 avec Bearer", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeRestClient({ token: "rd-token" });
    const out = await client.unrestore([7, 9], 42);
    expect(out).toEqual({ ok: true, data: { restored: 2 } });
    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe("https://api.raindrop.io/rest/v1/raindrops/-99");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ ids: [7, 9], collection: { $id: 42 } });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer rd-token");
  });

  it("unrestore classe un 4xx/5xx en RAINDROP_API avec le code HTTP", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 413 })));
    const out = await makeRestClient({ token: "t" }).unrestore([1], 42);
    expect(out).toMatchObject({ ok: false, code: "RAINDROP_API" });
    expect((out as { message: string }).message).toContain("413");
  });

  it("classe un 4xx/5xx en RAINDROP_API avec le code HTTP", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const out = await makeRestClient({ token: "t" }).updateRaindropUrl(1, "https://x.example");
    expect(out).toMatchObject({ ok: false, code: "RAINDROP_API" });
    expect((out as { message: string }).message).toContain("429");
  });

  it("classe une erreur réseau en RAINDROP_API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    const out = await makeRestClient({ token: "t" }).updateRaindropUrl(1, "https://x.example");
    expect(out).toMatchObject({ ok: false, code: "RAINDROP_API" });
  });
});
