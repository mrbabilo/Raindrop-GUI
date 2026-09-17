import { describe, it, expect } from "vitest";
import { teinteDeHex, ecarterTeintes } from "./couleur";

// Références calculées HORS de ce code (script Python indépendant, formule
// d'Ottosson) sur les couleurs réelles de la bibliothèque — sinon le test ne
// vérifierait que sa propre copie de la conversion.
const REFERENCES: [string, number][] = [
  ["#f44434", 29.5],  // 07 - PASSIONS, rouge
  ["#2394f4", 250.0], // 08 - WEB, bleu
  ["#435b63", 220.4], // 10 - SERVEURS, ardoise
  ["#c63b4f", 16.8],  // 05 - BABILOSAPIENS, framboise
  ["#a17c03", 87.4],  // 04 - ENSEIGNEMENT, ocre
  ["#a37824", 79.8],  // 03 - FORMATION, bronze
];

describe("teinteDeHex", () => {
  it("rend l'angle de teinte OKLCH des couleurs réelles de la bibliothèque", () => {
    for (const [hex, attendu] of REFERENCES) {
      expect(teinteDeHex(hex)).toBeCloseTo(attendu, 0);
    }
  });

  it("accepte avec ou sans dièse, quelle que soit la casse", () => {
    expect(teinteDeHex("F44434")).toBeCloseTo(29.5, 0);
    expect(teinteDeHex("  #F44434 ")).toBeCloseTo(29.5, 0);
  });

  // Un gris rend un angle arbitraire — mesuré, #808080 « donne » 89,9° — qu'il
  // serait absurde de peindre. Sans teinte, la signalétique retombe en gris
  // (§3 : `--sat: 0`), ce que `null` déclenche chez l'appelant.
  it("rend null pour ce qui n'a pas de teinte", () => {
    expect(teinteDeHex("#808080")).toBeNull();
    expect(teinteDeHex("#ffffff")).toBeNull();
    expect(teinteDeHex("#000000")).toBeNull();
  });

  it("rend null plutôt que de deviner sur une entrée douteuse", () => {
    expect(teinteDeHex(null)).toBeNull();
    expect(teinteDeHex(undefined)).toBeNull();
    expect(teinteDeHex("")).toBeNull();
    expect(teinteDeHex("rouge")).toBeNull();
    expect(teinteDeHex("#abc")).toBeNull();      // forme courte non gérée
    expect(teinteDeHex("#gggggg")).toBeNull();
  });
});

describe("ecarterTeintes", () => {
  // Les teintes réelles des douze racines colorées : deux zones seulement,
  // et deux paires que rien ne distingue (0,1° et 2°).
  const REELLES = [16.8, 29.5, 35.2, 79.8, 87.4, 89.4, 95, 211.8, 220.4, 237.5, 249.9, 250];

  it("aucune paire ne reste confondue", () => {
    const ecartees = [...ecarterTeintes(REELLES)].sort((a, b) => a - b);
    for (let i = 1; i < ecartees.length; i++) {
      expect(ecartees[i]! - ecartees[i - 1]!).toBeGreaterThanOrEqual(25);
    }
  });

  // Ce qui était le plus chaud le reste : on écarte, on ne rebat pas.
  it("garde l'ordre d'origine", () => {
    const e = ecarterTeintes(REELLES);
    for (let i = 1; i < REELLES.length; i++) {
      expect(e[i]!).toBeGreaterThan(e[i - 1]!);
    }
    expect(e[0]).toBeCloseTo(16.8, 1); // ancré sur la plus basse
  });

  it("l'ordre est rendu à la place d'origine, pas trié", () => {
    // Entrée volontairement désordonnée : la sortie doit suivre les index.
    const e = ecarterTeintes([300, 10, 200]);
    expect(e[1]).toBeLessThan(e[2]!); // 10 reste le plus bas
    expect(e[2]).toBeLessThan(e[0]!); // 200 avant 300
  });

  it("cas dégénérés", () => {
    expect(ecarterTeintes([])).toEqual([]);
    expect(ecarterTeintes([42])).toEqual([42]);
  });
});
