import { describe, it, expect, vi } from "vitest";
import { Throttle } from "./throttle.js";

describe("Throttle", () => {
  it("sérialise et espace les appels d'au moins minIntervalMs", async () => {
    const t = new Throttle(50);
    const starts: number[] = [];
    const job = (n: number) => async () => {
      starts.push(Date.now());
      return n;
    };
    const [a, b, c] = await Promise.all([t.run(job(1)), t.run(job(2)), t.run(job(3))]);
    expect([a, b, c]).toEqual([1, 2, 3]);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(45); // marge timer
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(45);
  });

  it("ne compte pas le temps d'exécution dans l'intervalle", async () => {
    const t = new Throttle(30);
    const slow = async () => {
      await new Promise((r) => setTimeout(r, 80));
      return "ok";
    };
    const p1 = t.run(slow);
    const start = Date.now();
    await t.run(async () => "second");
    await p1;
    // le 2e démarre après la FIN du 1er (sérialisation), pas 30 ms après son DÉBUT
    expect(Date.now() - start).toBeGreaterThanOrEqual(75);
  });

  it("propage l'erreur sans bloquer la suite", async () => {
    const t = new Throttle(1);
    await expect(t.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(t.run(async () => 42)).resolves.toBe(42);
    expect(t.pendingCount).toBe(0);
  });

  it("les timers d'espacement sont libérés après usage (pas de fuite vitest)", async () => {
    vi.useFakeTimers();
    const t = new Throttle(100);
    const p = t.run(async () => 1);
    await vi.advanceTimersByTimeAsync(150);
    await expect(p).resolves.toBe(1);
    vi.useRealTimers();
  });
});
