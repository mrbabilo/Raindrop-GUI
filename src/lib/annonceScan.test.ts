import { describe, it, expect } from "vitest";
import { annonceScanLiens } from "./annonceScan";

// L'annonce se CALCULE (jamais de chiffre en dur, CLAUDE.md) : la lecture de
// la bibliothèque suit `coutBalayage`, le nombre d'adresses suit la reprise
// en cache, sinon la taille de la bibliothèque.
describe("annonceScanLiens", () => {
  it("reprise connue : seules les adresses RESTANT à vérifier sont annoncées", () => {
    const a = annonceScanLiens({ signets: 12210, reprise: { verifies: 300, total: 12000 } });
    expect(a).toContain("249 requêtes à Raindrop"); // ⌈12210/50⌉ + 4
    expect(a).toContain(`${(11700).toLocaleString("fr-FR")} adresses à vérifier`);
  });

  it("jamais analysé : la taille de la bibliothèque borne le compte", () => {
    expect(annonceScanLiens({ signets: 1200 })).toContain(`${(1200).toLocaleString("fr-FR")} adresses à vérifier`);
  });

  it("taille inconnue : l'annonce dit le geste sans inventer de nombre", () => {
    const a = annonceScanLiens({});
    expect(a).not.toMatch(/\d/);
    expect(a).toContain("chaque adresse");
  });
});
