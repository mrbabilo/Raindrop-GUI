import { describe, it, expect } from "vitest";
import { JobStore, runJob } from "./store.js";

describe("JobStore", () => {
  it("crée, met à jour la progression, termine", async () => {
    const store = new JobStore();
    const job = runJob(store, "scan-links", 10, async (j) => {
      j.progress(5, 10, "mi-chemin");
      return { checked: 10 };
    });
    const snap = await new Promise<ReturnType<typeof job.snapshot>>((resolve) => {
      const unsub = job.subscribe((evt) => {
        if (evt.kind === "done") resolve(job.snapshot());
      });
      void unsub;
    });
    expect(snap.status).toBe("done");
    expect(snap.progress).toMatchObject({ done: 5, total: 10, label: "mi-chemin" });
    expect(store.get(job.id)?.status).toBe("done");
  });

  it("un échec de la fonction passe le job en error avec le message", async () => {
    const store = new JobStore();
    const job = runJob(store, "x", 1, async () => { throw new Error("réseau coupé"); });
    await new Promise((r) => job.subscribe((evt) => evt.kind === "error" && r(null)));
    const snap = store.get(job.id)!;
    expect(snap.status).toBe("error");
    expect(snap.error).toContain("réseau coupé");
  });

  it("cancel() est visible depuis isCancelled() et passe le statut", async () => {
    const store = new JobStore();
    const job = store.create("x", 100);
    let sawCancel = false;
    const work = (async () => {
      while (!job.isCancelled()) await new Promise((r) => setTimeout(r, 5));
      sawCancel = true;
      job.finish();
    })();
    setTimeout(() => job.cancel(), 20);
    await work;
    expect(sawCancel).toBe(true);
    expect(store.get(job.id)!.status).toBe("cancelled");
  });

  it("liste limitée aux 50 derniers jobs", () => {
    const store = new JobStore();
    for (let i = 0; i < 60; i++) store.create("x", 1).finish();
    expect(store.list().length).toBe(50);
  });
});

describe("runJob — le journal du job", () => {
  const journal = () => {
    const entrees: { msg: string; champs?: Record<string, unknown> }[] = [];
    return {
      log: {
        info: (msg: string, champs?: Record<string, unknown>) => { entrees.push({ msg, champs }); },
        warn: (msg: string, champs?: Record<string, unknown>) => { entrees.push({ msg, champs }); },
        error: (msg: string, champs?: Record<string, unknown>) => { entrees.push({ msg, champs }); },
      },
      entrees,
    };
  };

  it("un job heureux : lancé puis terminé, avec son résultat en champs", async () => {
    const { log, entrees } = journal();
    const store = new JobStore();
    runJob(store, "dedupe", 2, async () => ({ corbeille: 2 }), log);
    await new Promise((r) => setTimeout(r, 0));
    expect(entrees.map((e) => e.msg)).toEqual(["job lancé", "job terminé"]);
    expect(entrees[0]?.champs).toEqual({ type: "dedupe", total: 2 });
    expect(entrees[1]?.champs).toMatchObject({ type: "dedupe", resultat: { corbeille: 2 } });
  });

  it("un job en échec : « job en échec » avec la raison", async () => {
    const { log, entrees } = journal();
    const store = new JobStore();
    runJob(store, "backup", 1, async () => { throw new Error("réseau coupé"); }, log);
    await new Promise((r) => setTimeout(r, 0));
    expect(entrees).toHaveLength(2);
    expect(entrees[1]).toMatchObject({ msg: "job en échec", champs: { type: "backup", err: "réseau coupé" } });
  });

  it("un résultat qui porte annule:true se lit « job annulé »", async () => {
    const { log, entrees } = journal();
    const store = new JobStore();
    runJob(store, "dedupe", 3, async () => ({ corbeille: 1, annule: true }), log);
    await new Promise((r) => setTimeout(r, 0));
    expect(entrees.map((e) => e.msg)).toEqual(["job lancé", "job annulé"]);
  });

  it("sans journal, rien ne casse — les appels existants n'en passent pas", async () => {
    const store = new JobStore();
    const job = runJob(store, "x", 1, async () => "ok");
    await new Promise((r) => setTimeout(r, 0));
    expect(store.get(job.id)?.status).toBe("done");
  });
});
