import { describe, it, expect, vi, afterEach } from "vitest";
import { makeRestClient } from "./raindropRest.js";

afterEach(() => vi.unstubAllGlobals());

describe("raindropRest (abstraction de secours)", () => {
  // Le 2026-09-22, sondé EN RÉEL : PUT {url} répond 200 result:true en
  // IGNORANT le champ — le signet restait inchangé. Le champ documenté de
  // l'API est `link` (developer.raindrop.io, PUT /raindrop/{id}).
  it("PUT {link} (champ documenté) sur /raindrop/:id avec Bearer", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ result: true, item: { id: 7, link: "https://nvelle.example" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeRestClient({ token: "rd-token" });
    const out = await client.updateRaindropUrl(7, "https://nvelle.example");
    expect(out).toEqual({ ok: true, data: { id: 7 } });
    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe("https://api.raindrop.io/rest/v1/raindrop/7");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ link: "https://nvelle.example" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer rd-token");
  });

  // Un 200 n'est PAS un succès : l'API ignore en silence les champs qu'elle
  // ne connaît pas. Le seul verdict est ce que le corps dit avoir appliqué.
  it("un 200 dont item.link ≠ URL demandée est un ÉCHEC (champ ignoré)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: true, item: { id: 7, link: "https://ancienne.example" } }), { status: 200 })));
    const out = await makeRestClient({ token: "t" }).updateRaindropUrl(7, "https://nvelle.example");
    expect(out).toMatchObject({ ok: false, code: "RAINDROP_API" });
    expect((out as { message: string }).message).toContain("https://nvelle.example");
  });

  it("un 200 result:false est un échec", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: false, item: null }), { status: 200 })));
    const out = await makeRestClient({ token: "t" }).updateRaindropUrl(7, "https://x.example");
    expect(out).toMatchObject({ ok: false, code: "RAINDROP_API" });
  });

  it("un corps ni JSON ni conforme est un échec, pas un succès", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>gateway</html>", { status: 200 })));
    const out = await makeRestClient({ token: "t" }).updateRaindropUrl(7, "https://x.example");
    expect(out).toMatchObject({ ok: false, code: "RAINDROP_API" });
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

  // Le statut ne suffit pas ici non plus : la doc de PUT /raindrops ne
  // montre même pas de corps d'exemple (routes voisines : result:true).
  // Garde TOLÉRANTE — un result:false EXPLICITE est un échec ; tout le
  // reste (corps vide, forme inconnue) reste un succès, car durcir sans
  // connaître la forme réelle casserait une restauration vérifiée en réel.
  it("unrestore : un 200 result:false explicite est un échec", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: false }), { status: 200 })));
    const out = await makeRestClient({ token: "t" }).unrestore([1], 42);
    expect(out).toMatchObject({ ok: false, code: "RAINDROP_API" });
  });

  it("unrestore : un 200 au corps vide reste un succès (forme non documentée)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    const out = await makeRestClient({ token: "t" }).unrestore([1], 42);
    expect(out).toEqual({ ok: true, data: { restored: 1 } });
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
