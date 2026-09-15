import { describe, it, expect } from "vitest";
import { connectFake } from "../testing/fakeServer.js";
import { McpConnection } from "../mcp/connection.js";
import { fetchLibrarySnapshot } from "./snapshot.js";

describe("fetchLibrarySnapshot", () => {
  it("pagine jusqu'à count avec per_page 50", async () => {
    const { client } = await connectFake({ raindropCount: 120 }); // + 2 doublons fixture
    const conn = McpConnection.fromClient(client);
    const pages: number[] = [];
    const out = await fetchLibrarySnapshot(
      (tool, args) => {
        pages.push((args as { page: number }).page);
        return conn.call(tool, args);
      },
      {},
    );
    await conn.close();
    expect(out.items.length).toBe(122);
    expect(out.cancelled).toBe(false);
    expect(pages[0]).toBe(0);
    expect(pages.length).toBe(3); // 50 + 50 + 22
  });

  it("annulation : arrêt propre avec cancelled:true", async () => {
    const { client } = await connectFake({ raindropCount: 120 });
    const conn = McpConnection.fromClient(client);
    const out = await fetchLibrarySnapshot(
      (tool, args) => conn.call(tool, args),
      { isCancelled: () => true },
    );
    await conn.close();
    expect(out.cancelled).toBe(true);
    expect(out.items.length).toBe(0);
  });

  it("erreur tool → throw avec le code", async () => {
    const { client } = await connectFake({ failTools: ["search_raindrops"] });
    const conn = McpConnection.fromClient(client);
    await expect(
      fetchLibrarySnapshot((tool, args) => conn.call(tool, args), {}),
    ).rejects.toThrow(/RAINDROP_API/);
    await conn.close();
  });
});
