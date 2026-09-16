import type { RaindropItem, Collection } from "../../shared/types";

export function raindrop(partial: Partial<RaindropItem> = {}): RaindropItem {
  return {
    id: 1000, url: "https://example.com/a", title: "Article exemple",
    excerpt: "Un extrait", note: "", domain: "example.com", tags: ["typescript"],
    created: "2025-01-01T12:00:00Z", lastUpdate: "2025-06-01T12:00:00Z",
    important: false, type: "link", cover: null, collectionId: 101,
    cache: null, broken: false, highlights: [],
    ...partial,
  };
}

export const collections: Collection[] = [
  { id: 101, title: "Dev", parentId: null, count: 12, public: false, view: "list", cover: null, color: null },
  { id: 102, title: "Design", parentId: null, count: 5, public: false, view: "grid", cover: null, color: null },
  { id: 201, title: "Rust", parentId: 101, count: 3, public: false, view: "list", cover: null, color: null },
];

export const tags = [
  { name: "typescript", count: 8 },
  { name: "rust", count: 3 },
  { name: "design", count: 5 },
];
