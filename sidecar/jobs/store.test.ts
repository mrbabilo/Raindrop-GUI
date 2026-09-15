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
