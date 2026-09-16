import { describe, it, expect, vi } from "vitest";
import { makeMcpCaller } from "./deps.js";
import type { McpLifecycle } from "../mcp/lifecycle.js";
import type { Throttle } from "../mcp/throttle.js";
import type { CallOutcome } from "../../shared/errors.js";

/** Lifecycle factice : déroule une séquence d'outcomes puis répète la dernière. */
function fakeLifecycle(seq: CallOutcome<unknown>[]) {
  let i = 0;
  const call = vi.fn((_tool: string, _args: Record<string, unknown>, _timeoutMs?: number) =>
    Promise.resolve(seq[Math.min(i++, seq.length - 1)]!),
  );
  return { call, lifecycle: { call } as unknown as McpLifecycle };
}

// Throttle factice : exécution immédiate (l'espacement n'est pas l'objet ici).
const fakeThrottle = {
  run: <T>(fn: () => Promise<T>) => fn(),
} as unknown as Throttle;

const fail = (msg: string): CallOutcome<unknown> => ({ ok: false, code: "RAINDROP_API", message: msg });
const okData = (): CallOutcome<unknown> => ({ ok: true, data: { value: 42 } });

const caller = (seq: CallOutcome<unknown>[]) =>
  makeMcpCaller(fakeLifecycle(seq).lifecycle, fakeThrottle, { retryDelayMs: 1 });

describe("makeMcpCaller — retry des lectures MCP", () => {
  it("READ tool en échec RAINDROP_API → retry unique puis ok", async () => {
    const { call, lifecycle } = fakeLifecycle([fail("erreur raindrop"), okData()]);
    const mcp = makeMcpCaller(lifecycle, fakeThrottle, { retryDelayMs: 1 });
    const res = await mcp("get_tags", { collection_id: 0 });
    expect(res).toEqual(okData());
    expect(call).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenLastCalledWith("get_tags", { collection_id: 0 }, 30_000);
  });

  it("create_raindrop (écriture) en échec → JAMAIS de retry (1 appel)", async () => {
    const { call, lifecycle } = fakeLifecycle([fail("erreur raindrop"), okData()]);
    const mcp = makeMcpCaller(lifecycle, fakeThrottle, { retryDelayMs: 1 });
    const res = await mcp("create_raindrop", { link: "https://example.com" });
    expect(res.ok).toBe(false);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("RAINDROP_API aussi au 2e essai → le résultat du retry est retourné (ko)", async () => {
    const { call, lifecycle } = fakeLifecycle([fail("1re"), fail("2e")]);
    const mcp = makeMcpCaller(lifecycle, fakeThrottle, { retryDelayMs: 1 });
    const res = await mcp("get_user", {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe("2e");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("timeout par appel : opts.timeoutMs s'applique, le paramètre d'appel reste prioritaire", async () => {
    const { call, lifecycle } = fakeLifecycle([okData()]);
    const mcp = makeMcpCaller(lifecycle, fakeThrottle, { timeoutMs: 7_000, retryDelayMs: 1 });
    await mcp("get_user", {});
    expect(call).toHaveBeenLastCalledWith("get_user", {}, 7_000);
    await mcp("get_user", {}, 1_234);
    expect(call).toHaveBeenLastCalledWith("get_user", {}, 1_234);
  });
});
