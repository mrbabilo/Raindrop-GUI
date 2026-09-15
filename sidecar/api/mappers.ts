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
}

export interface RawCollection {
  id: number;
  title: string;
  parent?: { $id: number };
  count: number;
  public?: boolean;
  view?: string;
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
  };
}

export function toCollection(raw: RawCollection): Collection {
  return {
    id: raw.id,
    title: raw.title,
    parentId: raw.parent?.$id ?? null,
    count: raw.count ?? 0,
    public: raw.public ?? false,
    view: raw.view ?? "list",
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
