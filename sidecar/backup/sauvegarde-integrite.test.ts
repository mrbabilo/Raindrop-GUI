//! Ce qui ne doit JAMAIS être effacé, ni écrasé, ni entrelacé.
//!
//! L'autre moitié de §6 : « chaque cas laisse l'instantané précédent intact,
//! jamais d'écrasement avant écriture réussie ». Rotation, purge des archives,
//! concurrence, annulation — les chemins où l'on perd des données sans qu'une
//! seule erreur ne soit levée, et où c'est donc l'ABSENCE de suppression qui
//! porte le contrat.

import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    ...extra,
  });

const heure = (h: string) => () => new Date(`2026-09-18T${h}:00:00Z`);
describe("progression nommée (spec sélection §3)", () => {
  it("chaque pièce de la sauvegarde émet une progression à clé stable", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("progression-");
    const labels: (string | undefined)[] = [];
    const job = {
      progress: (_f: number, _t: number, label?: string) => {
        labels.push(label);
      },
      isCancelled: () => false,
    } as unknown as JobHandle;
    await sauv(api, dossier, { maintenant: heure("10") }).executer("balayage", job);
    // Les clés sont stables, le front les traduit — une clé inconnue
    // s'afficherait brute, comme un identifiant interne.
    expect(labels).toEqual(
      expect.arrayContaining(["bookmarks", "corbeille", "collections", "surlignages", "profil"]),
    );
  });
});

describe("ce qui ne doit jamais être effacé", () => {
  // L'autre moitié de §6 : « chaque cas laisse l'instantané précédent intact,
  // jamais d'écrasement avant écriture réussie ». L'horloge est FIGÉE : deux
  // instantanés à la même seconde, donc le même nom de dossier si rien ne
  // l'en empêche. Sans garde, le second écrase le premier — et l'utilisateur
  // perd la sauvegarde qu'il avait, en échange de celle qu'il vient de faire.
  it("deux instantanés à la même seconde : le premier reste intact", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("degrade-ecrasement-");
    const fige = heure("10");
    const s1 = await sauv(api, dossier, { maintenant: fige }).executer("balayage");
    const empreinteAvant = await sha256Fichier(join(dossier, s1.horodatage, "raindrops.jsonl"));

    api.items.push({
      _id: 2000,
      created: "2021-01-01T00:00:00.000Z",
      lastUpdate: "2026-02-01T00:00:00.000Z",
      title: "neuf",
    });
    const s2 = await sauv(api, dossier, { maintenant: fige }).executer("balayage");

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

    const r = await sauv(api, dossier, { maintenant: heure("10") }).executer("balayage");

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
    const r = await sauv(api, dossier, { maintenant: heure("10") }).executer("balayage", job);

    expect(r.complet).toBe(false); // un balayage annulé ne ment pas
    // 1059 n'a bel et bien PAS été vu — sans quoi le test ne prouverait rien.
    const vus = readFileSync(join(dossier, r.horodatage, "raindrops.jsonl"), "utf8");
    expect(vus).not.toContain('"_id":1059');
    // Et pourtant son archive est intacte : c'est l'ABSENCE de suppression qui
    // porte le contrat.
    expect(existsSync(join(archives, "1059.html.gz"))).toBe(true);
    expect(existsSync(join(archives, "1000.html.gz"))).toBe(true);
  });

  // L'archive d'un signet EN CORBEILLE doit survivre à la purge : il est
  // restaurable, et la corbeille est justement ce que ce lot tient à sauver.
  // Le contrat n'était pas falsifiable tant que le faux serveur rendait les
  // mêmes items pour `0` et `-99` — il discrimine désormais.
  it("la purge épargne l'archive d'un signet en corbeille, pas celle d'un disparu", async () => {
    api = await startFauxApi(items(2), [
      { _id: 9001, created: "2019-01-01T00:00:00.000Z", lastUpdate: "2026-01-01T00:00:00.000Z", title: "jeté" },
    ]);
    const dossier = repertoireTemporaire("degrade-purge-corbeille-");
    const archives = join(dossier, "archives");
    mkdirSync(archives, { recursive: true });
    // 9001 est en corbeille ; 7777 n'existe nulle part — c'est un orphelin.
    for (const id of [9001, 7777]) writeFileSync(join(archives, `${id}.html.gz`), "x", "utf8");

    const r = await sauv(api, dossier, { maintenant: heure("10") }).executer("balayage");

    // La prémisse d'abord : 9001 n'est PAS dans la bibliothèque, seulement
    // dans la corbeille. Sans cela l'assertion suivante ne prouverait rien.
    expect(readFileSync(join(dossier, r.horodatage, "raindrops.jsonl"), "utf8")).not.toContain("9001");
    expect(readFileSync(join(dossier, r.horodatage, "trash.jsonl"), "utf8")).toContain("9001");
    // La purge a bel et bien tourné (l'orphelin est parti)…
    expect(existsSync(join(archives, "7777.html.gz"))).toBe(false);
    // … et elle a épargné la corbeille.
    expect(existsSync(join(archives, "9001.html.gz"))).toBe(true);
  });

  // La rotation garde « les 7 derniers plus le plus ancien des 4 semaines
  // précédentes », sur des CHAÎNES : elle ne peut pas protéger un instantané
  // pour sa validité. Sept annulations dans la même semaine chassent donc le
  // seul instantané valide — et la promotion hebdomadaire ne le rattrape pas,
  // elle ignore la semaine courante.
  it("sept annulations n'emportent pas la seule sauvegarde valide", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("degrade-rotation-valide-");
    const lundi = () => new Date("2026-09-14T10:00:00Z"); // lundi
    const bon = await sauv(api, dossier, { maintenant: lundi }).executer("balayage");
    expect(bon.complet).toBe(true);

    const mercredi = () => new Date("2026-09-16T10:00:00Z"); // même semaine
    const annule = { progress: () => {}, isCancelled: () => true } as unknown as JobHandle;
    for (let i = 0; i < 7; i++) {
      const r = await sauv(api, dossier, { maintenant: mercredi }).executer("balayage", annule);
      expect(r.complet).toBe(false); // ce sont bien 7 instantanés INVALIDES
    }

    // Le dossier ET la ligne au manifeste : sans la seconde, il ne resterait
    // même pas la trace qu'une bonne sauvegarde a existé.
    expect(existsSync(join(dossier, bon.horodatage, "raindrops.jsonl"))).toBe(true);
    const m = JSON.parse(readFileSync(join(dossier, "manifest.json"), "utf8")) as Manifeste;
    expect(m.instantanes.map((i) => i.horodatage)).toContain(bon.horodatage);
    expect(m.instantanes.filter((i) => i.complet)).toHaveLength(1);
  });

  // Une seule sauvegarde en vol : deux balayages concurrents partageraient
  // l'horodatage (leurs deux `access()` rendent ENOENT) et entrelaceraient
  // deux flux sur le même `raindrops.jsonl`.
  it("une sauvegarde est déjà en cours : la seconde est refusée, pas entrelacée", async () => {
    api = await startFauxApi(items(60));
    const dossier = repertoireTemporaire("degrade-concurrence-");
    const s = sauv(api, dossier, { maintenant: heure("10") });

    const premiere = s.executer("balayage");
    expect(s.enCours()).toBe(true);
    await expect(s.executer("balayage")).rejects.toThrow(/déjà en cours/);

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
    await sauv(api, dossier, { maintenant: heure("10") }).executer("balayage");
    const job = { progress: () => {}, isCancelled: () => true } as unknown as JobHandle;

    const s2 = await sauv(api, dossier, { maintenant: heure("11") }).executer("incremental", job);

    expect(s2.complet).toBe(false);
    expect(s2.raison).toMatch(/annul/i);
    expect(s2.bascule).toBeUndefined(); // l'annulation prime sur l'escalade
  });
});

