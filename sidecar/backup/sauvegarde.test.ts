import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { repertoireTemporaire } from "../testing/tmp.js";
import { makeLecture } from "./lecture.js";
import { Throttle } from "../mcp/throttle.js";
import { makeSauvegarde } from "./sauvegarde.js";
import type { Manifeste } from "./manifeste.js";

const vide: Manifeste = { version: 1, instantanes: [] };
const avec = (horodatage: string): Manifeste => ({
  version: 1,
  instantanes: [{ horodatage, complet: true, count: 10, watermark: "w", empreintes: {} }],
});

describe("quand faut-il un balayage complet", () => {
  const s = makeSauvegarde({ lecture: {} as never, dossier: "/tmp/x", file: {} as never, token: "j" });

  it("jamais sauvegardé : complet", () => {
    expect(s.doitBalayerComplet(vide, new Date("2026-09-18T10:00:00Z"))).toBe(true);
  });

  it("sauvegardé hier : l'incrémental suffit", () => {
    expect(s.doitBalayerComplet(avec("2026-09-17T10-00-00"), new Date("2026-09-18T10:00:00Z"))).toBe(false);
  });

  // §5.3 : la comparaison de compteurs est un déclencheur bon marché, PAS une
  // garantie — une suppression ET un ajout laissent le compte inchangé.
  it("plus de sept jours sans balayage complet : complet, quoi qu'en disent les compteurs", () => {
    expect(s.doitBalayerComplet(avec("2026-09-10T10-00-00"), new Date("2026-09-18T10:00:00Z"))).toBe(true);
  });

  // §4.4 — le déclenchement au démarrage se fonde sur la dernière TENTATIVE,
  // valide ou non : sur `dernierValide`, une sauvegarde qui échoue en
  // relancerait une à chaque lancement, jusqu'à marteler l'API.
  it("au démarrage : rien depuis plus de 24 h → on sauvegarde", () => {
    expect(s.doitSauvegarderAuDemarrage(vide, new Date("2026-09-18T10:00:00Z"))).toBe(true);
    expect(s.doitSauvegarderAuDemarrage(avec("2026-09-16T10-00-00"), new Date("2026-09-18T10:00:00Z"))).toBe(true);
    expect(s.doitSauvegarderAuDemarrage(avec("2026-09-18T01-00-00"), new Date("2026-09-18T10:00:00Z"))).toBe(false);
    const echouee: Manifeste = {
      version: 1,
      instantanes: [{ horodatage: "2026-09-18T01-00-00", complet: false, count: 1, watermark: "w", empreintes: {} }],
    };
    expect(s.doitSauvegarderAuDemarrage(echouee, new Date("2026-09-18T10:00:00Z"))).toBe(false);
  });

  it("un instantané incomplet ne compte pas comme un balayage", () => {
    const m: Manifeste = {
      version: 1,
      instantanes: [{ horodatage: "2026-09-17T10-00-00", complet: false, count: 1, watermark: "w", empreintes: {} }],
    };
    expect(s.doitBalayerComplet(m, new Date("2026-09-18T10:00:00Z"))).toBe(true);
  });
});

let api: FauxApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id: 1000 + i,
    created: `2020-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    lastUpdate: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    title: `t${i}`,
  }));

const sauv = (
  a: FauxApi,
  dossier: string,
  extra: { maintenant?: () => Date; lecture?: never } = {},
) =>
  makeSauvegarde({
    lecture: makeLecture({ token: "j", baseUrl: `http://127.0.0.1:${a.port}/rest/v1`, file: new Throttle(0) }),
    dossier,
    file: new Throttle(0),
    token: "j",
    ...extra,
  });

const lignesDe = (chemin: string): { _id: number; title: string }[] =>
  readFileSync(chemin, "utf8")
    .trimEnd()
    .split("\n")
    .map((l) => JSON.parse(l) as { _id: number; title: string });

