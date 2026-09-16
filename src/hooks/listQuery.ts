import type { View } from "../state/appState";
import type { RaindropQuery } from "./useRaindrops";

type ListView = Extract<View, { kind: "list" }>;

export interface ListQueryOptions {
  // NatureChips compte les items par nature sur la vue NON filtrée par
  // nature (R6bP-1) : sinon activer une puce ferait s'effondrer le
  // dénombrement des autres à zéro, et la rangée à une seule entrée.
  omitMedia?: boolean;
}

// Construit les arguments de useRaindrops depuis la vue "list" — partagé
// entre ListPane (rendu réel de la liste) et NatureChips (comptage de
// fréquence par nature, DESIGN.md §11) pour que les deux clés de requête ne
// divergent jamais. Sans nature active, les deux appels partagent la même
// queryKey (TanStack Query déduplique) : zéro requête en plus.
// Task 7b ajoutera domain/createdStart/createdEnd ici, en un seul endroit.
export function listQueryArgs(view: View, opts: ListQueryOptions = {}): RaindropQuery {
  const q: ListView = view.kind === "list" ? view : { kind: "list", collectionId: 0, label: "" };
  return {
    collectionId: q.collectionId,
    search: q.search,
    sort: q.sort,
    notag: q.notag,
    media: opts.omitMedia ? undefined : q.media,
  };
}
