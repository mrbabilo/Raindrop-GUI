//! Les états dégradés de la sauvegarde (spec §6) — la moitié du contrat qui
//! ne se voit jamais quand tout va bien : dossier disparu, empreinte qui ne
//! se vérifie plus, manifeste corrompu. Chacun doit basculer en balayage
//! complet, LE DIRE, et laisser l'instantané précédent intact.

import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JobHandle } from "../jobs/store.js";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { repertoireTemporaire } from "../testing/tmp.js";
import { makeLecture } from "./lecture.js";
import { Throttle } from "../mcp/throttle.js";
import { makeSauvegarde } from "./sauvegarde.js";
import { sha256Fichier } from "./instantane.js";
import type { Manifeste } from "./manifeste.js";

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
  extra: { maintenant?: () => Date; avertir?: (m: string, c?: Record<string, unknown>) => void } = {},
) =>
  makeSauvegarde({
    lecture: makeLecture({ token: "j", baseUrl: `http://127.0.0.1:${a.port}/rest/v1`, file: new Throttle(0) }),
    dossier,
    file: new Throttle(0),
    token: "j",
    ...extra,
  });

const heure = (h: string) => () => new Date(`2026-09-18T${h}:00:00Z`);

describe("états dégradés", () => {
  // CONTRAT 4 — sans cette revérification, une corruption silencieuse se
  // propagerait de sauvegarde en sauvegarde : chaque incrémental bâtirait sur
  // le précédent corrompu, et la corruption deviendrait l'histoire.
  //
  // L'altération reste du JSONL VALIDE (un titre changé) : seule l'empreinte
  // la trahit. Tronquer le fichier ferait passer le test pour la mauvaise
  // raison — la fusion exploserait à l'analyse, sans rien prouver du contrôle.
  it("une empreinte qui ne se vérifie plus ne sert jamais de base", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("degrade-empreinte-");
    const avertis: string[] = [];
    const s1 = await sauv(api, dossier, { maintenant: heure("10") }).executer("complet");

    const fichier = join(dossier, s1.horodatage, "raindrops.jsonl");
    writeFileSync(fichier, readFileSync(fichier, "utf8").replace('"t0"', '"corrompu"'), "utf8");

    const avant = api.appels.length;
    const s2 = await sauv(api, dossier, {
      maintenant: heure("11"),
      avertir: (m) => avertis.push(m),
    }).executer("incremental");

    // (a) un balayage complet a bien eu lieu
    expect(api.appels.slice(avant).some((a) => a.includes("sort=created"))).toBe(true);
    // (b) le basculement est DIT, pas silencieux — au retour comme au journal
    expect(s2.bascule).toMatch(/empreinte|vérifie/i);
    expect(avertis.join(" | ")).toMatch(/complet/i);
    // Et la corruption ne s'est pas propagée dans le nouvel instantané.
    expect(readFileSync(join(dossier, s2.horodatage, "raindrops.jsonl"), "utf8")).not.toContain("corrompu");
    expect(s2.complet).toBe(true);
  });

  // CONTRAT 5 — disque externe débranché, fichier iCloud non téléchargé,
  // dossier renommé. Le manifeste désigne encore un instantané que le disque
  // n'a plus : ni la comparaison de compteurs ni l'incrémental ne sont
  // possibles. (Un dossier VIERGE ne prouverait rien : `doitBalayerComplet`
  // rendrait `true` de toute façon, faute de `dernierValide`.)
  it("l'instantané précédent a disparu du disque : on repart complet, et on le dit", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("degrade-disparu-");
    const s1 = await sauv(api, dossier, { maintenant: heure("10") }).executer("complet");
    rmSync(join(dossier, s1.horodatage), { recursive: true, force: true });

    const avant = api.appels.length;
    const s2 = await sauv(api, dossier, { maintenant: heure("11") }).executer("incremental");

    expect(api.appels.slice(avant).some((a) => a.includes("sort=created"))).toBe(true);
    expect(s2.bascule).toMatch(/complet/i);
    expect(s2.complet).toBe(true);
    // Le manifeste garde trace des deux : rien n'est effacé pour cacher la panne.
    const m = JSON.parse(readFileSync(join(dossier, "manifest.json"), "utf8")) as Manifeste;
    expect(m.instantanes.map((i) => i.horodatage)).toEqual([s1.horodatage, s2.horodatage]);
  });

  // L'autre moitié de §6 : « chaque cas laisse l'instantané précédent intact,
  // jamais d'écrasement avant écriture réussie ». L'horloge est FIGÉE : deux
  // instantanés à la même seconde, donc le même nom de dossier si rien ne
  // l'en empêche. Sans garde, le second écrase le premier — et l'utilisateur
  // perd la sauvegarde qu'il avait, en échange de celle qu'il vient de faire.
  it("deux instantanés à la même seconde : le premier reste intact", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("degrade-ecrasement-");
    const fige = heure("10");
    const s1 = await sauv(api, dossier, { maintenant: fige }).executer("complet");
    const empreinteAvant = await sha256Fichier(join(dossier, s1.horodatage, "raindrops.jsonl"));

    api.items.push({
      _id: 2000,
      created: "2021-01-01T00:00:00.000Z",
      lastUpdate: "2026-02-01T00:00:00.000Z",
      title: "neuf",
    });
    const s2 = await sauv(api, dossier, { maintenant: fige }).executer("complet");

    expect(s2.horodatage).not.toBe(s1.horodatage);
    expect(await sha256Fichier(join(dossier, s1.horodatage, "raindrops.jsonl"))).toBe(empreinteAvant);
    expect(readFileSync(join(dossier, s2.horodatage, "raindrops.jsonl"), "utf8")).toContain("neuf");
  });

  // La rotation (§5.5) garde « les 7 derniers plus le plus ancien de chacune
  // des 4 semaines précédentes » et efface le reste. Si l'horloge a reculé —
  // ou si le manifeste porte des entrées PLUS RÉCENTES que l'instantané qu'on
  // vient d'écrire — celui-ci tombe hors des 7 derniers, et la rotation
  // effacerait le dossier qu'elle vient de vérifier. L'inverse exact de la
  // promesse de §6.
  it("la rotation n'efface jamais l'instantané qu'elle vient d'écrire", async () => {
    api = await startFauxApi(items(2));
    const dossier = repertoireTemporaire("degrade-rotation-");
    mkdirSync(dossier, { recursive: true });
    const futurs = Array.from({ length: 8 }, (_, i) => ({
      horodatage: `2026-09-${19 + i}T10-00-00`,
      complet: true,
      count: 1,
      watermark: "w",
      empreintes: {},
    }));
    writeFileSync(join(dossier, "manifest.json"), JSON.stringify({ version: 1, instantanes: futurs }), "utf8");

    const r = await sauv(api, dossier, { maintenant: heure("10") }).executer("complet");

    expect(existsSync(join(dossier, r.horodatage, "raindrops.jsonl"))).toBe(true);
    const m = JSON.parse(readFileSync(join(dossier, "manifest.json"), "utf8")) as Manifeste;
    expect(m.instantanes.map((i) => i.horodatage)).toContain(r.horodatage);
  });

  // Le balayage annulé rend le `Set` de ce qu'il a vu JUSQUE-LÀ. Purger les
  // archives là-dessus effacerait celles de tous les signets pas encore lus —
  // 10 000 sur 12 210 si l'on annule à la page 40 sur 245 — et une archive est
  // ce qu'on ne peut PLUS recréer quand la page est morte. C'est l'absence de
  // suppression qui porte le contrat.
  it("un balayage annulé ne purge AUCUNE archive", async () => {
    // `created` STRICTEMENT croissant avec l'identifiant : le tri ascendant du
    // balayage rend donc les pages dans l'ordre des identifiants, et l'on sait
    // lesquels la page 1 n'aura jamais vus. (Le jeu d'items partagé colle
    // plusieurs items sur la même date — l'ordre y est stable mais pas celui
    // des identifiants, et le test ne prouvait alors rien.)
    api = await startFauxApi(
      Array.from({ length: 60 }, (_, i) => ({
        _id: 1000 + i,
        created: new Date(Date.UTC(2020, 0, 1, 0, 0, i)).toISOString(),
        lastUpdate: "2026-01-01T00:00:00.000Z",
        title: `t${i}`,
      })),
    );
    const dossier = repertoireTemporaire("degrade-purge-");
    const archives = join(dossier, "archives");
    mkdirSync(archives, { recursive: true });
    // 1000 est dans la première page, 1059 dans la seconde — celle qui
    // n'arrivera jamais. C'est lui la victime d'une purge prématurée.
    for (const id of [1000, 1059]) writeFileSync(join(archives, `${id}.html.gz`), "x", "utf8");

    let vues = 0;
    const job = {
      progress: () => {
        vues++;
      },
      isCancelled: () => vues >= 1, // annulé dès la première page lue
    } as unknown as JobHandle;
    const r = await sauv(api, dossier, { maintenant: heure("10") }).executer("complet", job);

    expect(r.complet).toBe(false); // un balayage annulé ne ment pas
    // 1059 n'a bel et bien PAS été vu — sans quoi le test ne prouverait rien.
    const vus = readFileSync(join(dossier, r.horodatage, "raindrops.jsonl"), "utf8");
    expect(vus).not.toContain('"_id":1059');
    // Et pourtant son archive est intacte : c'est l'ABSENCE de suppression qui
    // porte le contrat.
    expect(existsSync(join(archives, "1059.html.gz"))).toBe(true);
    expect(existsSync(join(archives, "1000.html.gz"))).toBe(true);
  });

  // Une seule sauvegarde en vol : deux balayages concurrents partageraient
  // l'horodatage (leurs deux `access()` rendent ENOENT) et entrelaceraient
  // deux flux sur le même `raindrops.jsonl`.
  it("une sauvegarde est déjà en cours : la seconde est refusée, pas entrelacée", async () => {
    api = await startFauxApi(items(60));
    const dossier = repertoireTemporaire("degrade-concurrence-");
    const s = sauv(api, dossier, { maintenant: heure("10") });

    const premiere = s.executer("complet");
    expect(s.enCours()).toBe(true);
    await expect(s.executer("complet")).rejects.toThrow(/déjà en cours/);

    const r = await premiere;
    expect(r.complet).toBe(true); // la première n'a pas été perturbée
    expect(s.enCours()).toBe(false); // et le drapeau retombe
    const m = JSON.parse(readFileSync(join(dossier, "manifest.json"), "utf8")) as Manifeste;
    expect(m.instantanes).toHaveLength(1);
  });

  // L'annulation était honorée dans le mode complet et ignorée dans
  // l'incrémental : l'interface disait « annulé » pendant qu'un instantané
  // parfaitement valide apparaissait au manifeste.
  it("un incrémental annulé ne se déclare pas complet", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("degrade-annul-incr-");
    await sauv(api, dossier, { maintenant: heure("10") }).executer("complet");
    const job = { progress: () => {}, isCancelled: () => true } as unknown as JobHandle;

    const s2 = await sauv(api, dossier, { maintenant: heure("11") }).executer("incremental", job);

    expect(s2.complet).toBe(false);
    expect(s2.raison).toMatch(/annul/i);
    expect(s2.bascule).toBeUndefined(); // l'annulation prime sur l'escalade
  });

  // Dette de la Task 6 : `lireManifeste(dossier, avertir)` distingue un
  // manifeste ABSENT (silence, premier lancement) d'un manifeste CORROMPU (à
  // signaler). Inerte tant que personne ne le branche — sinon la Task 6 a
  // construit un détecteur que rien n'écoute.
  it("un manifeste corrompu laisse une trace au journal ; un dossier vierge, non", async () => {
    api = await startFauxApi(items(1));
    const dossier = repertoireTemporaire("degrade-manifeste-");
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, "manifest.json"), "{ ceci n'est pas du json", "utf8");
    const avertis: string[] = [];
    await sauv(api, dossier, { avertir: (m) => avertis.push(m) }).statut();
    expect(avertis.join(" | ")).toMatch(/manifest\.json corrompu/);

    const vierge: string[] = [];
    await sauv(api, repertoireTemporaire("degrade-vierge-"), { avertir: (m) => vierge.push(m) }).statut();
    expect(vierge).toEqual([]);
  });

  it("le statut dit ce qu'il sait : dernier instantané valide et complétude", async () => {
    api = await startFauxApi(items(2));
    const dossier = repertoireTemporaire("degrade-statut-");
    const s1 = await sauv(api, dossier, { maintenant: heure("10") }).executer("complet");
    const statut = await sauv(api, dossier).statut();
    expect(statut.actif).toBe(true);
    expect(statut.dossier).toBe(dossier);
    expect(statut.dernier?.horodatage).toBe(s1.horodatage);
    expect(statut.dernier?.complet).toBe(true);
    expect(statut.instantanes).toBe(1);
  });
});
