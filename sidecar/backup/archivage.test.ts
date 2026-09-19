import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { repertoireTemporaire } from "../testing/tmp.js";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { Throttle } from "../mcp/throttle.js";
import { makeArchivage, type ResultatArchivage } from "./archivage.js";
import { archiver as archiverReel, type archiver } from "./archives.js";
import type { JobHandle } from "../jobs/store.js";

const dir = () => repertoireTemporaire("backup-archivage-");
let api: FauxApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

const svc = (dossier: string, file: Throttle = new Throttle(0)) =>
  makeArchivage({ token: "j", baseUrl: `http://127.0.0.1:${api!.port}/rest/v1`, file, dossier });

describe("archivage — plusieurs identifiants", () => {
  it("archive chaque identifiant : les fichiers .html.gz existent, gzippés", async () => {
    api = await startFauxApi([]);
    const dossier = dir();
    const r = await svc(dossier).archiver([10, 11, 12]);
    expect(r).toEqual<ResultatArchivage>({ demandes: 3, faits: 3, echecs: [], annule: false, nonTentes: 0 });
    for (const id of [10, 11, 12]) {
      const octets = await readFile(join(dossier, "archives", `${id}.html.gz`));
      expect(octets.subarray(0, 3)).toEqual(Buffer.from([0x1f, 0x8b, 0x08]));
      expect(gunzipSync(octets).toString()).toContain("archive");
    }
  });

  // Test 2 du brief : un échec au MILIEU ne doit interrompre ni les
  // identifiants qui le précèdent ni ceux qui le suivent. `sansCache` fait
  // vraiment échouer 11 sur le faux serveur HTTP (404 sans Location) — pas un
  // `fetchImpl` mocké qui ne prouverait rien de l'API.
  it("un échec au milieu n'interrompt pas les suivants", async () => {
    api = await startFauxApi([]);
    api.sansCache(11);
    const dossier = dir();
    const r = await svc(dossier).archiver([10, 11, 12]);
    expect(r.demandes).toBe(3);
    expect(r.faits).toBe(3); // les 3 ont été TENTÉS jusqu'au bout
    expect(r.annule).toBe(false);
    expect(r.echecs).toEqual([{ id: 11, raison: expect.stringContaining("404") }]);
    // 10 et 12 sont bel et bien archivés malgré l'échec de 11 entre les deux.
    await readFile(join(dossier, "archives", "10.html.gz"));
    await readFile(join(dossier, "archives", "12.html.gz"));
    await expect(readFile(join(dossier, "archives", "11.html.gz"))).rejects.toThrow();
  });

  // Ronde de correction 1 : `archiver()` ne PROMET nulle part qu'elle ne
  // lève jamais — elle absorbe simplement tout aujourd'hui dans son propre
  // try/catch (`archives.ts`). La promesse « un échec n'interrompt pas les
  // suivants » ne doit pas dépendre de ce détail d'implémentation voisin :
  // injection d'un `archiverImpl` qui LÈVE pour un identifiant précis,
  // plutôt qu'une mutilation d'`archives.ts` qui prouverait autre chose.
  it("un archiver() qui LÈVE (pas ok:false) n'interrompt pas les suivants non plus", async () => {
    api = await startFauxApi([]);
    const dossier = dir();
    const archiverQuiLeve: typeof archiverReel = async (args) => {
      if (args.raindropId === 11) throw new Error("panne injectée");
      return archiverReel(args);
    };
    const a = makeArchivage({
      token: "j",
      baseUrl: `http://127.0.0.1:${api.port}/rest/v1`,
      file: new Throttle(0),
      dossier,
      archiverImpl: archiverQuiLeve,
    });
    const r = await a.archiver([10, 11, 12]);
    expect(r.faits).toBe(3);
    expect(r.annule).toBe(false);
    expect(r.echecs).toEqual([{ id: 11, raison: expect.stringContaining("panne injectée") }]);
    await readFile(join(dossier, "archives", "10.html.gz"));
    await readFile(join(dossier, "archives", "12.html.gz"));
    await expect(readFile(join(dossier, "archives", "11.html.gz"))).rejects.toThrow();
  });

  // Test 3 du brief : l'annulation arrête la boucle, rend `annule: true`, et
  // ce qui était déjà écrit reste sur disque.
  it("l'annulation arrête la boucle, en laissant sur disque ce qui était déjà écrit", async () => {
    api = await startFauxApi([]);
    const dossier = dir();
    let vues = 0;
    const job = {
      progress: () => {
        vues++;
      },
      isCancelled: () => vues >= 1, // annulé dès que le premier a été tenté
    } as unknown as JobHandle;
    const r = await svc(dossier).archiver([10, 11, 12], job);
    expect(r.annule).toBe(true);
    expect(r.faits).toBe(1);
    expect(r.demandes).toBe(3); // la demande initiale, elle, ne bouge pas
    await readFile(join(dossier, "archives", "10.html.gz")); // acquis
    await expect(readFile(join(dossier, "archives", "11.html.gz"))).rejects.toThrow();
    await expect(readFile(join(dossier, "archives", "12.html.gz"))).rejects.toThrow();
  });

  // Test 4 du brief : la réentrance.
  it("un second appel est refusé pendant que le premier tourne", async () => {
    api = await startFauxApi([]);
    const dossier = dir();
    const a = svc(dossier);
    expect(a.enCours()).toBe(false);
    const p1 = a.archiver([10, 11]);
    expect(a.enCours()).toBe(true);
    await expect(a.archiver([12])).rejects.toThrow(/déjà en cours/);
    await p1;
    expect(a.enCours()).toBe(false);
  });

  // Test 5 du brief (la route) vit dans sidecar/api/routes/sauvegarde.test.ts,
  // à côté des autres tests de cette route.

  // Test 6 du brief : le rang "fond" est bien celui demandé à la file
  // partagée — pas l'"interactif" par défaut, qui gèlerait l'interface
  // pendant un archivage en lot (§ « le rang de la file »). Le rang vient de
  // `archiver()` (archives.ts) : ce test verrouille le comportement observé
  // à travers CE câblage, pas une ligne nouvelle de ce fichier.
  it("chaque identifiant passe par la file au rang \"fond\"", async () => {
    api = await startFauxApi([]);
    const rangs: Array<"interactif" | "fond" | undefined> = [];
    const espion = {
      run: <T>(fn: () => Promise<T>, o?: { rang?: "interactif" | "fond" }) => {
        rangs.push(o?.rang);
        return fn();
      },
    };
    const dossier = dir();
    const a = makeArchivage({
      token: "j",
      baseUrl: `http://127.0.0.1:${api.port}/rest/v1`,
      file: espion,
      dossier,
    });
    await a.archiver([10, 11]);
    expect(rangs).toEqual(["fond", "fond"]);
  });
});

