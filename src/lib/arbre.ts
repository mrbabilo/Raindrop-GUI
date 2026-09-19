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
