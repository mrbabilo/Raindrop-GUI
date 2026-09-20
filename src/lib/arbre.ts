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

/** « Collection vide » au sens où l'on peut la supprimer : AUCUN signet ET
 *  AUCUNE sous-collection, à n'importe quelle profondeur. Le `count` de
 *  Raindrop ne voit que les signets directs — un parent vide de signets mais
 *  porteur d'enfants n'est pas vide, et le supprimer emporterait (ou
 *  déracinerait) sa descendance. Partagé par la vue Nettoyage et le compteur
 *  du tableau de bord : deux définitions diraient deux chiffres pour une
 *  même action. */
export function collectionsVides(toutes: readonly Collection[]): Collection[] {
  const parents = new Set(toutes.map((c) => c.parentId).filter((p): p is number => p !== null));
  return toutes.filter((c) => c.count === 0 && !parents.has(c.id));
}
