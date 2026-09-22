// src/lib/lisibilite.ts
import type { RaindropItem } from "../../shared/types";

// La règle de lisibilité (spec inversion §3) : UNE définition pour le clic
// des vues de bibliothèque ET le bouton « Lire » de la fiche. L'ordre des
// jugements EST la règle : l'archive locale gagne toujours ; sinon un
// archivage en vol bloque (la lecture échouerait sur un fichier absent) ;
// sinon une copie prête rend lisible par téléchargement à la demande.
export type Lisibilite =
  | { lisible: true; source: "locale" | "copie" }
  | { lisible: false; motif: "enVol" | "copieEchec" | "sansCopie" };

export function lisibilite(
  r: Pick<RaindropItem, "cache">,
  archivePresente: boolean,
  archivageEnVol: boolean,
): Lisibilite {
  if (archivePresente) return { lisible: true, source: "locale" };
  if (archivageEnVol) return { lisible: false, motif: "enVol" };
  if (r.cache?.status === "ready") return { lisible: true, source: "copie" };
  return { lisible: false, motif: r.cache != null ? "copieEchec" : "sansCopie" };
}
