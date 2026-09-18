import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { repertoireTemporaire } from "../testing/tmp.js";
import { ouvrirJsonl } from "./instantane.js";
import { fusionner } from "./collecte.js";

const dir = () => repertoireTemporaire("backup-collecte-");

/** Écrit un instantané source, une ligne par objet. */
const source = async (objets: unknown[]): Promise<string> => {
  const chemin = join(dir(), "raindrops.jsonl");
  const e = await ouvrirJsonl(chemin);
  for (const o of objets) await e.ligne(o);
  await e.fermer();
  return chemin;
};

const lignes = async (chemin: string): Promise<unknown[]> =>
  (await readFile(chemin, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l) as unknown);

describe("fusionner", () => {
  it("remplace les modifiés, garde le reste, ajoute les créations", async () => {
    const src = await source([{ _id: 1, t: "a" }, { _id: 2, t: "b" }]);
    const cible = dir();
    await fusionner({
      source: src,
      dossier: cible,
      nom: "raindrops.jsonl",
      modifies: [{ _id: 2, t: "B" }, { _id: 3, t: "c" }],
    });
    const out = await lignes(join(cible, "raindrops.jsonl"));
    expect(out).toEqual([{ _id: 1, t: "a" }, { _id: 2, t: "B" }, { _id: 3, t: "c" }]);
  });

  // §3.4 : on ne jette jamais une donnée brute. Un objet sans `_id` numérique
  // ne peut RIEN remplacer — il n'a pas de clé — mais il doit être écrit.
  it("écrit un modifié sans `_id` numérique au lieu de le jeter", async () => {
    const src = await source([{ _id: 1, t: "a" }]);
    const cible = dir();
    const orphelin = { t: "orphelin", lastUpdate: "2026-04-01T00:00:00.000Z" };
    await fusionner({ source: src, dossier: cible, nom: "raindrops.jsonl", modifies: [orphelin] });
    const out = await lignes(join(cible, "raindrops.jsonl"));
    // La ligne d'origine survit, et l'orphelin s'ajoute.
    expect(out).toContainEqual({ _id: 1, t: "a" });
    expect(out).toContainEqual(orphelin);
  });

  // Faute de clé, la seule identité disponible est le contenu : un orphelin
  // déjà présent à l'identique dans la source ne doit pas s'y ajouter une
  // seconde fois — l'élément PILE au watermark est réappliqué à chaque passe.
  it("ne duplique pas un orphelin déjà présent à l'identique", async () => {
    const orphelin = { t: "orphelin", lastUpdate: "2026-04-01T00:00:00.000Z" };
    const src = await source([{ _id: 1, t: "a" }, orphelin]);
    const cible = dir();
    await fusionner({ source: src, dossier: cible, nom: "raindrops.jsonl", modifies: [orphelin] });
    const out = await lignes(join(cible, "raindrops.jsonl"));
    expect(out.filter((o) => JSON.stringify(o) === JSON.stringify(orphelin))).toHaveLength(1);
  });

  it("un orphelin dont le contenu a CHANGÉ est gardé en plus, pas à la place", async () => {
    const avant = { t: "orphelin", note: "" };
    const apres = { t: "orphelin", note: "corrigée" };
    const src = await source([avant]);
    const cible = dir();
    await fusionner({ source: src, dossier: cible, nom: "raindrops.jsonl", modifies: [apres] });
    const out = await lignes(join(cible, "raindrops.jsonl"));
    // Sans identifiant, rien ne prouve que ces deux objets sont le même :
    // écraser l'ancien serait une perte décidée sur une supposition.
    expect(out).toEqual([avant, apres]);
  });
});
