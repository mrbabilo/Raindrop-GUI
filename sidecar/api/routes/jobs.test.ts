import { describe, it, expect } from "vitest";
import { createApp } from "../app.js";
import type { SidecarDeps } from "../deps.js";
import { JobStore } from "../../jobs/store.js";

const deps = (jobs: JobStore): SidecarDeps => ({
  mcp: async () => ({ ok: true as const, data: {} }),
  state: () => "connected",
  restart: async () => undefined,
  jobs,
  cache: {} as SidecarDeps["cache"],
  scanner: {} as SidecarDeps["scanner"],
  origins: {} as SidecarDeps["origins"],
  smartlists: {} as SidecarDeps["smartlists"],
  journal: { info: () => undefined, warn: () => undefined, error: () => undefined },
  logsDir: "/non-existant",
  direct: {} as SidecarDeps["direct"],
});

// Adaptation brief : l'API locale est derrière l'auth Bearer (Task 7, spec §3.7)
// → chaque requête du test fournit le token local (même motif que collections.test.ts).
const TOKEN = "t";
const req = (hono: ReturnType<typeof createApp>, path: string, init?: RequestInit): Promise<Response> =>
  Promise.resolve(hono.request(path, { ...init, headers: { Authorization: `Bearer ${TOKEN}` } }));

describe("routes jobs", () => {
  // Les jobs EN VOL (spec sélection §3) : un job qu'on n'a pas lancé (boot
  // §4.4, Revue quittée) doit être visible pour être adopté. Le terminé se
  // lit par /:id ; la liste ne montre que ce qui peut être suivi.
  it("GET /api/jobs liste les jobs EN VOL seulement", async () => {
    const store = new JobStore();
    store.create("backup", 10); // running
    const fini = store.create("scan-links", 1);
    fini.finish(); // done → absent de la liste
    const app = createApp(deps(store), { localToken: TOKEN });
    const res = await req(app, "/api/jobs");
    expect(res.status).toBe(200);
    const corps = (await res.json()) as { type: string; status: string }[];
    expect(corps.map((j) => j.type)).toEqual(["backup"]);
  });

  it("GET /api/jobs vide quand rien ne tourne", async () => {
    const app = createApp(deps(new JobStore()), { localToken: TOKEN });
    const res = await req(app, "/api/jobs");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

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
