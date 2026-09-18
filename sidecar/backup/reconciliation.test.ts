import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { repertoireTemporaire } from "../testing/tmp.js";
import { reconcilier } from "./reconciliation.js";
import type { Manifeste } from "./manifeste.js";

const dir = () => repertoireTemporaire("backup-reconcil-");
const vide: Manifeste = { version: 1, instantanes: [] };

/** Un dossier d'instantané, avec ou sans son `meta.json` final. */
const instantane = async (racine: string, horodatage: string, meta?: unknown) => {
  const d = join(racine, horodatage);
  await mkdir(d, { recursive: true });
  await writeFile(join(d, "raindrops.jsonl"), '{"_id":1}\n', "utf8");
  if (meta !== undefined) await writeFile(join(d, "meta.json"), JSON.stringify(meta), "utf8");
  return d;
};

describe("réconciliation des dossiers avec le manifeste", () => {
  // Une exception en cours de balayage laisse un dossier partiel : `meta.json`
  // s'écrit EN DERNIER, donc son absence signe un balayage mort en route.
  // Rien ne le ramassait — la rotation n'itère que sur le manifeste.
  it("supprime un dossier sans meta.json — un balayage mort en route", async () => {
    const racine = dir();
    await instantane(racine, "2026-09-01T10-00-00"); // pas de meta
    const adoptes = await reconcilier(racine, vide, () => undefined);
    expect(adoptes).toEqual([]);
    expect(await readdir(racine)).toEqual([]);
  });

  // `meta.json` existe précisément pour qu'un instantané se lise SEUL quand le
  // manifeste est perdu. Un manifeste corrompu rend un inventaire vide : sans
  // réconciliation, les dossiers antérieurs survivent et deviennent
  // irrécupérables pour toujours.
  it("ré-adopte un dossier qui porte son meta.json", async () => {
    const racine = dir();
    await instantane(racine, "2026-09-01T10-00-00", {
      horodatage: "2026-09-01T10-00-00", complet: true, count: 42, watermark: "w",
    });
    const adoptes = await reconcilier(racine, vide, () => undefined);
    expect(adoptes).toEqual([
      { horodatage: "2026-09-01T10-00-00", complet: true, count: 42, watermark: "w", empreintes: {} },
    ]);
    // Le dossier reste : il est désormais connu, donc ramassable par la
    // rotation au lieu de fuir.
    expect(await readdir(racine)).toContain("2026-09-01T10-00-00");
  });

  // L'entrée adoptée n'a PAS d'empreinte, et c'est voulu : on ne peut rien
  // garantir d'un dossier que le manifeste avait oublié. `raisonDeBasculer`
  // repartira en balayage complet plutôt que de bâtir dessus.
  it("l'entrée adoptée est sans empreinte — on ne vouche pas pour elle", async () => {
    const racine = dir();
    await instantane(racine, "2026-09-02T10-00-00", {
      horodatage: "2026-09-02T10-00-00", complet: true, count: 1, watermark: "w",
    });
    const [e] = await reconcilier(racine, vide, () => undefined);
    expect(e?.empreintes).toEqual({});
  });

  it("ne touche NI aux dossiers déjà cités, NI à archives/", async () => {
    const racine = dir();
    await instantane(racine, "2026-09-03T10-00-00", { horodatage: "x", complet: true, count: 1, watermark: "w" });
    await mkdir(join(racine, "archives"), { recursive: true });
    await writeFile(join(racine, "archives", "7.html.gz"), "x", "utf8");
    const m: Manifeste = {
      version: 1,
      instantanes: [{ horodatage: "2026-09-03T10-00-00", complet: true, count: 1, watermark: "w", empreintes: {} }],
    };
    const adoptes = await reconcilier(racine, m, () => undefined);
    // Déjà cité : ni adopté une seconde fois, ni supprimé.
    expect(adoptes).toEqual([]);
    const restants = await readdir(racine);
    expect(restants).toContain("2026-09-03T10-00-00");
    expect(restants).toContain("archives");
  });

  it("un meta.json illisible vaut un dossier sans meta : il est ramassé", async () => {
    const racine = dir();
    const d = await instantane(racine, "2026-09-04T10-00-00");
    await writeFile(join(d, "meta.json"), "{pas du json", "utf8");
    const avertis: string[] = [];
    await reconcilier(racine, vide, (msg) => avertis.push(msg));
    expect(await readdir(racine)).toEqual([]);
    // Ramasser 11 Mo en silence serait aussi mauvais que les laisser fuir.
    expect(avertis.join(" ")).toMatch(/partiel|incomplet|ramass/i);
  });
});

// L'appelant déclare connu l'instantané qu'il vient d'écrire : son dossier
// existe déjà, meta.json compris, et il serait sinon ré-adopté comme
// orphelin — en double avec lui-même. Le défaut a été attrapé par les tests
// de bout en bout, pas par les miens : d'où celui-ci.
describe("l'instantané courant", () => {
  it("n'est pas ré-adopté quand il est déclaré connu", async () => {
    const racine = dir();
    await instantane(racine, "2026-09-05T10-00-00", {
      horodatage: "2026-09-05T10-00-00", complet: true, count: 1, watermark: "w",
    });
    // Preuve d'abord qu'il SERAIT adopté sans cette déclaration : sans elle,
    // l'assertion d'absence ci-dessous ne prouverait rien.
    expect(await reconcilier(racine, vide, () => undefined)).toHaveLength(1);
    const connu: Manifeste = {
      version: 1,
      instantanes: [{ horodatage: "2026-09-05T10-00-00", complet: true, count: 1, watermark: "w", empreintes: {} }],
    };
    expect(await reconcilier(racine, connu, () => undefined)).toEqual([]);
  });
});
