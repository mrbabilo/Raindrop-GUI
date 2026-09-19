import type { DuplicateGroup } from "../../shared/types";

/**
 * Qui garde-t-on, dans un groupe de doublons ? Règle tranchée avec
 * l'utilisateur (2026-09-19) : **la plus ancienne** — l'original ; à date
 * égale, https avant http ; à égalité, l'ordre du groupe (déterministe pour
 * les tests). Pure, testée, partagée par la sélection intelligente de carte
 * et le tri global.
 */
export function choisirGarde<T extends { created: string; url: string }>(items: readonly T[]): T {
  const candidates = [...items];
  return candidates.sort((a, b) => {
    if (a.created !== b.created) return a.created < b.created ? -1 : 1;
    const aHttps = a.url.startsWith("https://") ? 0 : 1;
    const bHttps = b.url.startsWith("https://") ? 0 : 1;
    return aHttps - bHttps;
  })[0]!;
}

/** Les copies d'un groupe, gardé exclu — ce qui part en Revue. */
export function copiesDe<T extends { id: number }>(items: readonly T[], gardeId: number): T[] {
  return items.filter((i) => i.id !== gardeId);
}

/** Les paires gardé/copies de PLUSIEURS groupes (le tri global), réduites aux
 *  catégories CERTAINES — exact et normalisé. Le flou reste manuel : même
 *  domaine + même titre n'est pas une certitude, et la pollution au titre
 *  d'interstitiel (« Weiterleitungshinweis ») vient de le démontrer. */
export function pairesCertaines(groupes: { exact: DuplicateGroup[]; normalized: DuplicateGroup[]; fuzzy: DuplicateGroup[] }) {
  return [...groupes.exact, ...groupes.normalized].map((g) => {
    const garde = choisirGarde(g.items);
    return { garde, copies: copiesDe(g.items, garde.id) };
  });
}

/**
 * L'élagage des groupes après mise à la corbeille.
 *
 * Les groupes vivent dans le CACHE d'analyse, calculé au scan — supprimer
 * des signets ne les recalcule pas, et l'écran affichait encore les morts
 * jusqu'au re-scan suivant. On taille : chaque copie corbeillée sort de son
 * groupe, et un groupe réduit à UN exemplaire N'EST PLUS un doublon. Le
 * prochain scan refera le travail de fond ; d'ici là, l'écran dit vrai.
 */
export function elaguerGroupes(
  groupes: { exact: DuplicateGroup[]; normalized: DuplicateGroup[]; fuzzy: DuplicateGroup[] },
  supprimes: readonly number[],
): { exact: DuplicateGroup[]; normalized: DuplicateGroup[]; fuzzy: DuplicateGroup[] } {
  const partis = new Set(supprimes);
  const tailler = (gs: DuplicateGroup[]): DuplicateGroup[] =>
    gs
      .map((g) => ({ ...g, items: g.items.filter((i) => !partis.has(i.id)) }))
      .filter((g) => g.items.length >= 2);
  return { exact: tailler(groupes.exact), normalized: tailler(groupes.normalized), fuzzy: tailler(groupes.fuzzy) };
}
