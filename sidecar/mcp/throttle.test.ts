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

  it("un fn qui lève de façon synchrone ne bloque pas la file", async () => {
    const t = new Throttle(0);
    await expect(t.run(() => { throw new Error("sync"); })).rejects.toThrow("sync");
    await expect(t.run(async () => 7)).resolves.toBe(7);
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

  it("l'interactif passe devant le fond déjà en attente", async () => {
    const t = new Throttle(0);
    const ordre: string[] = [];
    // Une tâche occupe la file, les deux suivantes s'empilent derrière.
    const bloque = t.run(async () => { await new Promise((r) => setTimeout(r, 20)); ordre.push("bloque"); });
    const fond = t.run(async () => { ordre.push("fond"); }, { rang: "fond" });
    const interactif = t.run(async () => { ordre.push("interactif"); });
    await Promise.all([bloque, fond, interactif]);
    expect(ordre).toEqual(["bloque", "interactif", "fond"]);
  });

  // Le plancher (spec §4.4, correction §1bis n°3) : sans lui, une application
  // utilisée sans interruption affamerait la sauvegarde et le balayage
  // hebdomadaire n'aboutirait jamais.
  it("le fond progresse même sous charge interactive continue", async () => {
    const t = new Throttle(0);
    const ordre: string[] = [];
    const fini: Promise<unknown>[] = [];
    // 12 interactives empilées d'un coup, puis 3 de fond derrière elles.
    for (let i = 0; i < 12; i++) fini.push(t.run(async () => { ordre.push("i"); }));
    for (let i = 0; i < 3; i++) fini.push(t.run(async () => { ordre.push("f"); }, { rang: "fond" }));
    await Promise.all(fini);
    // Une sur quatre au moins : les trois tâches de fond sont servies avant
    // la fin des douze interactives, pas reléguées à la queue.
    const derniereF = ordre.lastIndexOf("f");
    expect(derniereF).toBeLessThan(ordre.length - 1);
    expect(ordre.filter((x) => x === "f")).toHaveLength(3);
  });

  it("sans rang précisé, le comportement d'avant est inchangé", async () => {
    const t = new Throttle(0);
    const ordre: number[] = [];
    await Promise.all([1, 2, 3].map((n) => t.run(async () => { ordre.push(n); })));
    expect(ordre).toEqual([1, 2, 3]);
  });
});
