import { describe, it, expect } from "vitest";
import { findDuplicates } from "./duplicates.js";
import type { RaindropItem } from "../../shared/types.js";

function item(id: number, url: string, title: string): RaindropItem {
  return {
    id, url, title, excerpt: "", note: "", domain: new URL(url).hostname,
    tags: [], created: "2025-01-01T00:00:00Z", lastUpdate: "2025-01-01T00:00:00Z",
    important: false, type: "link", cover: null, collectionId: 0,
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
