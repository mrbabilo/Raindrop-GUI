import { describe, it, expect, afterEach } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { repertoireTemporaire } from "../testing/tmp.js";
import { makeLecture } from "./lecture.js";
import { Throttle } from "../mcp/throttle.js";
import { makeSauvegarde } from "./sauvegarde.js";
import type { JobHandle } from "../jobs/store.js";

// Le ménage des archives — purge des orphelines, éviction au budget — tourne
// PENDANT un balayage complet, c'est-à-dire pendant une sauvegarde de fond
// que l'utilisateur n'a pas demandée. Le budget de 5 Go tient ~1 600 archives
// à la taille réelle (3,18 Mo en moyenne, contre les 2,1 Mo du calibrage) :
// l'éviction n'est pas un cas limite, elle arrivera. Elle ne doit pas être
// muette.

let api: FauxApi | undefined;
afterEach(async () => { await api?.close(); api = undefined; });

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id: 1000 + i,
    created: `2020-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    lastUpdate: "2026-01-01T00:00:00.000Z",
    title: `t${i}`,
  }));

const sauv = (a: FauxApi, dossier: string, journal: [string, unknown][]) =>
  makeSauvegarde({
    lecture: makeLecture({ token: "j", baseUrl: `http://127.0.0.1:${a.port}/rest/v1`, file: new Throttle(0) }),
    dossier,
    avertir: (m, c) => void journal.push([m, c]),
  });

describe("le ménage des archives ne se fait plus en silence", () => {
  it("une archive orpheline effacée est COMPTÉE et DITE", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("menage-");
    const archives = join(dossier, "archives");
    await mkdir(archives, { recursive: true });
    // 1000 vit (il est dans la bibliothèque), 999999 non.
    await writeFile(join(archives, "1000.html.gz"), Buffer.alloc(10));
    await writeFile(join(archives, "999999.html.gz"), Buffer.alloc(10));
    const journal: [string, unknown][] = [];
    const r = await sauv(api, dossier, journal).executer("balayage");
    expect(r.menage).toEqual({ orphelines: 1, evincees: 0 });
    expect(journal.map(([m]) => m)).toContain("ménage des archives");
  });

  it("rien à faire : `menage` est ABSENT, pas deux zéros", async () => {
    // L'absence ne vaut qu'après avoir montré la présence (test ci-dessus).
    // Deux zéros inventés se liraient comme un fait vérifié — la leçon du
    // `bookmarksCount` à zéro, affiché tel quel par le premier lancement.
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("menage-rien-");
    const journal: [string, unknown][] = [];
    const r = await sauv(api, dossier, journal).executer("balayage");
    expect(r.menage).toBeUndefined();
    expect(journal.map(([m]) => m)).not.toContain("ménage des archives");
  });

  it("balayage ANNULÉ : aucun ménage, donc rien à signaler", async () => {
    // La précondition est déjà en place (`entree.complet`) et protège les
    // archives de 10 000 signets vivants ; on vérifie seulement que le
    // signalement ne fabrique pas un ménage qui n'a pas eu lieu.
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("menage-annule-");
    const archives = join(dossier, "archives");
    await mkdir(archives, { recursive: true });
    await writeFile(join(archives, "999999.html.gz"), Buffer.alloc(10));
    const journal: [string, unknown][] = [];
    const job = { progress: () => undefined, isCancelled: () => true } as unknown as JobHandle;
    const r = await sauv(api, dossier, journal).executer("balayage", job);
    expect(r.complet).toBe(false);
    expect(r.menage).toBeUndefined();
  });
});
