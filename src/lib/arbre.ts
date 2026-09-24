import type { Collection } from "../../shared/types";

// §4 : « La collection racine porte la couleur de sa thématique ; ses
// descendantes en héritent. » Remonter parentId jusqu'à la racine — pur,
// donc testable sans React, et sans hook dans une ligne virtualisée.
// Une boucle de parents (donnée corrompue) est bornée par la longueur de la
// liste : on ne remonte jamais plus de `collections.length` fois.
//
// Quitte `design/Signaux.tsx` le 2026-09-19 : c'est de la marche d'arbre, pas
// du dessin — et `DetailPane` garde sa propre `chaine()` locale, qui répond à
// une autre question (le FILS complet, pas seulement l'ancêtre).
export function racine(collections: Collection[], id: number): Collection | undefined {
  let courant = collections.find((c) => c.id === id);
  for (let i = 0; courant?.parentId != null && i < collections.length; i++) {
    const parent = collections.find((c) => c.id === courant!.parentId);
    if (!parent) break;
    courant = parent;
  }
  return courant;
}

/** « Collection vide » — définition tranchée par l'utilisateur (2026-09-20) :
 *  sans AUCUN signet, ET dont TOUTES les sous-collections sont vides
 *  également, récursivement. Une chaîne entièrement sans signets sort
 *  ENTIÈRE du prédicat — à la condition d'être supprimée des feuilles vers
 *  la racine (`triPourSuppression`). Le `count` de Raindrop ne voit que les
 *  signets directs : le verdict est donc récursif, pas « count === 0 ».
 *  Partagé par la vue Nettoyage et le compteur du tableau de bord : deux
 *  définitions diraient deux chiffres pour une même action. */
export function collectionsVides(toutes: readonly Collection[]): Collection[] {
  const enfants = new Map<number, Collection[]>();
  for (const c of toutes) {
    if (c.parentId === null) continue;
    const liste = enfants.get(c.parentId) ?? [];
    liste.push(c);
    enfants.set(c.parentId, liste);
  }
  const verdict = new Map<number, boolean>();
  const estVide = (c: Collection): boolean => {
    const enCache = verdict.get(c.id);
    if (enCache !== undefined) return enCache;
    verdict.set(c.id, false); // sentinelle anti-boucle : un cycle n'est « vide » pour personne
    const res = c.count === 0 && (enfants.get(c.id) ?? []).every(estVide);
    verdict.set(c.id, res);
    return res;
  };
  return toutes.filter(estVide);
}

/** Les ids à supprimer, des FEUILLES vers la racine : au moment où un parent
 *  part, sa descendance (vide) est déjà partie — peu importe alors que
 *  Raindrop emporte ou déracine les enfants restants. L'ordre des ids de
 *  même profondeur est conservé (sort stable). */
export function triPourSuppression(toutes: readonly Collection[], ids: readonly number[]): number[] {
  const parId = new Map(toutes.map((c) => [c.id, c]));
  const profondeur = (id: number): number => {
    let n = 0;
    let courant = parId.get(id);
    while (courant?.parentId !== null && courant?.parentId !== undefined && n <= toutes.length) {
      courant = parId.get(courant.parentId);
      n++;
    }
    return n;
  };
  return [...ids].sort((a, b) => profondeur(b) - profondeur(a));
}

/** L'id demandé et TOUTE sa descendance, tous niveaux. Une collection « vide »
 *  au sens du prédicat récursif peut être un parent : sa suppression
 *  individuelle emporte la chaîne (que `triPourSuppression` ordonnera),
 *  sinon Raindrop emporterait ou déracinerait les enfants restants. Le vu
 *  des visités ferme la boucle d'une donnée cyclique. */
export function chaineDe(toutes: readonly Collection[], id: number): number[] {
  const enfants = new Map<number, number[]>();
  for (const c of toutes) {
    if (c.parentId === null) continue;
    const liste = enfants.get(c.parentId) ?? [];
    liste.push(c.id);
    enfants.set(c.parentId, liste);
  }
  const chaine: number[] = [];
  const vus = new Set<number>();
  const descendre = (courant: number) => {
    if (vus.has(courant)) return;
    vus.add(courant);
    chaine.push(courant);
    for (const enfant of enfants.get(courant) ?? []) descendre(enfant);
  };
  descendre(id);
  return chaine;
}

/** « Dev › Rust » : une sous-collection se nomme par son chemin dans les
 *  sélecteurs (fiche, barre de sélection) — la liste est triée par titre,
 *  pas dans l'ordre de l'arbre. Marche bornée (une boucle de parents,
 *  donnée corrompue, ne tourne pas à l'infini). */
export function chemin(arbre: readonly Collection[], c: Collection): string {
  const noms = [c.title];
  let parent = arbre.find((p) => p.id === c.parentId);
  for (let i = 0; parent && i < arbre.length; i++) {
    noms.unshift(parent.title);
    const suivant = parent.parentId;
    parent = arbre.find((p) => p.id === suivant);
  }
  return noms.join(" › ");
}
