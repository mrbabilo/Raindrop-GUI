import { describe, it, expect, afterEach, vi } from "vitest";
import { join } from "node:path";
import { repertoireTemporaire } from "../testing/tmp.js";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { makeLecture } from "./lecture.js";
import { Throttle } from "../mcp/throttle.js";
import { balayerComplet } from "./balayage.js";
import * as instantane from "./instantane.js";

// Correction R3 : `repertoireTemporaire` rend une string, pas une fonction —
// la fabrique évite « dir is not a function » (patron : lockfile.test.ts,
// logger.test.ts).
const dir = () => repertoireTemporaire("backup-balayage-");
let api: FauxApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

const items = (n: number, decalage = 0) =>
  Array.from({ length: n }, (_, i) => ({
    _id: 1000 + i + decalage,
    created: `2020-01-01T00:${String(i % 60).padStart(2, "0")}:00.000Z`,
    lastUpdate: "2026-01-01T00:00:00.000Z",
    title: `t${i}`,
  }));

const deps = (a: FauxApi, nom: string) => ({
  lecture: makeLecture({ token: "j", baseUrl: `http://127.0.0.1:${a.port}/rest/v1`, file: new Throttle(0) }),
  chemin: join(dir(), nom),
  collectionId: 0,
});

describe("balayage complet", () => {
  it("écrit tous les items et rend leurs identifiants", async () => {
    api = await startFauxApi(items(120));
    const r = await balayerComplet(deps(api, "a.jsonl"));
    expect(r.lignes).toBe(120);
    expect(r.ids.size).toBe(120);
    expect(r.complet).toBe(true);
  });

  it("trie par created ASCENDANT — jamais -created", async () => {
    api = await startFauxApi(items(60));
    await balayerComplet(deps(api, "b.jsonl"));
    const requetes = api.appels.filter((a) => a.includes("raindrops"));
    expect(requetes.length).toBeGreaterThan(0);
    // Le sens du tri est porté par l'URL : le vérifier là où il vit.
    expect(api.appels.join("|")).not.toContain("-created");
  });

  // LE test de la correction §1bis n°1. Une suppression en amont pendant le
  // balayage décale la suite vers l'arrière et fait sauter un élément. Le
  // rejeu doit le rattraper — et l'instantané final doit être FIDÈLE, pas
  // seulement déclaré complet.
  it("une suppression passagère est détectée, puis rattrapée par le rejeu", async () => {
    api = await startFauxApi(items(120));
    const d = deps(api, "c.jsonl");
    let pages = 0;
    const lectureEspionne = {
      ...d.lecture,
      page: async (c: number, o: { sort: string; page: number; perpage?: number }) => {
        const p = await d.lecture.page(c, o);
        // Après la PREMIÈRE page du PREMIER passage seulement : la course que
        // l'ordre ascendant ne protège pas. Le rejeu, lui, se déroule au calme.
        if (pages++ === 0) api!.items.splice(0, 1);
        return p;
      },
    };
    const r = await balayerComplet({ ...d, lecture: lectureEspionne });

    expect(r.complet).toBe(true);
    // Le rejeu a EU LIEU : sans cette assertion, le test passerait avec zéro
    // code de détection — il suffirait de ne rien détecter pour le voir vert.
    const pagesZero = api.appels.filter((a) => a.includes("sort=created&page=0"));
    expect(pagesZero).toHaveLength(2);
    // Et l'instantané est fidèle : exactement les identifiants encore en ligne,
    // y compris celui que le premier passage avait sauté.
    const attendus = api.items.map((i) => i._id).sort((a, b) => a - b);
    expect([...r.ids].sort((a, b) => a - b)).toEqual(attendus);
    expect(r.lignes).toBe(attendus.length);
  });

  // L'autre moitié du contrat : quand ça ne se calme pas, on ne ment pas.
  it("une suppression à chaque passage finit déclarée irréconciliable", async () => {
    api = await startFauxApi(items(120));
    const d = deps(api, "c2.jsonl");
    const lectureEspionne = {
      ...d.lecture,
      page: async (c: number, o: { sort: string; page: number; perpage?: number }) => {
        const p = await d.lecture.page(c, o);
        if (o.page === 0) api!.items.splice(0, 1); // à CHAQUE passage
        return p;
      },
    };
    const r = await balayerComplet({ ...d, lecture: lectureEspionne });
    expect(r.complet).toBe(false);
    expect(r.raison).toMatch(/réconciliation/i);
  });

  // Ronde de correction 1 : le décalage AVANT, pas seulement l'arrière. Une
  // restauration depuis la corbeille réinsère un signet avec son `created`
  // D'ORIGINE (pas « maintenant ») : il peut se ranger avant le curseur de
  // lecture (par offset, monotone — il ne repasse jamais dessus), qui ne le
  // lira donc jamais, et un élément déjà vu est relu au passage suivant. Le
  // `count`, lui, ne fait QUE croître (une insertion) : la décroissance reste
  // silencieuse tout du long — c'est la réconciliation par
  // identifiants/cardinalité qui capte le coup, pas elle. Preuve que la
  // décroissance seule NE SUFFIT PAS (complémentaire du test « suppression
  // passagère », qui prouve l'inverse : la cardinalité seule ne suffit pas).
  it("une restauration depuis la corbeille pendant le balayage est détectée (décalage avant)", async () => {
    api = await startFauxApi(items(120));
    const d = deps(api, "g.jsonl");
    let pages = 0;
    const lectureEspionne = {
      ...d.lecture,
      page: async (c: number, o: { sort: string; page: number; perpage?: number }) => {
        const p = await d.lecture.page(c, o);
        // Après la PREMIÈRE page du PREMIER passage seulement, comme pour la
        // suppression passagère : la restauration réelle n'a aucune raison de
        // se reproduire au rejeu.
        if (pages++ === 0) {
          api!.items.push({
            _id: 9999,
            created: "2019-01-01T00:00:00.000Z", // antérieur à tout : se range en tête, avant le curseur.
            lastUpdate: "2026-01-01T00:00:00.000Z",
            title: "restauré",
          });
        }
        return p;
      },
    };
    const r = await balayerComplet({ ...d, lecture: lectureEspionne });

    expect(r.complet).toBe(true);
    // Le rejeu a EU LIEU : sans lui, le signet restauré resterait absent de
    // l'instantané sans qu'on le sache.
    const pagesZero = api.appels.filter((a) => a.includes("sort=created&page=0"));
    expect(pagesZero).toHaveLength(2);
    const attendus = api.items.map((i) => i._id).sort((a, b) => a - b);
    expect([...r.ids].sort((a, b) => a - b)).toEqual(attendus);
    expect(r.ids.has(9999)).toBe(true);
    expect(r.lignes).toBe(attendus.length);
  });

  it("un balayage sans incident se déclare complet, et peut l'affirmer", async () => {
    api = await startFauxApi(items(75));
    const r = await balayerComplet(deps(api, "d.jsonl"));
    expect(r.complet).toBe(true);
    expect(r.ids.size).toBe(r.countFinal);
  });

  // Ronde de correction 3 : `total` (le dénominateur de la barre de
  // progression du front) n'était jamais assaisonné — il pourrait valoir 0
  // sans qu'aucun test ne tombe.
  it("la progression est rapportée page par page, faits ET total", async () => {
    api = await startFauxApi(items(120));
    const vus: Array<{ faits: number; total: number }> = [];
    await balayerComplet({
      ...deps(api, "e.jsonl"),
      onProgress: (faits, total) => vus.push({ faits, total }),
    });
    expect(vus.length).toBeGreaterThanOrEqual(3);
    expect(vus.at(-1)).toEqual({ faits: 120, total: 120 });
    // Le dénominateur ne doit jamais tomber à 0 : c'est lui qui trahirait un
    // `total` non assaisonné.
    expect(vus.every((v) => v.total === 120)).toBe(true);
  });

  it("l'annulation arrête le balayage sans écrire un instantané menteur", async () => {
    api = await startFauxApi(items(200));
    let n = 0;
    const r = await balayerComplet({ ...deps(api, "f.jsonl"), annule: () => ++n > 2 });
    expect(r.complet).toBe(false);
    expect(r.raison).toMatch(/annul/i);
    // Ronde de correction 3 : ni le nombre d'invocations du rappel ni
    // l'absence de rejeu n'étaient assaisonnés — réintroduire un appel
    // `deps.annule?.()` de plus, ou un second passage après annulation, ne
    // ferait tomber aucun test sans ces deux lignes.
    expect(n).toBe(3);
    const pagesZero = api.appels.filter((a) => a.includes("sort=created&page=0"));
    expect(pagesZero).toHaveLength(1);
  });

  // Ronde de correction 3 : collection vide, jamais exercée.
  it("une collection vide se déclare complète sans écrire de ligne", async () => {
    api = await startFauxApi(items(0));
    const r = await balayerComplet(deps(api, "h.jsonl"));
    expect(r.lignes).toBe(0);
    expect(r.ids.size).toBe(0);
    expect(r.complet).toBe(true);
  });

  // Ronde de correction 3 : un multiple exact de PAR_PAGE (50) est le seul
  // cas qui atteint la terminaison par page VIDE supplémentaire — un chemin
  // que rien ne parcourait (200 items, par exemple, s'arrête à la 3e page
  // déjà partielle).
  it("un multiple exact de PAR_PAGE termine par une page vide", async () => {
    api = await startFauxApi(items(100));
    const r = await balayerComplet(deps(api, "i.jsonl"));
    expect(r.lignes).toBe(100);
    expect(r.ids.size).toBe(100);
    expect(r.complet).toBe(true);
    const pageDeux = api.appels.some((a) => a.includes("page=2"));
    expect(pageDeux).toBe(true);
  });

  // Ronde de correction 3, point IMPORTANT : sans try/catch autour de la
  // boucle, une exception de lecture.page() (429, timeout) laisse le JSONL
  // partiel sur disque SANS marqueur — fermer() n'est jamais exécuté, et
  // aucun ResultatBalayage n'existe pour que dernierValide() (Task 6)
  // l'écarte. On espionne `ouvrirJsonl` pour prouver que `fermer()` tourne
  // quand même, ET que l'erreur d'origine n'est jamais avalée.
  it("un échec réseau en cours de scan ferme quand même le JSONL avant de relancer l'erreur", async () => {
    api = await startFauxApi(items(120));
    const d = deps(api, "j.jsonl");
    let appels = 0;
    const boom = new Error("réseau : boom");
    const lectureEspionne = {
      ...d.lecture,
      page: async (c: number, o: { sort: string; page: number; perpage?: number }) => {
        if (appels++ === 1) throw boom; // la DEUXIÈME page échoue (429/timeout simulé)
        return d.lecture.page(c, o);
      },
    };
    let fermeAppele = 0;
    const original = instantane.ouvrirJsonl;
    const espion = vi.spyOn(instantane, "ouvrirJsonl").mockImplementation(async (chemin: string) => {
      const ecrivain = await original(chemin);
      return {
        ligne: ecrivain.ligne,
        fermer: async () => {
          fermeAppele++;
          return ecrivain.fermer();
        },
      };
    });
    try {
      await expect(balayerComplet({ ...d, lecture: lectureEspionne })).rejects.toThrow(boom);
      expect(fermeAppele).toBe(1);
    } finally {
      espion.mockRestore();
    }
  });
});
