// La comparaison de versions de l'application (« v0.1.0-pre.N »). Une
// comparaison lexicale dirait pre.9 > pre.10 : les numéros de prérelease se
// comparent NUMÉRIQUEMENT, après majeur/mineur/patch, et une release (sans
// suffixe) est plus récente que n'importe quelle prérelease.

export interface VersionParsee {
  majeur: number;
  mineur: number;
  patch: number;
  /** Le numéro de prérelease, ou null pour une release. */
  pre: number | null;
}

export function parserVersion(v: string): VersionParsee | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-pre\.(\d+))?$/.exec(v.trim());
  if (!m) return null;
  return { majeur: +m[1]!, mineur: +m[2]!, patch: +m[3]!, pre: m[4] ? +m[4]! : null };
}

export function comparerVersion(a: string, b: string): number {
  const pa = parserVersion(a);
  const pb = parserVersion(b);
  // Indécomparable = aucune différence : l'écran n'affiche pas de mise à
  // jour sur un tag mal formé (jamais un badge fabriqué).
  if (!pa || !pb) return 0;
  for (const c of ["majeur", "mineur", "patch"] as const) {
    if (pa[c] !== pb[c]) return pa[c] - pb[c];
  }
  // Une RELEASE est plus récente que n'importe quelle prérelease : sans
  // suffixe = l'infini, pas -1 (qui la mettrait au-dessous de pre.1).
  // Deux releases : ∞ − ∞ vaudrait NaN, pas 0 (audit du 2026-09-23).
  if (pa.pre === pb.pre) return 0;
  const rang = (p: number | null) => p ?? Number.POSITIVE_INFINITY;
  return rang(pa.pre) - rang(pb.pre);
}

export function estPlusRecente(a: string, b: string): boolean {
  return comparerVersion(a, b) > 0;
}
