import { describe, it, expect } from "vitest";
import { racine, collectionsVides } from "./arbre";
import { collections } from "../test/fixtures";

// Tests transférés de Signaux.test.tsx avec la fonction (2026-09-19) —
// les tests cohabitent avec le code qu'ils couvrent.
describe("racine — §4 : la couleur appartient à la racine", () => {
  it("une descendante hérite du titre de sa racine (Rust ⊂ Dev → Dev)", () => {
    expect(racine(collections, 201)?.title).toBe("Dev");
  });

  it("une racine se rend elle-même ; un id inconnu ne rend rien", () => {
    expect(racine(collections, 101)?.title).toBe("Dev");
    expect(racine(collections, 999)).toBeUndefined();
  });
});

describe("collectionsVides — vide au sens où l'on peut supprimer", () => {
  const c = (id: number, count: number, parentId: number | null) => ({
    id, title: `C${id}`, parentId, count, public: false, view: "list", cover: null, color: null,
  });

  it("count 0 sans descendance : vide — supprimable", () => {
    expect(collectionsVides([c(1, 0, null), c(2, 4, null), c(3, 0, null)])).toEqual([c(1, 0, null), c(3, 0, null)]);
  });

  it("un parent sans signets mais AVEC enfants n'est pas vide — l'enfant sans signets l'est", () => {
    // Le compte de Raindrop ne voit que les signets directs : sans ce
    // filtre, « Supprimer les collections vides » annonçait le parent et
    // sa descendance partait avec lui (ou en était déracinée).
    const parent = c(10, 0, null);
    const enfant = c(11, 0, 10);
    expect(collectionsVides([parent, enfant])).toEqual([enfant]);
  });

  it("un ancêtre au SECOND degré n'est pas vide non plus", () => {
    const grandMere = c(20, 0, null);
    const mere = c(21, 0, 20);
    const fille = c(22, 0, 21);
    expect(collectionsVides([grandMere, mere, fille])).toEqual([fille]);
  });
});