describe("ce que la sauvegarde collecte", () => {
  // CONTRAT 1 — la corbeille contient ce que l'utilisateur vient de supprimer,
  // donc exactement ce qu'une sauvegarde doit pouvoir rendre. C'est la ligne
  // qu'on retire sans s'en apercevoir et que personne ne réclame avant le jour
  // où elle manque.
  it("la corbeille (-99) est balayée, pas seulement la collection 0", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("sauv-corbeille-");
    const r = await sauv(api, dossier).executer("complet");

    const listes = api.appels.filter((a) => a.startsWith("/rest/v1/raindrops/"));
    expect(listes.some((a) => a.startsWith("/rest/v1/raindrops/-99?"))).toBe(true);
    expect(listes.some((a) => a.startsWith("/rest/v1/raindrops/0?"))).toBe(true);
    // Pas seulement l'appel : le fichier existe et porte les items.
    expect(lignesDe(join(dossier, r.horodatage, "trash.jsonl"))).toHaveLength(3);
    expect(r.empreintes["trash.jsonl"]).toBeDefined();
  });

  // CONTRAT 2 — un appel par bookmark serait 12 210 requêtes, ≈ 2 heures.
  // L'assertion d'ABSENCE porte le contrat ; la positive interdit qu'elle
  // passe parce que rien n'aurait été appelé du tout.
  it("les surlignages passent par l'endpoint GLOBAL, jamais bookmark par bookmark", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("sauv-surlignages-");
    const r = await sauv(api, dossier).executer("complet");

    expect(api.appels.filter((a) => a.startsWith("/rest/v1/highlights"))).toHaveLength(1);
    expect(api.appels.filter((a) => /\/rest\/v1\/raindrop\/\d+\/highlights/.test(a))).toEqual([]);
    const surlignages = JSON.parse(
      readFileSync(join(dossier, r.horodatage, "highlights.json"), "utf8"),
    ) as unknown[];
    expect(surlignages).toHaveLength(2);
    // Et le reste du §5.1, dont l'absence se remarquerait aussi tard.
    expect(api.appels).toContain("/rest/v1/collections");
    expect(api.appels).toContain("/rest/v1/user");
  });

  // CONTRAT 3 — sans ce test, la garde `dernierValide()` (Task 6) n'a plus
  // rien à filtrer : elle continuerait de fonctionner parfaitement sur une
  // donnée qui ment. Le levier est la bibliothèque qui BOUGE (une suppression
  // à chaque passage), pas une dépendance substituée : `balayerComplet`
  // traverse son vrai chemin de code et rend `complet: false`.
  it("`complet` vient du résultat du balayage, jamais forcé à `true`", async () => {
    api = await startFauxApi(items(10));
    const dossier = repertoireTemporaire("sauv-complet-");
    const lecture = makeLecture({
      token: "j",
      baseUrl: `http://127.0.0.1:${api.port}/rest/v1`,
      file: new Throttle(0),
    });
    const lectureEspionne = {
      ...lecture,
      page: async (c: number, o: { sort: string; page: number; perpage?: number }) => {
        const p = await lecture.page(c, o);
        // La collection 0 perd un élément à CHAQUE passage : le rejeu de
        // `balayerComplet` ne rattrape rien, la réconciliation échoue.
        if (c === 0 && o.sort === "created" && o.page === 0) api!.items.splice(0, 1);
        return p;
      },
    };
    const r = await makeSauvegarde({ lecture: lectureEspionne, dossier, file: new Throttle(0), token: "j" })
      .executer("complet");

    expect(r.complet).toBe(false);
    // Relu DEPUIS LE DISQUE : c'est ce que `dernierValide()` lira, et c'est
    // ce qu'un `complet: true` en dur ferait mentir.
    const m = JSON.parse(readFileSync(join(dossier, "manifest.json"), "utf8")) as Manifeste;
    expect(m.instantanes.map((i) => i.complet)).toEqual([false]);
  });
});

describe("l'incrémental", () => {
  it("fusionne l'instantané précédent au lieu de tout rapatrier", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("sauv-incr-");
    const s1 = await sauv(api, dossier, { maintenant: () => new Date("2026-09-18T10:00:00Z") })
      .executer("complet");
    const avant = api.appels.length;

    api.items[1]!.title = "modifié";
    api.items[1]!.lastUpdate = "2027-01-01T00:00:00.000Z";
    const s2 = await sauv(api, dossier, { maintenant: () => new Date("2026-09-18T11:00:00Z") })
      .executer("incremental");

    const fusion = lignesDe(join(dossier, s2.horodatage, "raindrops.jsonl"));
    expect(fusion).toHaveLength(3); // l'instantané reste COMPLET, pas un delta
    expect(fusion.find((o) => o._id === 1001)?.title).toBe("modifié");
    expect(fusion.find((o) => o._id === 1002)?.title).toBe("t2"); // repris du précédent
    // Aucun balayage complet de la BIBLIOTHÈQUE : pas une seule page
    // `/raindrops/0?sort=created`. (La corbeille, elle, est rebalayée à
    // chaque passage — une requête — pour que chaque instantané reste
    // autonome ; la rotation en efface, et un maillon manquant rendrait
    // illisibles tous les suivants.)
    expect(api.appels.slice(avant).filter((a) => a.startsWith("/rest/v1/raindrops/0?sort=created"))).toEqual([]);
    expect(api.appels.slice(avant).filter((a) => a.includes("sort=-lastUpdate"))).not.toEqual([]);
    expect(s2.complet).toBe(true);
    expect(s2.bascule).toBeUndefined();
    expect(s1.horodatage).not.toBe(s2.horodatage);
  });

  // §5.3 — l'angle mort des compteurs : un élément supprimé ailleurs ne
  // modifie aucune date, le tri par modification ne le verra jamais. Le
  // compte distant, lui, le trahit — pour une requête.
  it("ne se déclare pas complet quand le compte distant diverge du fusionné", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("sauv-divergence-");
    await sauv(api, dossier, { maintenant: () => new Date("2026-09-18T10:00:00Z") }).executer("complet");

    api.items.splice(0, 1); // supprimé ailleurs : aucune date ne bouge
    const s2 = await sauv(api, dossier, { maintenant: () => new Date("2026-09-18T11:00:00Z") })
      .executer("incremental");

    expect(s2.complet).toBe(false);
    expect(s2.raison).toMatch(/compte/i);
  });
});
