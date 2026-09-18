import { describe, it, expect } from "vitest";
import { doitBalayerComplet, doitSauvegarderAuDemarrage } from "./decision.js";
import type { Manifeste } from "./manifeste.js";

const vide: Manifeste = { version: 1, instantanes: [] };
const avec = (horodatage: string, complet = true): Manifeste => ({
  version: 1,
  instantanes: [{ horodatage, complet, count: 10, watermark: "w", empreintes: {} }],
});
// La date de référence des cas : 2026-09-18T10:00Z partout.
const REF = new Date("2026-09-18T10:00:00Z");

describe("quand faut-il un balayage complet (doitBalayerComplet)", () => {
  it("jamais sauvegardé : complet", () => {
    expect(doitBalayerComplet(vide, REF)).toBe(true);
  });

  it("sauvegardé hier : l'incrémental suffit", () => {
    expect(doitBalayerComplet(avec("2026-09-17T10-00-00"), REF)).toBe(false);
  });

  // §5.3 : la comparaison de compteurs est un déclencheur bon marché, PAS une
  // garantie — une suppression ET un ajout laissent le compte inchangé.
  it("plus de sept jours sans balayage complet : complet, quoi qu'en disent les compteurs", () => {
    expect(doitBalayerComplet(avec("2026-09-10T10-00-00"), REF)).toBe(true);
  });

  it("un instantané incomplet ne compte pas comme un balayage", () => {
    expect(doitBalayerComplet(avec("2026-09-17T10-00-00", false), REF)).toBe(true);
  });
});

describe("déclenchement au démarrage (doitSauvegarderAuDemarrage)", () => {
  // Amendé (spec sélection §0.2) : un manifeste vide ne déclenche PLUS rien
  // au démarrage — choisir un dossier ne doit pas partir en 2 min 19 et
  // ~245 requêtes non demandées. La première sauvegarde est un geste
  // explicite, lancé depuis le panneau ; ensuite le §4.4 s'applique.
  it("manifeste vide → false : la première sauvegarde est explicite", () => {
    expect(doitSauvegarderAuDemarrage(vide, REF)).toBe(false);
  });

  // §4.4 — le déclenchement au démarrage se fonde sur la dernière TENTATIVE,
  // valide ou non : sur `dernierValide`, une sauvegarde qui échoue en
  // relancerait une à chaque lancement, jusqu'à marteler l'API.
  it("plus de 24 h depuis la dernière tentative → on sauvegarde", () => {
    expect(doitSauvegarderAuDemarrage(avec("2026-09-16T10-00-00"), REF)).toBe(true);
  });

  it("moins de 24 h → non", () => {
    expect(doitSauvegarderAuDemarrage(avec("2026-09-18T01-00-00"), REF)).toBe(false);
  });

  it("une tentative ÉCHOUÉE récente compte (elle a coûté des requêtes)", () => {
    expect(doitSauvegarderAuDemarrage(avec("2026-09-18T01-00-00", false), REF)).toBe(false);
    expect(doitSauvegarderAuDemarrage(avec("2026-09-16T10-00-00", false), REF)).toBe(true);
  });
});
