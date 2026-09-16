import type { RaindropItem } from "../../shared/types.js";
import type { Collection } from "../../shared/types.js";

// Forme réelle vérifiée par sonde le 2026-09-16 (R7cP-2 : 6 pages de
// search_raindrops, 300 items, 300 ids distincts lus via `it._id`) :
// l'identifiant porte **`_id`**, pas `id` — même défaut que RawCollection
// ci-dessous. Contrôle navigateur : sans ce nom, GET /api/raindrops rendait
// `data-testid="row-undefined"` sur toutes les lignes.
export interface RawRaindrop {
  _id: number;
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
  // Chaîne unique dans la vraie réponse (jamais {src}[]) — vérifié par sonde
  // sur 400 raindrops réels le 2026-09-16 : toujours une string, parfois
  // vide ("" — ~5 % des items, pas de miniature), jamais absente en pratique
  // mais traitée en défensif comme les autres champs optionnels du DTO.
  cover?: string;
  collection?: { $id: number };
  cache?: { status: string } | null; // gratuit dans la réponse de liste (vérifié 2026-09-16)
  broken?: boolean; // idem
  // Gratuit dans l'item complet (GET /raindrop/{id}, sonde 1265539367,
  // R8cP-1) ; ABSENT des items de liste → [] (voir RawHighlight : _id est un
  // ObjectId chaîne, pas de `color` en réel).
  highlights?: RawHighlight[];
}

// Forme réelle vérifiée par sonde le 2026-09-16 (R8cP-1) : `lastUpdate` et
// `creatorRef` existent mais ne traversent pas (hors Produces) ; `color`
// abandonné — donnée inexistante en réel.
export interface RawHighlight {
  _id: string; // ObjectId chaîne, PAS un number
  text: string;
  note: string;
  created: string;
  lastUpdate: string;
  creatorRef: { _id: number; name: string; avatar: string; email: string };
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
    id: raw._id,
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
    cover: raw.cover || null, // "" (pas de miniature) et absence traitées pareil
    collectionId: raw.collection?.$id ?? -1,
    cache: raw.cache ?? null,
    broken: raw.broken ?? false,
    // Liste sans la clé → [] ; item complet → normalisés (le front ne voit
    // jamais le format brut : _id→id, lastUpdate/creatorRef jetés ici).
    highlights: (raw.highlights ?? []).map((h) => ({
      id: h._id,
      text: h.text,
      note: h.note,
      created: h.created,
    })),
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