// Ce qui ne doit pas FUIR non plus. La rotation n'itère que sur les
// horodatages du manifeste : un dossier qu'il ne cite pas lui est invisible.
describe("ce que le manifeste ne cite pas", () => {
  it("un dossier partiel d'un balayage mort est ramassé à la sauvegarde suivante", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("reconcil-partiel-");
    // Un balayage mort en route : des données écrites, pas de meta.json —
    // il s'écrit en dernier. ~11 Mo en réel, hors de tout budget.
    const mort = join(dossier, "2026-09-01T10-00-00");
    mkdirSync(mort, { recursive: true });
    writeFileSync(join(mort, "raindrops.jsonl"), '{"_id":1}\n', "utf8");

    await sauv(api, dossier, { maintenant: heure("10") }).executer("balayage");

    expect(existsSync(mort)).toBe(false);
  });

  it("un instantané que le manifeste a oublié est ré-adopté, pas perdu", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("reconcil-oubli-");
    // Le cas du manifeste corrompu : `lireManifeste` rend un inventaire vide,
    // et la sauvegarde suivante en réécrit un qui ne porte que sa propre
    // entrée. Le dossier antérieur survivrait sans que rien ne l'atteigne.
    const oublie = join(dossier, "2026-09-01T10-00-00");
    mkdirSync(oublie, { recursive: true });
    writeFileSync(join(oublie, "raindrops.jsonl"), '{"_id":1}\n', "utf8");
    writeFileSync(
      join(oublie, "meta.json"),
      JSON.stringify({ horodatage: "2026-09-01T10-00-00", complet: true, count: 1, watermark: "w" }),
      "utf8",
    );

    await sauv(api, dossier, { maintenant: heure("10") }).executer("balayage");

    // Il est de nouveau CONNU : la rotation peut désormais l'atteindre.
    const m = JSON.parse(readFileSync(join(dossier, "manifest.json"), "utf8")) as Manifeste;
    expect(m.instantanes.map((i) => i.horodatage)).toContain("2026-09-01T10-00-00");
    expect(existsSync(oublie)).toBe(true);
  });
});
