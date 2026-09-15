import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { McpLifecycle } from "./lifecycle.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const tsx = fileURLToPath(new URL("../../node_modules/.bin/tsx", import.meta.url));

function fixtureFactory(mode: string, backoff = 50) {
  return {
    create: async () => {
      const t = new StdioClientTransport({
        command: tsx,
        args: [`${here}../testing/fixtureStdio.ts`, mode],
        env: { ...process.env } as Record<string, string>,
        stderr: "pipe",
      });
      return t;
    },
  };
}

describe("McpLifecycle", () => {
  it("démarre sain : health-check listTools passe", async () => {
    const lc = new McpLifecycle({ factory: fixtureFactory("healthy"), restartBackoffMs: 50 });
    await lc.start();
    expect(lc.state).toBe("connected");
    const out = await lc.call<{ email: string }>("get_user", {});
    expect(out.ok).toBe(true);
    await lc.stop();
    expect(lc.state).toBe("stopped");
  }, 20000);

  it("redémarre automatiquement après un crash du subprocess", async () => {
    const lc = new McpLifecycle({ factory: fixtureFactory("crash-after-connect"), restartBackoffMs: 50 });
    await lc.start();
    // le fixture s'arrête 200 ms après connect → restart auto attendu
    await new Promise((r) => setTimeout(r, 1500));
    expect(lc.state).toBe("connected");
    const out = await lc.call<{ id: number }>("get_user", {});
    expect(out.ok).toBe(true);
    await lc.stop();
  }, 20000);

  it("passe en crashed après maxRestarts échecs et call renvoie MCP_CRASHED", async () => {
    let attempts = 0;
    const failingFactory = {
      create: async () => {
        attempts++;
        throw new Error("spawn impossible (simulé)");
      },
    };
    const lc = new McpLifecycle({
      factory: failingFactory,
      maxRestarts: 2,
      restartBackoffMs: 20,
    });
    await expect(lc.start()).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 100));
    expect(lc.state).toBe("crashed");
    const out = await lc.call("get_user", {});
    expect(out).toMatchObject({ ok: false, code: "MCP_CRASHED" });
    expect(attempts).toBeGreaterThanOrEqual(3); // initial + 2 restarts
  }, 20000);

  it("restart() manuel répare un état crashed", async () => {
    const lc = new McpLifecycle({
      factory: fixtureFactory("healthy"),
      maxRestarts: 0,
      restartBackoffMs: 20,
    });
    await lc.start();
    await lc.stop();
    await lc.restart();
    expect(lc.state).toBe("connected");
    await lc.stop();
  }, 20000);

  // nettoyage : spawn() importé seulement pour forcer le keep-alive du process
  void spawn;
});
