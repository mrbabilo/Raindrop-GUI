import { describe, it, expect } from "vitest";
import { racine, collectionsVides, triPourSuppression, chaineDe } from "./arbre";
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

describe("collectionsVides — vide : sans AUCUN signet, soi et toute sa descendance", () => {
  // Définition tranchée par l'utilisateur (2026-09-20) : une collection est
  // « vide » si elle ne porte AUCUN signet ET si TOUTES ses sous-collections
  // sont vides également. La chaîne sans signets se supprime ENTIÈRE — à la
  // condition d'aller des feuilles vers la racine (tri pour suppression).
  const c = (id: number, count: number, parentId: number | null) => ({
    id, title: `C${id}`, parentId, count, public: false, view: "list", cover: null, color: null,
  });

  it("une feuille sans signets est vide ; une feuille avec signets ne l'est pas", () => {
    expect(collectionsVides([c(1, 0, null), c(2, 4, null), c(3, 0, null)])).toEqual([c(1, 0, null), c(3, 0, null)]);
  });

  it("une chaîne sans AUCUN signet est vide ENTIÈRE — grand-mère comprise", () => {
    const grandMere = c(20, 0, null);
    const mere = c(21, 0, 20);
    const fille = c(22, 0, 21);
    expect(collectionsVides([grandMere, mere, fille])).toEqual([grandMere, mere, fille]);
  });

  it("un parent sans signets mais avec un enfant PORTEUR de signets n'est pas vide", () => {
    // Le `count` de Raindrop ne voit que les signets directs : sans le
    // verdict récursif, un parent « 0 » annoncerait un vide mensonger.
    const parent = c(10, 0, null);
    const enfant = c(11, 3, 10);
    expect(collectionsVides([parent, enfant])).toEqual([]);
  });

  it("une chaîne S'ARRÊTE à la première descendance porteuse : 0 → 5 → 0 ne rend que la feuille", () => {
    const grandMere = c(20, 0, null);
    const mere = c(21, 5, 20);
    const fille = c(22, 0, 21);
    expect(collectionsVides([grandMere, mere, fille])).toEqual([fille]);
  });

  it("un parent sans signets n'est vide que si TOUS ses enfants le sont", () => {
    const parent = c(10, 0, null);
    const videEnfant = c(11, 0, 10);
    const pleineEnfant = c(12, 2, 10);
    expect(collectionsVides([parent, videEnfant, pleineEnfant])).toEqual([videEnfant]);
  });

  it("une boucle de parents (donnée corrompue) ne boucle pas à l'infini", () => {
    const a = c(30, 0, 31);
    const b = c(31, 0, 30);
    expect(collectionsVides([a, b])).toEqual([]);
  });
});

describe("triPourSuppression — les feuilles partent avant leur racine", () => {
  const c = (id: number, parentId: number | null) => ({
    id, title: `C${id}`, parentId, count: 0, public: false, view: "list", cover: null, color: null,
  });

  it("la fille (profondeur 2) avant la mère (1) avant la grand-mère (0)", () => {
    const arbre = [c(20, null), c(21, 20), c(22, 21), c(23, 21)];
    expect(triPourSuppression(arbre, [20, 21, 22, 23])).toEqual([22, 23, 21, 20]);
  });

  it("l'ordre des frères de même profondeur est conservé (sort stable)", () => {
    const arbre = [c(20, null), c(21, 20), c(22, 20)];
    expect(triPourSuppression(arbre, [21, 22])).toEqual([21, 22]);
  });

  it("un id inconnu du fichier des collections (déjà parti ?) ne fait pas jeter le tri", () => {
    // Son DELETE répondra 404 et se dira inline — le tri, lui, n'a pas à
    // décider d'un ordre pour ce qu'il ne connaît pas.
    const arbre = [c(20, null), c(21, 20)];
    const tri = triPourSuppression(arbre, [20, 999]);
    expect(tri).toContain(20);
    expect(tri).toContain(999);
  });
});

describe("chaineDe — l'id et toute sa descendance", () => {
  // Une collection « vide » au sens du prédicat récursif peut être un
  // PARENT (d'enfants eux-mêmes vides). Son DELETE à lui seul laisserait
  // Raindrop emporter ou déraciner les enfants : la suppression
  // individuelle emporte la chaîne, que triPourSuppression ordonnera.
  const c = (id: number, parentId: number | null) => ({
    id, title: `C${id}`, parentId, count: 0, public: false, view: "list", cover: null, color: null,
  });

  it("une feuille ne rend qu'elle-même", () => {
    const arbre = [c(20, null), c(21, 20)];
    expect(chaineDe(arbre, 21)).toEqual([21]);
  });

  it("un parent rend sa descendance ENTIÈRE, tous niveaux", () => {
    const arbre = [c(20, null), c(21, 20), c(22, 21), c(30, null)];
    expect(chaineDe(arbre, 20)).toEqual([20, 21, 22]);
  });

  it("un cycle de parents (donnée corrompue) ne descend pas à l'infini", () => {
    const a = c(30, 31);
    const b = c(31, 30);
    expect(chaineDe([a, b], 30).sort((x, y) => x - y)).toEqual([30, 31]);
  });
});
