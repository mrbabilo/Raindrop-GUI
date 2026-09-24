import type { View } from "./appState";

// L'historique de navigation (⌘[ / ⌘]) — audit d'ergonomie du 2026-09-24.
// Pur : le reducer d'appState l'appelle, les tests passent par lui.
//
// Une Revue ou une lecture n'est pas une ÉTAPE : c'est un détour qui porte
// sa vue d'origine (`returnView`). En sortir par son retour ne laisse donc
// pas de doublon ; en sortir vers ailleurs empile la vue d'origine.

export interface Historique {
  passe: View[];
  futur: View[];
}

/** Au-delà, les plus anciennes s'oublient. */
const PLAFOND = 50;

export const vide: Historique = { passe: [], futur: [] };

export const transitoire = (v: View): v is Extract<View, { kind: "review" | "lecture" }> =>
  v.kind === "review" || v.kind === "lecture";

const egales = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b);

/** `go` de `depuis` vers `vers` : ce que l'historique en retient. */
export function enregistrer(h: Historique, depuis: View, vers: View): Historique {
  if (transitoire(vers)) return h;
  const quitte = transitoire(depuis) ? depuis.returnView : depuis;
  if (quitte === undefined || egales(quitte, vers)) return h;
  return { passe: [...h.passe, quitte].slice(-PLAFOND), futur: [] };
}

/** Un pas en arrière (`sens: "passe"`) ou en avant ; `null` au bout. */
export function pas(h: Historique, courante: View, sens: "passe" | "futur"): { h: Historique; vue: View } | null {
  if (sens === "passe") {
    const vue = h.passe.at(-1);
    if (vue === undefined) return null;
    return { h: { passe: h.passe.slice(0, -1), futur: [courante, ...h.futur].slice(0, PLAFOND) }, vue };
  }
  const vue = h.futur[0];
  if (vue === undefined) return null;
  return { h: { passe: [...h.passe, courante].slice(-PLAFOND), futur: h.futur.slice(1) }, vue };
}
