import { describe, it, expect } from "vitest";
import { createApp } from "../app.js";
import type { SidecarDeps } from "../deps.js";
import { JobStore } from "../../jobs/store.js";
import type { Sauvegarde } from "../../backup/sauvegarde.js";

const TOKEN = "t";

const deps = (jobs: JobStore, sauvegarde?: Sauvegarde): SidecarDeps => ({
  mcp: async () => ({ ok: true as const, data: {} }),
  state: () => "connected",
  restart: async () => undefined,
  jobs,
  cache: {} as SidecarDeps["cache"],
  scanner: {} as SidecarDeps["scanner"],
  origins: {} as SidecarDeps["origins"],
  direct: {} as SidecarDeps["direct"],
  ...(sauvegarde ? { sauvegarde } : {}),
});

const req = async (
  hono: ReturnType<typeof createApp>,
  path: string,
  init?: RequestInit,
): Promise<Response> =>
  hono.request(path, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } });

describe("routes sauvegarde", () => {
  // CONTRAT 6 — sans BACKUP_DIR la sauvegarde est inactive et LE DIT. Ni un
  // 500, ni un 404 : le sélecteur de dossier viendra du shell Tauri, d'ici là
  // l'absence de dossier est un état normal, pas une panne.
  it("sans dossier configuré, GET /api/backup/status rend un état explicite", async () => {
    const app = createApp(deps(new JobStore()), { localToken: TOKEN });
    const res = await req(app, "/api/backup/status");
    expect(res.status).toBe(200);
    const corps = (await res.json()) as { actif: boolean; raison: string };
    expect(corps.actif).toBe(false);
    expect(corps.raison).toMatch(/BACKUP_DIR/);
  });

  it("sans dossier configuré, POST /api/backup/run refuse lisiblement (400)", async () => {
    const app = createApp(deps(new JobStore()), { localToken: TOKEN });
    const res = await req(app, "/api/backup/run", { method: "POST", body: JSON.stringify({ mode: "complet" }) });
    expect(res.status).toBe(400);
    const corps = (await res.json()) as { error: { code: string; message: string } };
    expect(corps.error.code).toBe("INVALID_INPUT");
    expect(corps.error.message).toMatch(/BACKUP_DIR/);
  });

  it("GET /api/backup/status rend le statut de la sauvegarde configurée", async () => {
    const statut = { actif: true, dossier: "/d", dernier: null, instantanes: 0 };
    const app = createApp(deps(new JobStore(), { statut: async () => statut } as Sauvegarde), {
      localToken: TOKEN,
    });
    const res = await req(app, "/api/backup/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(statut);
  });

  it("POST /api/backup/run lance un job SSE et rend son identifiant", async () => {
    const jobs = new JobStore();
    const modes: string[] = [];
    const sauvegarde = {
      enCours: () => false,
      executer: async (mode: string) => {
        modes.push(mode);
        return { horodatage: "h", complet: true, count: 1, watermark: "w", empreintes: {} };
      },
    } as unknown as Sauvegarde;
    const app = createApp(deps(jobs, sauvegarde), { localToken: TOKEN });
    const res = await req(app, "/api/backup/run", { method: "POST", body: JSON.stringify({ mode: "incremental" }) });
    expect(res.status).toBe(202);
    const { jobId } = (await res.json()) as { jobId: string };
    expect(jobs.get(jobId)).toBeDefined();
    await new Promise((r) => setTimeout(r, 0));
    expect(modes).toEqual(["incremental"]); // le mode demandé, pas un défaut
    expect(jobs.get(jobId)?.status).toBe("done");
  });

  // La route sœur des scans (`/api/analysis/scan`) refuse déjà un second scan
  // concurrent. Deux balayages en vol partageraient horodatage et fichier, et
  // doubleraient la charge contre le plafond de 120 requêtes/min.
  it("une sauvegarde déjà en cours : POST /run refuse (400) sans en lancer une seconde", async () => {
    let lancements = 0;
    const sauvegarde = {
      enCours: () => true,
      executer: async () => {
        lancements++;
        return { horodatage: "h", complet: true, count: 1, watermark: "w", empreintes: {} };
      },
    } as unknown as Sauvegarde;
    const app = createApp(deps(new JobStore(), sauvegarde), { localToken: TOKEN });
    const res = await req(app, "/api/backup/run", { method: "POST", body: JSON.stringify({ mode: "complet" }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/déjà en cours/);
    expect(lancements).toBe(0); // rien n'a été lancé : l'assertion qui porte
  });

  it("POST /api/backup/run refuse un mode inconnu", async () => {
    const app = createApp(deps(new JobStore(), { enCours: () => false } as Sauvegarde), { localToken: TOKEN });
    const res = await req(app, "/api/backup/run", { method: "POST", body: JSON.stringify({ mode: "partiel" }) });
    expect(res.status).toBe(400);
  });
});
