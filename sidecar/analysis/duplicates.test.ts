import { describe, it, expect } from "vitest";
import { findDuplicates, filtrerGeneriques } from "./duplicates.js";
import type { RaindropItem } from "../../shared/types.js";

function item(id: number, url: string, title: string): RaindropItem {
  return {
    id, url, title, excerpt: "", note: "", domain: new URL(url).hostname,
    tags: [], created: "2025-01-01T00:00:00Z", lastUpdate: "2025-01-01T00:00:00Z",
    important: false, type: "link", cover: null, collectionId: 0,
    // Requis par le DTO : les omettre laissait la factory diverger du type
    // qu'elle prétend produire, et un test bâti sur une forme fausse ne
    // prouve rien de la vraie.
    cache: null, broken: false, highlights: [],
  };
}

describe("findDuplicates", () => {
  const items = [
    item(1, "https://example.com/a", "Article"),
    item(2, "https://example.com/a", "Article (copie)"), // doublon exact
    item(3, "http://example.com/b/", "Deux"), // doublon normalisé avec 4
    item(4, "https://example.com/b?utm_source=x", "Deux bis"),
    item(5, "https://autre.org/x1", "Guide Rust"),
    item(6, "https://autre.org/x2", "guide rust !"), // doublon fuzzy avec 5
    item(7, "https://unique.net/only", "Unique"),
  ];

  it("détecte les groupes exacts, normalisés et fuzzy", () => {
    const d = findDuplicates(items);
    expect(d.exact.map((g) => g.items.map((i) => i.id).sort())).toEqual([[1, 2]]);
    expect(d.normalized.map((g) => g.items.map((i) => i.id).sort())).toEqual([[3, 4]]);
    expect(d.fuzzy.map((g) => g.items.map((i) => i.id).sort())).toEqual([[5, 6]]);
  });

  it("un item isolé n'apparaît nulle part", () => {
    const d = findDuplicates(items);
    const all = [...d.exact, ...d.normalized, ...d.fuzzy].flatMap((g) => g.items.map((i) => i.id));
    expect(all).not.toContain(7);
  });

  it("classe kind correctement", () => {
    const d = findDuplicates(items);
    expect(d.exact[0]!.kind).toBe("exact");
    expect(d.normalized[0]!.kind).toBe("normalized");
    expect(d.fuzzy[0]!.kind).toBe("fuzzy");
  });
});

// Le défaut du 2026-09-19, mesuré sur la bibliothèque réelle : 163 des 551
// signets flous étaient groupés par le seul mot « Weiterleitungshinweis » —
// le titre d'interstitiel de redirection de Google, enregistré comme titre
// par korben.info et jeuxvideo.com. Même domaine + même titre générique
// groupait des pages sans aucun rapport.
describe("les titres d'interstitiel ne groupent plus rien (fuzzy)", () => {
  const interstitiel = (id: number, domaine: string): RaindropItem =>
    ({
      id, url: `https://${domaine}/page-${id}`, title: "Weiterleitungshinweis",
      domain: domaine, tags: [], created: "2020-01-01T00:00:00.000Z",
    }) as unknown as RaindropItem;

  it("un domaine entier d'interstitiels ne produit AUCUN groupe", () => {
    const items = [interstitiel(1, "korben.info"), interstitiel(2, "korben.info"), interstitiel(3, "korben.info")];
    const { fuzzy } = findDuplicates(items);
    expect(fuzzy).toEqual([]);
  });

  it("les vrais titres identiques continuent de grouper — la présence d'abord", () => {
    const reel = (id: number): RaindropItem =>
      ({
        id, url: `https://exemple.org/a-${id}`, title: "Codage pour Enfants - Apprenez Python",
        domain: "exemple.org", tags: [], created: "2020-01-01T00:00:00.000Z",
      }) as unknown as RaindropItem;
    const { fuzzy } = findDuplicates([reel(1), reel(2)]);
    expect(fuzzy).toHaveLength(1);
    expect(fuzzy[0]!.items).toHaveLength(2);
  });

  it("filtrerGeneriques nettoie un cache ANCIEN à la lecture", () => {
    const groupe = { key: "korben.info|weiterleitungshinweis", kind: "fuzzy" as const, items: [interstitiel(1, "korben.info"), interstitiel(2, "korben.info")] };
    const sain = { key: "k|vrai titre", kind: "fuzzy" as const, items: [{ id: 9, url: "u", title: "Vrai titre", collectionId: 1, created: "2020-01-01T00:00:00.000Z" }] };
    const filtres = filtrerGeneriques([groupe, sain]);
    // La présence d'abord : le groupe sain DOIT survivre, sinon ce test
    // célébrerait un filtre qui jette tout.
    expect(filtres).toEqual([sain]);
  });
});
