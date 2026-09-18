import { describe, it, expect } from "vitest";
import { canoniser, basculer, etiquettesDe, vueEtiquette } from "./filtreEtiquettes";

describe("canoniser", () => {
  it("trie — sans quoi deux ordres feraient deux entrées de cache", () => {
    // Le tri n'est pas cosmétique : la clé de requête de useRaindrops est
    // l'objet entier. ["b","a"] et ["a","b"] désignent le MÊME filtre et
    // doivent donc produire la même valeur.
    expect(canoniser(["webdesign", "code"])).toEqual(canoniser(["code", "webdesign"]));
    expect(canoniser(["webdesign", "code"])).toEqual(["code", "webdesign"]);
  });

  it("dédoublonne sans égard à la casse — le filtre l'ignore (mesuré)", () => {
    expect(canoniser(["Code", "code"])).toEqual(["Code"]);
  });

  it("rogne et jette le vide", () => {
    expect(canoniser([" code ", "", "   "])).toEqual(["code"]);
    expect(canoniser(undefined)).toEqual([]);
  });
});

// La règle du dépôt sur les bascules : « l'aller ne prouve rien sans le
// retour ». Les deux sens, et l'on vérifie que la chose commandée a bien
// disparu — pas seulement qu'un état a changé d'avis.
describe("basculer", () => {
  it("ajoute une étiquette absente", () => {
    expect(basculer(["code"], "webdesign")).toEqual(["code", "webdesign"]);
  });

  it("RETIRE une étiquette déjà présente", () => {
    expect(basculer(["code", "webdesign"], "code")).toEqual(["webdesign"]);
  });

  it("le retour rend exactement l'état d'avant l'aller", () => {
    const depart = canoniser(["code"]);
    expect(basculer(basculer(depart, "webdesign"), "webdesign")).toEqual(depart);
  });

  it("retire quelle que soit la casse — sinon le second clic poserait un doublon", () => {
    // `#Code` et `#code` sont le même filtre côté serveur : si la comparaison
    // était sensible à la casse, recliquer la pilule ajouterait une seconde
    // entrée inerte au lieu de défaire la première.
    expect(basculer(["Code"], "code")).toEqual([]);
  });

  it("la dernière retirée rend une liste vide, pas undefined", () => {
    expect(basculer(["code"], "code")).toEqual([]);
  });
});

describe("etiquettesDe / vueEtiquette", () => {
  it("une vue sans filtres n'en porte aucune", () => {
    // Il faut d'abord montrer qu'une vue liste, elle, en rend : sinon ce test
    // célèbre l'absence sur un objet qui n'en aurait jamais porté.
    expect(etiquettesDe({ kind: "list", collectionId: 0, label: "", tags: ["code"] })).toEqual(["code"]);
    expect(etiquettesDe({ kind: "tags" })).toEqual([]);
    expect(etiquettesDe({ kind: "collection", collectionId: 3, label: "x" })).toEqual([]);
  });

  it("la vue de navigation porte les étiquettes canoniques", () => {
    const v = vueEtiquette(["webdesign", "code", "code"]);
    expect(v).toMatchObject({ kind: "list", collectionId: 0, tags: ["code", "webdesign"] });
  });
});
