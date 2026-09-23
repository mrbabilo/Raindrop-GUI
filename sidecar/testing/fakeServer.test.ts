import { describe, it, expect } from "vitest";
import { connectFake } from "./fakeServer.js";

describe("fake MCP server", () => {
  it("liste les tools et répond au search", async () => {
    const { client, fixtures } = await connectFake({ raindropCount: 30 });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("search_raindrops");

    const res = await client.callTool({ name: "search_raindrops", arguments: { per_page: 10 } });
    const text = (res.content as [{ type: string; text: string }])[0]!.text;
    const data = JSON.parse(text) as { count: number; items: unknown[] };
    // 30 demandés + 2 doublons fixture = 32 — le count du vrai package inclut tout
    expect(data.count).toBe(32);
    expect(data.items).toHaveLength(10);
    expect(fixtures.raindrops.length).toBeGreaterThan(30);
  });

  // Fidélité : le vrai tool transmet `sort` à l'API. Un faux qui l'ignore
  // rend aveugle tout test d'un appelant qui en dépend (audit 2026-09-23).
  it("honore `sort: created` (croissant) et `-created` (décroissant)", async () => {
    const { client } = await connectFake({ raindropCount: 30 });
    const lire = async (sort: string) => {
      const res = await client.callTool({ name: "search_raindrops", arguments: { per_page: 50, sort } });
      const text = (res.content as [{ type: string; text: string }])[0]!.text;
      return (JSON.parse(text) as { items: { created: string }[] }).items.map((i) => i.created);
    };
    const croissant = await lire("created");
    expect(croissant).toEqual([...croissant].sort());
    expect(croissant[0]).not.toBe(croissant[croissant.length - 1]); // les dates varient bien
    const decroissant = await lire("-created");
    expect(decroissant).toEqual([...croissant].reverse());
  });

  it("échoue selon failTools avec le préfixe 'Error: '", async () => {
    const { client } = await connectFake({ failTools: ["get_user"] });
    const res = await client.callTool({ name: "get_user", arguments: {} });
    const text = (res.content as [{ type: string; text: string }])[0]!.text;
    expect(text.startsWith("Error: ")).toBe(true);
  });
});
