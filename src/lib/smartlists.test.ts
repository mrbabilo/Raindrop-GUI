import { describe, it, expect } from "vitest";
import { filtreActif, serialiserVue, vueVersView } from "./smartlists";
import type { SmartList } from "../../shared/types";
import type { View } from "../state/appState";

type ListView = Extract<View, { kind: "list" }>;

// Fabrique du type ÉTROIT : serialiserVue le réclame (filtreActif accepte
// View, dont ListView est assignable — une seule fabrique suffit).
const liste = (plus: Partial<ListView> = {}): ListView => ({
  kind: "list", collectionId: 0, label: "Tous", ...plus,
});

describe("filtreActif", () => {
  // Un cas par filtre (spec §4) : étiquettes, recherche, domaine, dates,
  // nature, non-taggés.
  it.each([
    ["étiquettes", { tags: ["rust"] }],
    ["recherche", { search: "rust" }],
    ["domaine", { domain: "example.com" }],
    ["date début", { createdStart: "2025-01-01" }],
    ["date fin", { createdEnd: "2025-12-31" }],
    ["nature", { media: "article" }],
    ["non-taggés", { notag: true }],
  ])("actif avec %s", (_nom, plus) => {
    expect(filtreActif(liste(plus))).toBe(true);
  });

  it("inactif sans filtre — le TRI seul ne compte pas (spec §4)", () => {
    expect(filtreActif(liste())).toBe(false);
    expect(filtreActif(liste({ sort: "title" }))).toBe(false);
    // Un affichage n'est pas un filtre.
    expect(filtreActif(liste({ viewMode: "mosaic" }))).toBe(false);
  });

  it("inactif hors vue list — le bouton n'existe qu'aux listes", () => {
    expect(filtreActif({ kind: "cleanup" })).toBe(false);
  });
});

describe("serialiserVue", () => {
  it("ne stocke QUE les champs définis : JSON n'a pas de undefined", () => {
    const vue = serialiserVue(liste({ collectionId: 101, tags: ["rust"], sort: "-created" }));
    expect(vue).toEqual({ collectionId: 101, tags: ["rust"], sort: "-created" });
    expect("search" in vue).toBe(false);
    expect("notag" in vue).toBe(false);
  });

  it("canonise les étiquettes (même forme que listQueryArgs)", () => {
    const vue = serialiserVue(liste({ tags: ["webdesign", "code", "WebDesign", " "] }));
    // Dédoublonnage à la casse (WebDesign ignoré), vide sorti, trié (canoniser).
    expect(vue.tags).toEqual(["code", "webdesign"]);
  });
});

describe("vueVersView", () => {
  const sl: SmartList = {
    id: "sl-1",
    label: "Rust dans Dev",
    vue: { collectionId: 101, tags: ["rust", "RUST"], search: "borrows", sort: "title" },
    cree: "2026-09-22T10:00:00Z",
  };

  it("rejette la vue stockée dans le View : identifiant, label, filtres", () => {
    const view = vueVersView(sl);
    // Les étiquettes sont canonisées : ["rust", "RUST"] dédoublonné à la
    // casse (première occurrence gardée) → ["rust"].
    expect(view).toEqual({
      kind: "list",
      collectionId: 101,
      label: "Rust dans Dev",
      smartlistId: "sl-1",
      tags: ["rust"],
      search: "borrows",
      sort: "title",
    });
  });

  it("une vue minimale (collectionId seul) produit une vue list sans filtre", () => {
    const view = vueVersView({ id: "sl-2", label: "Tous", vue: { collectionId: 0 }, cree: "2026-09-22T10:00:00Z" });
    expect(view).toEqual({ kind: "list", collectionId: 0, label: "Tous", smartlistId: "sl-2" });
  });
});
