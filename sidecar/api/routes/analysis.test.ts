import { repertoireTemporaire } from "../../testing/tmp.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import type { Hono } from "hono";
import { createApp, type SidecarDeps } from "../app.js";
import { connectFake } from "../../testing/fakeServer.js";
import { McpConnection } from "../../mcp/connection.js";
import { JobStore } from "../../jobs/store.js";
import { AnalysisCache } from "../../analysis/cache.js";
import { Scanner } from "../../analysis/scanner.js";
import type { RaindropItem } from "../../../../shared/types.js";

let conn: McpConnection;
let app: Hono;
let jobs: JobStore;
let cache: AnalysisCache;

// Adaptation brief : l'API locale est derrière l'auth Bearer (Task 7, spec §3.7)
// → chaque requête du test fournit le token local (même motif que app.test.ts).
const TOKEN = "t";
const req = (hono: Hono, path: string, init?: RequestInit): Promise<Response> =>
  hono.request(path, { ...init, headers: { Authorization: `Bearer ${TOKEN}` } });

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 20 });
  conn = McpConnection.fromClient(fake.client);
  jobs = new JobStore();
  cache = await AnalysisCache.load(join(repertoireTemporaire("ra-"), "analysis.json"));
  const scanner = new Scanner({
    mcp: (t, a) => conn.call(t, a),
    jobs,
    cache,
    check: async (url) => ({ url, status: "ok", httpStatus: 200, redirectChain: null, finalUrl: null, redirectKind: null, reason: null }),
    concurrency: 5,
    ttlDays: 30,
  });
  const deps: SidecarDeps = {
    mcp: (t, a, tms) => conn.call(t, a, tms),
    state: () => "connected",
    restart: async () => undefined,
    jobs,
    cache,
    scanner,
    direct: { updateRaindropUrl: async () => ({ ok: true as const, data: { id: 1 } }) },
  };
  app = createApp(deps, { localToken: TOKEN });
});
afterEach(async () => conn.close());

describe("routes analyse", () => {
  it("POST /scan lançe un job, GET /status le reflète une fois terminé", async () => {
    const res = await req(app, "/api/analysis/scan", {
      method: "POST",
      body: JSON.stringify({ type: "duplicates" }),
    });
    expect(res.status).toBe(202);
    const { jobId } = (await res.json()) as { jobId: string };

    let done = false;
    for (let i = 0; i < 200 && !done; i++) {
      const s = (await (await req(app, `/api/jobs/${jobId}`)).json()) as { status: string };
      done = s.status === "done";
      if (!done) await new Promise((r) => setTimeout(r, 25));
    }
    expect(done).toBe(true);

    const status = (await (await req(app, "/api/analysis/status")).json()) as {
      duplicates: { lastScan: string | null; running: boolean };
    };
    expect(status.duplicates.lastScan).toBeTruthy();
    expect(status.duplicates.running).toBe(false);
  });

  it("POST /scan refuse un type inconnu (400)", async () => {
    const res = await req(app, "/api/analysis/scan", { method: "POST", body: JSON.stringify({ type: "magie" }) });
    expect(res.status).toBe(400);
  });

  it("GET /results/duplicates renvoie les groupes", async () => {
    await req(app, "/api/analysis/scan", { method: "POST", body: JSON.stringify({ type: "duplicates" }) });
    await new Promise((r) => setTimeout(r, 400));
    const res = await req(app, "/api/analysis/results/duplicates");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { exact: unknown[]; normalized: unknown[]; fuzzy: unknown[] };
    expect(body).toHaveProperty("exact");
  });

  it("GET /results/links pagine et enrichit du titre", async () => {
    await req(app, "/api/analysis/scan", { method: "POST", body: JSON.stringify({ type: "links" }) });
    await new Promise((r) => setTimeout(r, 600));
    const res = await req(app, "/api/analysis/results/links?page=0&per_page=10");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { title: string; url: string; status: string }[]; total: number };
    expect(body.items.length).toBe(10);
    expect(body.items[0]!.title).toBeTruthy();
  });
});