// Le budget, et pourquoi la boucle s'arrête.
//
// La route accepte 500 identifiants : à la moyenne mesurée (3,18 Mo), c'est
// ~1,6 Go d'un seul geste, soit un tiers du budget. Les écrire tous ferait
// évincer par ancienneté ce que l'utilisateur tenait à garder, sans qu'il
// l'ait demandé.
describe("archivage — le budget arrête la boucle, et le dit", () => {
  it("budget plein d'avance : rien n'est tenté, et le motif est nommé", async () => {
    const dossier = repertoireTemporaire("archivage-budget-");
    const archives = join(dossier, "archives");
    await mkdir(archives, { recursive: true });
    await writeFile(join(archives, "1.html.gz"), Buffer.alloc(1_000));
    let tentes = 0;
    const a = makeArchivage({
      token: "j", dossier, file: new Throttle(0), budgetOctets: 500,
      archiverImpl: (async () => {
        tentes++;
        return { ok: true as const, chemin: "x", octets: 10 };
      }) as unknown as typeof archiver,
    });
    const r = await a.archiver([7, 8, 9]);
    expect(tentes).toBe(0);
    expect(r.nonTentes).toBe(3);
    expect(r.faits).toBe(0);
    // Pas dans `echecs` : ils n'ont pas échoué, ils n'ont pas été essayés.
    expect(r.echecs).toEqual([]);
    expect(r.raisonArret ?? "").toMatch(/budget/);
  });

  it("le budget se remplit EN COURS : les premiers passent, les suivants non", async () => {
    // L'essentiel : le total suit les écritures. Un budget évalué une seule
    // fois au départ laisserait passer les 500.
    const dossier = repertoireTemporaire("archivage-budget2-");
    const a = makeArchivage({
      token: "j", dossier, file: new Throttle(0), budgetOctets: 250,
      archiverImpl: (async () => ({ ok: true as const, chemin: "x", octets: 100 })) as unknown as typeof archiver,
    });
    const r = await a.archiver([1, 2, 3, 4, 5]);
    expect(r.faits).toBe(3); // 100, 200, 300 → le 4e trouve 300 ≥ 250
    expect(r.nonTentes).toBe(2);
  });

  it("réarchiver un identifiant REMPLACE — le total ne gonfle pas", async () => {
    // Sans la soustraction de l'ancienne taille, réarchiver les mêmes signets
    // ferait croire le budget plein sur un total imaginaire, et l'archivage
    // s'arrêterait sans raison.
    const dossier = repertoireTemporaire("archivage-budget3-");
    const archives = join(dossier, "archives");
    await mkdir(archives, { recursive: true });
    await writeFile(join(archives, "1.html.gz"), Buffer.alloc(100));
    const a = makeArchivage({
      token: "j", dossier, file: new Throttle(0), budgetOctets: 250,
      archiverImpl: (async () => ({ ok: true as const, chemin: "x", octets: 100 })) as unknown as typeof archiver,
    });
    // Le MÊME identifiant six fois : le total doit rester à 100, jamais monter.
    const r = await a.archiver([1, 1, 1, 1, 1, 1]);
    expect(r.faits).toBe(6);
    expect(r.nonTentes).toBe(0);
  });
});
