import type { Collection } from "../../shared/types";

// L'ordre dans lequel les collections se lisent — le MÊME partout : sidebar,
// palette ⌘K, destinations de déplacement. L'API les rend dans son propre
// ordre ; sans ce tri, le même arbre se lirait différemment selon l'écran.
//
// Alphanumérique NATUREL : « 10 - SERVEURS » vient après « 9 - … », pas
// entre « 1 » et « 2 ». Les titres réels de la bibliothèque sont numérotés à
// zéro initial (« 01 - ÉCOLE », « 07 - CULTURE ») et portent des accents et
// des emoji — `numeric` règle les nombres, le collateur français range
// « Éditeur » avec les E plutôt qu'après Z.
//
// Le collateur est construit UNE fois : en instancier un par comparaison
// coûterait plus cher que la comparaison elle-même.
const collateur = new Intl.Collator("fr", { numeric: true });

export const comparerTitres = (a: string, b: string): number => collateur.compare(a, b);

/** Une copie triée — jamais de tri en place sur les données d'une requête. */
export function trierCollections(collections: Collection[]): Collection[] {
  return [...collections].sort((a, b) => comparerTitres(a.title, b.title));
}
