import type { KeyboardEvent } from "react";
import { useAppState } from "../state/appState";
import type { CibleDepot } from "../state/drag";
import { demanderEdition } from "../lib/demandeEdition";
import type { RaindropItem } from "../../shared/types";

/**
 * Les touches d'ACTION sur la ligne active — audit d'ergonomie du
 * 2026-09-24 : la liste ne connaissait que la navigation (flèches, Espace,
 * Entrée).
 *  - ⌫ / Suppr (⌘ admis, comme le Finder) : à la corbeille — avis + Annuler ;
 *  - F : bascule le favori ;
 *  - E : ouvre la fiche en édition.
 * Les verbes sont ceux du dépôt (`agir`), avec leur avis. Rend `true` si la
 * touche a été prise — sinon, elle poursuit vers la navigation.
 */
export function useTouchesLigne(items: readonly RaindropItem[], agir: (ids: number[], cible: CibleDepot) => Promise<boolean>) {
  const { view, selectRaindrop } = useAppState();
  // Corbeiller un signet déjà corbeillé le DÉTRUIT (CLAUDE.md) : pas de ⌫ ici.
  const enCorbeille = view.kind === "list" && view.collectionId === -99;
  return (e: KeyboardEvent): boolean => {
    // Seulement quand la LIGNE elle-même a le focus : une touche née dans
    // un de ses contrôles (la case) n'est pas pour elle.
    const id = Number((e.target as HTMLElement).dataset.signet);
    const r = items.find((x) => x.id === id);
    if (r === undefined || e.altKey || e.ctrlKey || e.shiftKey) return false;
    const touche = e.key.toLowerCase();
    if (touche === "backspace" || touche === "delete") {
      if (enCorbeille) return false;
      e.preventDefault();
      void agir([r.id], { sorte: "corbeille" });
      return true;
    }
    if (e.metaKey) return false;
    if (touche === "f") {
      e.preventDefault();
      void agir([r.id], { sorte: "favoris", valeur: !r.important });
      return true;
    }
    if (touche === "e") {
      e.preventDefault();
      demanderEdition(r.id);
      selectRaindrop(r.id);
      return true;
    }
    return false;
  };
}
