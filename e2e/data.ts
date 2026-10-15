import type { Collection, RaindropItem } from "../shared/types";

export function bookmarks(): RaindropItem[] {
  return Array.from({ length: 60 }, (_, i) => ({
    id: 1000 + i,
    title: i === 0 ? "Guide de conception accessible — navigation, couleurs et interactions" : `Ressource ${String(i + 1).padStart(2, "0")}`,
    url: `https://example.test/articles/${i + 1}`,
    domain: "example.test", excerpt: "Extrait de démonstration pour les tests UI.",
    note: "", tags: i % 2 === 0 ? ["design", "accessibilité"] : ["typescript"],
    type: "article", cover: null, collectionId: 101, important: false,
    cache: null, broken: false, highlights: [],
    created: "2026-09-01T12:00:00Z", lastUpdate: "2026-09-01T12:00:00Z",
  }));
}

export const collections: Collection[] = Array.from({ length: 30 }, (_, i) => ({
  id: 101 + i, title: i === 0 ? "Bibliothèque de travail" : `Collection ${String(i).padStart(2, "0")}`,
  parentId: null, count: i === 0 ? 60 : 0, public: false, view: "list", cover: null,
  color: ["#3b82f6", "#aa4b99", "#d18c35"][i % 3]!,
}));
