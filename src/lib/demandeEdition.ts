// « Ouvrir la fiche EN ÉDITION » (touche E de la liste — audit d'ergonomie
// du 2026-09-24). L'état d'édition appartient à la fiche, et elle n'est pas
// forcément montée quand la demande part : la demande attend ici qu'elle la
// consomme — au montage, au changement de signet, ou tout de suite si la
// fiche de ce signet est déjà ouverte (l'événement).
let enAttente: number | null = null;
const signal = new EventTarget();

export function demanderEdition(id: number): void {
  enAttente = id;
  signal.dispatchEvent(new Event("edition"));
}

/** Vrai, et une seule fois, si l'édition de CE signet est demandée. */
export function consommerEdition(id: number): boolean {
  if (enAttente !== id) return false;
  enAttente = null;
  return true;
}

export function surDemandeEdition(f: () => void): () => void {
  signal.addEventListener("edition", f);
  return () => signal.removeEventListener("edition", f);
}
