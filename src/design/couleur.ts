// La couleur que Raindrop attache à une collection, ramenée à ce dont notre
// signalétique a besoin : un ANGLE DE TEINTE.
//
// DESIGN.md §6 : `.coll-icon` peint `oklch(var(--app-wash-l) var(--app-wash-c)
// var(--h))` — la clarté et le chroma sont des jetons du thème, fixés une fois
// (0,95/0,035 en clair, 0,32/0,05 en sombre). Le pastel n'est donc pas un
// traitement à appliquer : il vient par construction dès qu'on fournit la
// teinte. Un rouge vif de Raindrop et une teinte du lexique passent par le
// même chemin et sortent au même niveau de douceur, dans les deux thèmes.

/** sRGB 0–255 → composante linéaire. */
function lineaire(octet: number): number {
  const c = octet / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// En deçà, la couleur n'a pas de teinte exploitable : un gris rend un angle
// arbitraire (mesuré : #808080 « donne » 89,9°) qu'il serait absurde de peindre.
const CHROMA_MINIMAL = 0.01;

/**
 * Angle de teinte OKLCH d'une couleur `#rrggbb`, ou `null` si la couleur est
 * absente, mal formée, ou trop grise pour porter une teinte.
 *
 * Conversion d'Ottosson : sRGB linéaire → LMS → OKLab, la teinte étant
 * l'angle de (a, b). Valeurs de contrôle calculées hors de ce code, sur les
 * couleurs réelles de la bibliothèque (voir le test).
 */
export function teinteDeHex(hex: string | null | undefined): number | null {
  if (typeof hex !== "string") return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (m === null) return null;
  const n = m[1]!;
  const r = lineaire(parseInt(n.slice(0, 2), 16));
  const v = lineaire(parseInt(n.slice(2, 4), 16));
  const b = lineaire(parseInt(n.slice(4, 6), 16));

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * v + 0.0514459929 * b);
  const m2 = Math.cbrt(0.2119034982 * r + 0.6806995451 * v + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * v + 0.6299787005 * b);

  const a = 1.9779984951 * l - 2.428592205 * m2 + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m2 - 0.808675766 * s;

  if (Math.hypot(a, bb) < CHROMA_MINIMAL) return null;
  return ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
}

/**
 * Écarte un jeu de teintes pour qu'aucune paire ne se confonde, **en gardant
 * leur ordre**.
 *
 * Mesuré sur la bibliothèque le 2026-09-17 : douze collections racines se
 * pressent dans deux zones du cercle — les orangés (16° à 95°) et les bleus
 * (211° à 250°) — quand il en compte 360. « Vie pratique » et « Web » sont à
 * **0,1°** l'une de l'autre, « Enseignement » et « Download » à 2°. À l'œil,
 * ce sont les mêmes couleurs, et la signalétique de famille ne distingue plus
 * rien.
 *
 * Les teintes sont donc redistribuées à intervalle constant, dans l'ordre où
 * elles se présentaient : la plus chaude le reste, la plus froide aussi, mais
 * chacune gagne l'écart qu'il faut pour se lire. L'ancrage sur la plus basse
 * garde le jeu là où il était plutôt que de le faire tourner.
 */
export function ecarterTeintes(teintes: readonly number[]): number[] {
  if (teintes.length === 0) return [];
  const ordre = [...teintes].map((h, i) => ({ h, i })).sort((a, b) => a.h - b.h);
  const pas = 360 / teintes.length;
  const depart = ordre[0]!.h;
  const out = new Array<number>(teintes.length);
  ordre.forEach((t, rang) => {
    out[t.i] = (depart + rang * pas) % 360;
  });
  return out;
}
