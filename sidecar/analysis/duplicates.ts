// Détection de doublons — pure, trois paliers : exact, normalisé, fuzzy.
// Un item ne figure que dans la PREMIÈRE catégorie qui le capte.

import type { DuplicateGroup, RaindropItem } from "../../shared/types.js";
import { normalizeUrl, fuzzyKey, estTitreGenerique } from "./normalize.js";

type ItemLite = DuplicateGroup["items"][number];

function groupsBy(items: RaindropItem[], key: (i: RaindropItem) => string, kind: DuplicateGroup["kind"]): DuplicateGroup[] {
  const map = new Map<string, ItemLite[]>();
  for (const i of items) {
    const k = key(i);
    const arr = map.get(k) ?? [];
    arr.push({ id: i.id, url: i.url, title: i.title, collectionId: i.collectionId, created: i.created });
    map.set(k, arr);
  }
  return [...map.entries()]
    .filter(([, arr]) => arr.length >= 2)
    .map(([k, arr]) => ({ key: k, kind, items: arr }));
}

export function findDuplicates(items: RaindropItem[]): {
  exact: DuplicateGroup[];
  normalized: DuplicateGroup[];
  fuzzy: DuplicateGroup[];
} {
  const exact = groupsBy(items, (i) => i.url.trim(), "exact");
  const exactIds = new Set(exact.flatMap((g) => g.items.map((i) => i.id)));
  const rest = items.filter((i) => !exactIds.has(i.id));
  const normalized = groupsBy(rest, (i) => normalizeUrl(i.url), "normalized");
  const normIds = new Set(normalized.flatMap((g) => g.items.map((i) => i.id)));
  const rest2 = rest.filter((i) => !normIds.has(i.id));
  // Un titre d'interstitiel (« Weiterleitungshinweis », « Just a moment »…)
  // ne dit RIEN de la page : le retirer du regroupement flou, MESURÉ le
  // 2026-09-19 — 163 des 551 signets flous réels étaient groupés par cet
  // unique mot, à travers des pages sans rapport.
  const lisibles = rest2.filter((i) => !estTitreGenerique(i.title));
  const fuzzy = groupsBy(lisibles, (i) => fuzzyKey(i.domain, i.title), "fuzzy");
  return { exact, normalized, fuzzy };
}

/**
 * Le filtre à la LECTURE, pour les groupes déjà stockés dans un cache antérieur
 * à la correction : mêmes règles, appliquées aux groupes. Les groupes sont
 * homogènes par construction (tous leurs items partagent la clé) — le titre du
 * premier décide pour tous.
 */
export function filtrerGeneriques(groups: DuplicateGroup[]): DuplicateGroup[] {
  return groups.filter((g) => !estTitreGenerique(g.items[0]?.title ?? ""));
}
