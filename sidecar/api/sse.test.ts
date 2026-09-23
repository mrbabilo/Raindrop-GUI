import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { JobStore, type JobHandle } from "../jobs/store.js";
import { jobSse } from "./sse.js";

// Un job TERMINÉ AVANT l'abonnement (audit du 2026-09-23). Le front fait
// `POST` (jobId) PUIS `GET /events` : entre les deux, un job court — doublons
// sur un cache chaud, revérification de zéro URL, échec immédiat — a déjà
// émis son terme. Sans rejeu, le flux se fermait sans `done`/`error`, et la
// promesse de suivi du front ne se réglait JAMAIS : « Analyse en cours » à
// perpétuité, bouton bloqué, résultat jamais relu.
const ecouter = async (store: JobStore, job: JobHandle): Promise<string> => {
  const app = new Hono();
  app.get("/e", (c) => jobSse(job, c, () => store.getResult(job.id)));
  return (await app.request("/e")).text();
};

describe("jobSse — le terme d'un job fini avant l'abonnement est rejoué", () => {
  it("done : le RÉSULTAT sérialisé, comme en direct", async () => {
    const store = new JobStore();
    const job = store.create("scan-duplicates", 0);
    job.finish({ groupes: 3 });
    const flux = await ecouter(store, job);
    expect(flux).toContain("event: done");
    expect(flux).toContain('data: {"groupes":3}');
  });

  it("error : le message", async () => {
    const store = new JobStore();
    const job = store.create("scan-links", 0);
    job.fail("MCP déconnecté");
    const flux = await ecouter(store, job);
    expect(flux).toContain("event: error");
    expect(flux).toContain("MCP déconnecté");
  });

  it("cancelled", async () => {
    const store = new JobStore();
    const job = store.create("backup", 0);
    job.cancel();
    expect(await ecouter(store, job)).toContain("event: cancelled");
  });

  // Témoin du chemin EN DIRECT (passait avant le correctif) : le rejeu ne
  // doit pas doubler le terme d'un job encore en vol à l'abonnement.
  it("un job qui finit en cours de flux : un seul terme", async () => {
    const store = new JobStore();
    const job = store.create("scan-links", 2);
    setTimeout(() => job.finish({ ok: true }), 50);
    const flux = await ecouter(store, job);
    expect(flux.match(/event: done/g)).toHaveLength(1);
  });
});
