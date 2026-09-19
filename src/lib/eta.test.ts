import { describe, it, expect } from "vitest";
import { estimerSecondes, formaterDuree } from "./eta";

describe("estimerSecondes", () => {
  it("un débit régulier donne le reste", () => {
    // 100 éléments en 10 s → 10/s ; il en reste 900 → 90 s.
    expect(estimerSecondes([{ t: 0, done: 0 }, { t: 10_000, done: 100 }], 1000)).toBeCloseTo(90, 5);
  });

  it("ne dit RIEN tant que la mesure ne vaut rien", () => {
    // La présence d'abord : avec un intervalle suffisant, l'estimation sort.
    expect(estimerSecondes([{ t: 0, done: 0 }, { t: 5_000, done: 50 }], 100)).not.toBeNull();
    // Deux points collés : le débit serait du bruit, et l'estimation
    // sauterait de plusieurs minutes à chaque rendu.
    expect(estimerSecondes([{ t: 0, done: 0 }, { t: 300, done: 1 }], 100)).toBeNull();
    // Un seul point : aucun débit.
    expect(estimerSecondes([{ t: 0, done: 0 }], 100)).toBeNull();
    // Aucune avancée sur la fenêtre : diviser par zéro rendrait l'infini.
    expect(estimerSecondes([{ t: 0, done: 7 }, { t: 9_000, done: 7 }], 100)).toBeNull();
    // Total inconnu.
    expect(estimerSecondes([{ t: 0, done: 0 }, { t: 9_000, done: 5 }], 0)).toBeNull();
  });

  it("segment terminé : plus rien à attendre", () => {
    expect(estimerSecondes([{ t: 0, done: 0 }, { t: 9_000, done: 100 }], 100)).toBeNull();
  });
});

describe("formaterDuree", () => {
  it("dit l'ordre de grandeur, jamais une fausse précision", () => {
    expect(formaterDuree(12)).toBe("moins d'une minute");
    expect(formaterDuree(44)).toBe("moins d'une minute");
    expect(formaterDuree(80)).toBe("environ 1 minute");
    expect(formaterDuree(443)).toBe("environ 7 minutes");
    expect(formaterDuree(4_200)).toBe("environ 1 h 10");
  });
});
