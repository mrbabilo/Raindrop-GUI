import { describe, it, expect } from "vitest";
import { racine } from "./arbre";
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
