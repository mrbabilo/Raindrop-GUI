import { describe, it, expect, afterAll } from "vitest";
import { McpConnection, stdioFactory } from "./mcp/connection.js";
import { loadConfig } from "./config.js";

// Activé uniquement si RAINDROP_TEST_TOKEN est défini (spec §8)
const TOKEN = process.env.RAINDROP_TEST_TOKEN;
const d = describe.skipIf(!TOKEN);

const conn = TOKEN
  ? await McpConnection.connect(
      stdioFactory(
        loadConfig({ MCP_RAINDROPIO_TOKEN: TOKEN }).RAINDROP_MCP_ENTRY,
        TOKEN,
      ),
    )
  : null;
afterAll(async () => void (await conn?.close()));

d("intégration réelle (MCP + API Raindrop)", () => {
  it("get_user renvoie le compte", async () => {
    const out = await conn!.call<{ email: string }>("get_user", {}, 30_000);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.data.email).toContain("@");
  });

  it("search_raindrops page 0 (50 items) répond", async () => {
    const out = await conn!.call<{ count: number; items: unknown[] }>(
      "search_raindrops",
      { collection_id: 0, per_page: 50, page: 0 },
      30_000,
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.data.count).toBeGreaterThan(0);
  });
});
