import { describe, it, expect } from "vitest";
import { teinteDeHex } from "./couleur";

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
