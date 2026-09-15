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

  it("échoue selon failTools avec le préfixe 'Error: '", async () => {
    const { client } = await connectFake({ failTools: ["get_user"] });
    const res = await client.callTool({ name: "get_user", arguments: {} });
    const text = (res.content as [{ type: string; text: string }])[0]!.text;
    expect(text.startsWith("Error: ")).toBe(true);
  });
});
