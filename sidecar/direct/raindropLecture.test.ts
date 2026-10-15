import { describe, it, expect } from "vitest";
import { makeRestClient } from "./raindropRest.js";

describe("lecture de secours : seul un 404 confirme un signet introuvable", () => {
  it.each([404, 401, 403, 429, 500])("HTTP %s", async (status) => {
    const client = makeRestClient({ token: "test", fetchImpl: async () => new Response(null, { status }) });
    const out = await client.getRaindrop(42);
    expect(out).toMatchObject({ ok: false, code: status === 404 ? "SIGNET_INTROUVABLE" : status === 429 ? "RATE_LIMITED" : "RAINDROP_API" });
  });
  it("une erreur réseau ne confirme aucune disparition", async () => {
    const client = makeRestClient({ token: "test", fetchImpl: async () => { throw new TypeError("offline"); } });
    expect(await client.getRaindrop(42)).toMatchObject({ ok: false, code: "RAINDROP_API" });
  });
  it("une réponse retrouvée est retournée sans deuxième lecture", async () => {
    const item = { _id: 42, title: "Retrouvé" };
    const client = makeRestClient({ token: "test", fetchImpl: async () => Response.json({ result: true, item }) });
    expect(await client.getRaindrop(42)).toEqual({ ok: true, data: item });
  });
  it("une réponse 200 invalide n'est pas un 404", async () => {
    const client = makeRestClient({ token: "test", fetchImpl: async () => Response.json({ result: false }) });
    expect(await client.getRaindrop(42)).toMatchObject({ ok: false, code: "RAINDROP_API" });
  });
});
