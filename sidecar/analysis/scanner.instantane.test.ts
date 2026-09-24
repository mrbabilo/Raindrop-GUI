//! L'instantané de bibliothèque PARTAGÉ entre analyses (optimisation du
//! 2026-09-24). Chaque analyse relisait toute la bibliothèque — ~245
//! requêtes dans la file à 550 ms, ~2 min 15 sur 12 210 signets — même quand
//! l'autre venait de le faire. Un instantané complet se réutilise 10 min,
//! tant que l'application n'a rien écrit depuis.

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

async function fin(store: JobStore, id: string) {
  for (;;) {
    const s = store.get(id);
    if (s && s.status !== "running") return s;
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("Scanner — instantané partagé", () => {
  let conn: McpConnection;
  let store: JobStore;
  let cache: AnalysisCache;
  let lectures: number;
  let t: number;
  let pendantLecture: (() => void) | null;

  beforeEach(async () => {
    const fake = await connectFake({ raindropCount: 60 });
    conn = McpConnection.fromClient(fake.client);
    store = new JobStore();
    cache = await AnalysisCache.load(join(repertoireTemporaire("instantane-"), "analysis.json"));
    lectures = 0;
    t = 0;
    pendantLecture = null;
  });

  const scanner = () =>
    new Scanner({
      mcp: async (outil, args) => {
        if (outil === "search_raindrops") {
          lectures++;
          pendantLecture?.();
        }
        return conn.call(outil, args);
      },
      jobs: store, cache, check: ok, concurrency: 5, ttlDays: 30, maintenant: () => t,
    });

  it("témoin : la première analyse lit la bibliothèque", async () => {
    const s = scanner();
    expect((await fin(store, s.startScan("links"))).status).toBe("done");
    expect(lectures).toBeGreaterThan(0);
  });

  it("la seconde analyse, dans la foulée, réutilise l'instantané : AUCUNE relecture", async () => {
    const s = scanner();
    await fin(store, s.startScan("links"));
    const apres = lectures;
    expect((await fin(store, s.startScan("duplicates"))).status).toBe("done");
    expect(lectures).toBe(apres);
    expect(cache.lastScan("duplicates")).toBeTruthy();
  });

  it("une écriture de l'application depuis l'instantané le périme", async () => {
    const s = scanner();
    await fin(store, s.startScan("links"));
    const apres = lectures;
    s.invaliderInstantane();
    await fin(store, s.startScan("duplicates"));
    expect(lectures).toBeGreaterThan(apres);
  });

  it("passé 10 minutes, on relit", async () => {
    const s = scanner();
    await fin(store, s.startScan("links"));
    const apres = lectures;
    t += 10 * 60_000 + 1;
    await fin(store, s.startScan("duplicates"));
    expect(lectures).toBeGreaterThan(apres);
  });

  it("une écriture PENDANT la lecture : l'instantané n'est pas retenu", async () => {
    const s = scanner();
    let une = true;
    pendantLecture = () => { if (une) { une = false; s.invaliderInstantane(); } };
    await fin(store, s.startScan("links"));
    pendantLecture = null;
    const apres = lectures;
    await fin(store, s.startScan("duplicates"));
    expect(lectures).toBeGreaterThan(apres);
  });
});
