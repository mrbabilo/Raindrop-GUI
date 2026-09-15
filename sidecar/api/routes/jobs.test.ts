import { describe, it, expect } from "vitest";
import { createApp, type SidecarDeps } from "../app.js";
import { JobStore } from "../../jobs/store.js";

const deps = (jobs: JobStore): SidecarDeps => ({
  mcp: async () => ({ ok: true as const, data: {} }),
  state: () => "connected",
  restart: async () => undefined,
  jobs,
  cache: {} as SidecarDeps["cache"],
  scanner: { startScan: () => "", isRunning: () => false },
  direct: { updateRaindropUrl: async () => ({ ok: true as const, data: { id: 1 } }) },
});

// Adaptation brief : l'API locale est derrière l'auth Bearer (Task 7, spec §3.7)
// → chaque requête du test fournit le token local (même motif que collections.test.ts).
const TOKEN = "t";
const req = (hono: ReturnType<typeof createApp>, path: string, init?: RequestInit): Promise<Response> =>
  hono.request(path, { ...init, headers: { Authorization: `Bearer ${TOKEN}` } });

describe("routes jobs", () => {
  it("GET /api/jobs/:id renvoie le snapshot", async () => {
    const store = new JobStore();
    const job = store.create("scan-links", 10);
    const app = createApp(deps(store), { localToken: TOKEN });
    const res = await req(app, `/api/jobs/${job.id}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("running");
  });

  it("GET /:id/events stream progress puis done en SSE", async () => {
    const store = new JobStore();
    const job = store.create("scan-links", 2);
    const app = createApp(deps(store), { localToken: TOKEN });
    const res = await req(app, `/api/jobs/${job.id}/events`);
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    job.progress(1, 2, "a");
    job.finish({ total: 2 });
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: progress");
    expect(text).toContain("\"done\":1");
    await reader.cancel();
  });

  it("POST /:id/cancel annule", async () => {
    const store = new JobStore();
    const job = store.create("x", 10);
    const app = createApp(deps(store), { localToken: TOKEN });
    const res = await req(app, `/api/jobs/${job.id}/cancel`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(store.get(job.id)!.status).toBe("cancelled");
  });
});
