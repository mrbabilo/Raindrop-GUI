import { describe, it, expect } from "vitest";
import { trierCollections, comparerTitres } from "./ordre";
import type { Collection } from "../../shared/types";

const col = (id: number, title: string): Collection =>
  ({ id, title, parentId: null, count: 0, public: false, view: "list", cover: null, color: null });

const titres = (cs: Collection[]) => cs.map((c) => c.title);

describe("ordre des collections", () => {
  // Le grief : l'ordre de l'API place « 10 - … » entre « 1 » et « 2 ».
  it("range les nombres comme des nombres, zéro initial compris", () => {
    const tries = trierCollections([
      col(3, "10 - SERVEURS"), col(1, "2 - deux"), col(2, "1 - un"), col(4, "09 - ACHATS"),
    ]);
    expect(titres(tries)).toEqual(["1 - un", "2 - deux", "09 - ACHATS", "10 - SERVEURS"]);
  });

  // Titres réels de la bibliothèque : numérotés, accentués, avec emoji.
  it("classe les titres réels de la bibliothèque", () => {
    const tries = trierCollections([
      col(1, "10 - 📚 À TRIER"), col(2, "01 - 🎓 ÉCOLE & ENSEIGNEMENT"),
      col(3, "07 - PASSIONS"), col(4, "02 - 💻 FORMATION & CODE"),
    ]);
    expect(titres(tries)).toEqual([
      "01 - 🎓 ÉCOLE & ENSEIGNEMENT", "02 - 💻 FORMATION & CODE",
      "07 - PASSIONS", "10 - 📚 À TRIER",
    ]);
  });

  // Un tri par code d'unité mettrait « Éditeur » après « Zèbre », et « apple »
  // avant « Ananas ».
  it("range les accents à leur lettre et ignore la casse", () => {
    expect(titres(trierCollections([
      col(1, "Zèbre"), col(2, "Éditeur"), col(3, "apple"), col(4, "Ananas"),
    ]))).toEqual(["Ananas", "apple", "Éditeur", "Zèbre"]);
  });

  it("rend une COPIE — les données d'une requête ne se trient pas en place", () => {
    const source = [col(1, "B"), col(2, "A")];
    const tries = trierCollections(source);
    expect(titres(source)).toEqual(["B", "A"]);
    expect(tries).not.toBe(source);
  });

  it("comparerTitres sert aussi hors des collections", () => {
    expect(comparerTitres("a", "b")).toBeLessThan(0);
    expect(comparerTitres("b", "a")).toBeGreaterThan(0);
    expect(comparerTitres("a", "a")).toBe(0);
  });
});
