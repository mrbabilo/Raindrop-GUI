import { repertoireTemporaire } from "../testing/tmp.js";
import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import { connectFake } from "../testing/fakeServer.js";
import { McpConnection } from "../mcp/connection.js";
import { JobStore } from "../jobs/store.js";
import { AnalysisCache } from "./cache.js";
import { Scanner } from "./scanner.js";
import type { CheckOutcome } from "./linkchecker.js";

function makeCheck(fakeStatuses: Map<string, CheckOutcome["status"]>) {
  return async (url: string): Promise<CheckOutcome> => ({
    url,
    status: fakeStatuses.get(url) ?? "ok",
    httpStatus: fakeStatuses.get(url) === "dead" ? 404 : 200,
    redirectChain: null,
    finalUrl: null,
    redirectKind: null,
    reason: fakeStatuses.get(url) === "dead" ? "http_404" : null,
  });
}

describe("Scanner", () => {
  let conn: McpConnection;
  let store: JobStore;
  let cache: AnalysisCache;
  let file: string;

  beforeEach(async () => {
    const fake = await connectFake({ raindropCount: 25 });
    conn = McpConnection.fromClient(fake.client);
    store = new JobStore();
    file = join(repertoireTemporaire("scan-"), "analysis.json");
    cache = await AnalysisCache.load(file);
  });

  const mcpCaller = (tool: string, args: Record<string, unknown>) => conn.call(tool, args);

  it("scan-links complet : progression, cache, dernière URL du job", async () => {
    const scanner = new Scanner({
      mcp: mcpCaller,
      jobs: store,
      cache,
      check: makeCheck(new Map()),
      concurrency: 5,
      ttlDays: 30,
    });
    const jobId = scanner.startScan("links");
    const snap = await waitForStatus(store, jobId, ["done"]);
    expect(snap.status).toBe("done");
    expect(snap.progress.done).toBe(27); // 25 + 2 doublons fixture
    // cache peuplé : 27 résultats uniques par URL
    const results = cache.allResults();
    expect(results.length).toBeGreaterThanOrEqual(25);
    expect(cache.lastScan("links")).toBeTruthy();
  });

  it("scan incrémental : ne re-checke que le stale", async () => {
    let checked = 0;
    const countingCheck = async (url: string) => {
      checked++;
      return makeCheck(new Map())(url);
    };
    const scanner = new Scanner({ mcp: mcpCaller, jobs: store, cache, check: countingCheck, concurrency: 5, ttlDays: 30 });
    scanner.startScan("links");
    await waitForStatus(store, store.list()[0]!.id, ["done"]);
    const first = checked;
    expect(first).toBeGreaterThan(0);

    // 2e scan immédiat : tout est frais → aucun re-check
    const jobId2 = scanner.startScan("links");
    await waitForStatus(store, jobId2, ["done"]);
    expect(checked).toBe(first);
  });

  it("scan-duplicates trouve les doublons fixture", async () => {
    const scanner = new Scanner({ mcp: mcpCaller, jobs: store, cache, check: makeCheck(new Map()), concurrency: 5, ttlDays: 30 });
    const jobId = scanner.startScan("duplicates");
    await waitForStatus(store, jobId, ["done"]);
    const groups = cache.getGroups();
    // fixtures : 1 doublon exact (copie) + 1 copie normalisée
    expect(groups.exact.length + groups.normalized.length).toBeGreaterThanOrEqual(1);
    expect(cache.lastScan("duplicates")).toBeTruthy();
  });

  it("annulation : statut cancelled, cache partiel sauvé", async () => {
    let seen = 0;
    const slowCheck = async (url: string) => {
      seen++;
      await new Promise((r) => setTimeout(r, 30));
      return makeCheck(new Map())(url);
    };
    const scanner = new Scanner({ mcp: mcpCaller, jobs: store, cache, check: slowCheck, concurrency: 1, ttlDays: 30 });
    const jobId = scanner.startScan("links");
    // annule dès les premiers résultats
    const snap = await new Promise<ReturnType<typeof store.get>>((resolve) => {
      const id = setInterval(() => {
        const s = store.get(jobId)!;
        if (s.progress.done >= 2) {
          clearInterval(id);
          store.getHandle(jobId)!.cancel();
          const check = () => {
            const s2 = store.get(jobId)!;
            if (s2.status !== "running") resolve(s2);
            else setTimeout(check, 10);
          };
          check();
        }
      }, 10);
    });
    expect(snap!.status).toBe("cancelled");
    expect(seen).toBeLessThan(27);
    expect(cache.allResults().length).toBeGreaterThan(0); // partiel mais persisté
  });

  it("isRunning empêche un double scan du même type", async () => {
    const scanner = new Scanner({
      mcp: mcpCaller, jobs: store, cache,
      check: async (url) => { await new Promise((r) => setTimeout(r, 50)); return makeCheck(new Map())(url); },
      concurrency: 1, ttlDays: 30,
    });
    scanner.startScan("links");
    expect(() => scanner.startScan("links")).toThrow(/déjà en cours/);
    await waitForStatus(store, store.list()[0]!.id, ["done"]);
  });
});

async function waitForStatus(store: JobStore, id: string, statuses: string[]) {
  return new Promise<NonNullable<ReturnType<typeof store.get>>>((resolve, reject) => {
    const check = () => {
      const s = store.get(id);
      if (!s) return reject(new Error("job absent"));
      if (statuses.includes(s.status)) return resolve(s);
      if (s.status === "error") return reject(new Error(s.error ?? "job error"));
      setTimeout(check, 10);
    };
    check();
  });
}
