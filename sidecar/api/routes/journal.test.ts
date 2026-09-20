import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createApp } from "../app.js";
import type { SidecarDeps } from "../deps.js";
import { JobStore } from "../../jobs/store.js";
import { repertoireTemporaire } from "../../testing/tmp.js";

const TOKEN = "t";
const aujourdhui = () => new Date().toISOString().slice(0, 10);

const deps = (logsDir: string): SidecarDeps => ({
  mcp: async () => ({ ok: true as const, data: {} }),
  state: () => "connected",
  restart: async () => undefined,
  jobs: new JobStore(),
  cache: {} as SidecarDeps["cache"],
  scanner: {} as SidecarDeps["scanner"],
  origins: {} as SidecarDeps["origins"],
  direct: {} as SidecarDeps["direct"],
  journal: { info: () => undefined, warn: () => undefined, error: () => undefined },
  logsDir,
});

const req = async (
  hono: ReturnType<typeof createApp>,
  path: string,
): Promise<Response> =>
  hono.request(path, { headers: { Authorization: `Bearer ${TOKEN}` } });

describe("GET /api/journal", () => {
  it("rend les entrées du jour, parsées (le Bearer est exigé par le middleware global)", async () => {
    const logs = repertoireTemporaire("journal-route-");
    await mkdir(logs, { recursive: true });
    await writeFile(
      join(logs, `sidecar-${aujourdhui()}.jsonl`),
      JSON.stringify({ ts: "2026-09-20T10:00:00Z", level: "info", msg: "corbeille", id: 12 }) + "\n",
      "utf8",
    );
    const app = createApp(deps(logs), { localToken: TOKEN });
    const res = await req(app, "/api/journal");
    expect(res.status).toBe(200);
    const corps = (await res.json()) as { entries: { msg: string; id: number }[] };
    expect(corps.entries).toHaveLength(1);
    expect(corps.entries[0]).toMatchObject({ msg: "corbeille", id: 12 });
  });

  it("sans fichier du jour : 200 avec liste vide — jamais une erreur", async () => {
    const app = createApp(deps(repertoireTemporaire("journal-vide-")), { localToken: TOKEN });
    const res = await req(app, "/api/journal");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { entries: unknown[] }).entries).toEqual([]);
  });
});
