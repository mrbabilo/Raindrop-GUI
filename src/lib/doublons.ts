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
