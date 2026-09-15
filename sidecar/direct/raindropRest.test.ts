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
