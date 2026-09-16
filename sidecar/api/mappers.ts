import type { RaindropItem } from "../../shared/types.js";
import type { Collection } from "../../shared/types.js";

export interface RawRaindrop {
  id: number;
  link: string;
  title?: string;
  excerpt?: string;
  note?: string;
  tags?: string[];
  created: string;
  last_update: string;
  important?: boolean;
  type?: string;
  domain?: string;
  cover?: { src: string }[];
  collection?: { $id: number };
  cache?: { status: string } | null; // gratuit dans la réponse de liste (vérifié 2026-09-16)
  broken?: boolean; // idem
}

// Forme réelle vérifiée par sonde le 2026-09-16 (get_collections/get_child_collections) :
// tableau nu de `{_id, ..., parent: {$id}|null, cover: string[], color?: string}` —
// PAS `{id, ...}` (voir sidecar/api/mappers.test.ts pour les fixtures probées).
export interface RawCollection {
  _id: number;
  title: string;
  parent?: { $id: number } | null;
  count: number;
  public?: boolean;
  view?: string;
  cover?: string[];
  color?: string;
}

export function toRaindropItem(raw: RawRaindrop): RaindropItem {
  return {
    id: raw.id,
    url: raw.link,
    title: raw.title ?? raw.link,
    excerpt: raw.excerpt ?? "",
    note: raw.note ?? "",
    domain: raw.domain ?? safeHost(raw.link),
    tags: raw.tags ?? [],
    created: raw.created,
    lastUpdate: raw.last_update,
    important: raw.important ?? false,
    type: raw.type ?? "link",
    cover: raw.cover?.[0]?.src ?? null,
    collectionId: raw.collection?.$id ?? -1,
    cache: raw.cache ?? null,
    broken: raw.broken ?? false,
  };
}

export function toCollection(raw: RawCollection): Collection {
  return {
    id: raw._id,
    title: raw.title,
    parentId: raw.parent?.$id ?? null,
    count: raw.count ?? 0,
    public: raw.public ?? false,
    view: raw.view ?? "list",
    cover: raw.cover?.[0] ?? null,
    color: raw.color ?? null,
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
