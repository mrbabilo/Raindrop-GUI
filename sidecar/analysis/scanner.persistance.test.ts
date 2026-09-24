//! La persistance du cache pendant un scan de liens (optimisation du
//! 2026-09-24). Mesuré sur un cache de la taille réelle (12 210 signets) :
//! un `save()` sérialise ~6 Mo et bloque la boucle d'événements ~55 ms. Au
//! rythme « tous les 20 résultats », un scan complet en faisait 611 — ~34 s
//! de CPU bloquant (l'API locale ne répond plus à l'interface pendant ce
//! temps) et ~3,6 Go écrits. La persistance périodique existe pour qu'une
//! coupure ne perde pas tout : un intervalle de TEMPS suffit à ce contrat.

import { repertoireTemporaire } from "../testing/tmp.js";
import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import { connectFake } from "../testing/fakeServer.js";
import { McpConnection } from "../mcp/connection.js";
import { JobStore } from "../jobs/store.js";
import { AnalysisCache } from "./cache.js";
import { Scanner } from "./scanner.js";
import type { CheckOutcome } from "./linkchecker.js";

const ok = async (url: string): Promise<CheckOutcome> => ({
  url, status: "ok", httpStatus: 200, redirectChain: null, finalUrl: null, redirectKind: null, reason: null,
});

async function attendreFin(store: JobStore, id: string) {
  for (;;) {
    const s = store.get(id);
    if (s && s.status !== "running") return s;
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("Scanner — persistance cadencée dans le temps", () => {
  let conn: McpConnection;
  let cache: AnalysisCache;
  let saves: number;

  beforeEach(async () => {
    const fake = await connectFake({ raindropCount: 100 });
    conn = McpConnection.fromClient(fake.client);
    cache = await AnalysisCache.load(join(repertoireTemporaire("persist-"), "analysis.json"));
    saves = 0;
    const vrai = cache.save.bind(cache);
    cache.save = () => { saves++; return vrai(); };
  });

  const scanner = (maintenant: () => number) =>
    new Scanner({ mcp: (t, a) => conn.call(t, a), jobs: new JobStore(), cache, check: ok, concurrency: 5, ttlDays: 30, maintenant });

  it("un scan qui ne dure pas l'intervalle n'écrit qu'à la fin", async () => {
    const s = scanner(() => 0); // l'horloge ne bouge pas : ~100 résultats en un instant
    const store = (s as unknown as { deps: { jobs: JobStore } }).deps.jobs;
    const fin = await attendreFin(store, s.startScan("links"));
    expect(fin.status).toBe("done");
    expect(fin.progress.done).toBeGreaterThan(60); // non-vacuité : des dizaines de résultats
    expect(saves).toBe(1);
  });

  it("un scan long persiste encore ses résultats partiels, une fois par intervalle", async () => {
    let t = 0;
    const s = scanner(() => (t += 20_000)); // chaque lecture d'horloge avance de 20 s
    const store = (s as unknown as { deps: { jobs: JobStore } }).deps.jobs;
    await attendreFin(store, s.startScan("links"));
    expect(saves).toBeGreaterThan(2); // des saves périodiques, en plus du final
  });
});
