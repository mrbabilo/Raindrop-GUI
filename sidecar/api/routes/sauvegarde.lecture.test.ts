import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createApp } from "../app.js";
import type { SidecarDeps } from "../deps.js";
import { JobStore } from "../../jobs/store.js";
import { Throttle } from "../../mcp/throttle.js";
import { makeArchivage } from "../../backup/archivage.js";
import { repertoireTemporaire } from "../../testing/tmp.js";

const TOKEN = "t";

// Même motif que sauvegarde.test.ts : les deps factices, l'archivage RÉEL —
// la lecture ne passe par le réseau à aucun moment, seul le dossier compte.
const deps = (archivage?: SidecarDeps["archivage"]): SidecarDeps => ({
  mcp: async () => ({ ok: true as const, data: {} }),
  state: () => "connected",
  restart: async () => undefined,
  jobs: new JobStore(),
  cache: {} as SidecarDeps["cache"],
  scanner: {} as SidecarDeps["scanner"],
  origins: {} as SidecarDeps["origins"],
  smartlists: {} as SidecarDeps["smartlists"],
  direct: {} as SidecarDeps["direct"],
  journal: { info: () => undefined, warn: () => undefined, error: () => undefined },
  logsDir: "/non-existant",
  ...(archivage ? { archivage } : {}),
});

const req = async (
  hono: ReturnType<typeof createApp>,
  path: string,
  init?: RequestInit,
): Promise<Response> =>
  hono.request(path, { ...init, headers: { Authorization: `Bearer ${TOKEN}` } });

// Un archivage RÉEL posé sur un dossier temporaire — `makeArchivage` dérive
// `dossierArchives` de `dossier`, exactement comme en production.
const archivageReel = () => {
  const rep = repertoireTemporaire("lecture-route-");
  return { archivage: makeArchivage({ token: "j", dossier: rep, file: new Throttle(0) }), rep };
};

const poserArchive = async (rep: string, id: number, octets: Buffer): Promise<void> => {
  const dossier = join(rep, "archives");
  await mkdir(dossier, { recursive: true });
  await writeFile(join(dossier, `${id}.html.gz`), octets);
};

const original = "<html><body><p>article fidèle</p></body></html>";

describe("GET /api/backup/archives/:id/content", () => {
  it("sans dossier configuré, refuse lisiblement (400, BACKUP_DIR)", async () => {
    const app = createApp(deps(), { localToken: TOKEN });
    const res = await req(app, "/api/backup/archives/42/content");
    expect(res.status).toBe(400);
    const corpsJson = (await res.json()) as { error: { code: string; message: string } };
    expect(corpsJson.error.code).toBe("INVALID_INPUT");
    expect(corpsJson.error.message).toMatch(/BACKUP_DIR/);
  });

  it("un identifiant non entier est refusé AVANT de construire un nom de fichier", async () => {
    const { archivage } = archivageReel();
    const app = createApp(deps(archivage), { localToken: TOKEN });
    const res = await req(app, "/api/backup/archives/abc/content");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INVALID_INPUT");
  });

  it("sert le HTML décompressé FIDÈLE, en text/html, daté par X-Archive-Date", async () => {
    const { archivage, rep } = archivageReel();
    await poserArchive(rep, 42, gzipSync(Buffer.from(original)));
    const app = createApp(deps(archivage), { localToken: TOKEN });
    const res = await req(app, "/api/backup/archives/42/content");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe(original);
    const date = res.headers.get("x-archive-date");
    expect(date).not.toBeNull();
    expect(Number.isNaN(new Date(date!).getTime())).toBe(false);
  });

  it("404 ARCHIVE_ABSENTE sur identifiant sans archive (spec lecture §5)", async () => {
    const { archivage, rep } = archivageReel();
    await poserArchive(rep, 42, gzipSync(Buffer.from(original)));
    const app = createApp(deps(archivage), { localToken: TOKEN });
    // Prouver d'abord que l'objet DEVAIT être absent : 42 existe, 99 non.
    const presente = await req(app, "/api/backup/archives/42/content");
    expect(presente.status).toBe(200);
    const res = await req(app, "/api/backup/archives/99/content");
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("ARCHIVE_ABSENTE");
  });

  it("la garde de 64 Mo répond 413 ARCHIVE_TROP_VOLUMINEUSE, avec sa raison", async () => {
    const { archivage, rep } = archivageReel();
    const vrai = gzipSync(Buffer.from(original));
    const annonce = Buffer.from(vrai);
    annonce.writeUInt32LE(65 * 2 ** 20, annonce.length - 4);
    await poserArchive(rep, 42, annonce);
    const app = createApp(deps(archivage), { localToken: TOKEN });
    const res = await req(app, "/api/backup/archives/42/content");
    expect(res.status).toBe(413);
    const corpsJson = (await res.json()) as { error: { code: string; message: string } };
    expect(corpsJson.error.code).toBe("ARCHIVE_TROP_VOLUMINEUSE");
    expect(corpsJson.error.message).toMatch(/64 Mo/);
  });

  it("un gz corrompu interrompt le flux SANS planter le serveur", async () => {
    const { archivage, rep } = archivageReel();
    const vrai = gzipSync(Buffer.from("<html>" + "x".repeat(400) + "</html>"));
    const faux = Buffer.from(vrai);
    faux.fill(0x00, 10, faux.length - 8);
    faux.writeUInt32LE(400, faux.length - 4);
    await poserArchive(rep, 42, faux);
    const app = createApp(deps(archivage), { localToken: TOKEN });
    const res = await req(app, "/api/backup/archives/42/content");
    expect(res.status).toBe(200); // les contrôles à froid passent : ça casse à mi-flux
    await expect(res.text()).rejects.toThrow();
    // Le serveur SURVIT — « un refus, pas un plantage » (spec lecture §6).
    const apres = await req(app, "/api/backup/archives/99/content");
    expect(apres.status).toBe(404);
  });

  it("l'origine du webview peut LIRE X-Archive-Date (exposée par CORS)", async () => {
    // Sans « Access-Control-Expose-Headers », les en-têtes non simples sont
    // masqués au JS même sur une 200 : le rail perdrait sa date en réel,
    // là où un test sans Origin ne verrait jamais le défaut.
    const { archivage, rep } = archivageReel();
    await poserArchive(rep, 42, gzipSync(Buffer.from(original)));
    const app = createApp(deps(archivage), { localToken: TOKEN });
    const res = await app.request("/api/backup/archives/42/content", {
      headers: { Authorization: `Bearer ${TOKEN}`, Origin: "tauri://localhost" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-expose-headers")).toContain("X-Archive-Date");
  });
});
