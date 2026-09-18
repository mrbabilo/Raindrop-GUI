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
// Tous les filtres de la vue passent par ici, en un seul endroit : c'est ce
// qui garantit que les deux appelants ne divergent que par `media`.
export function listQueryArgs(view: View, opts: ListQueryOptions = {}): RaindropQuery {
  const q: ListView = view.kind === "list" ? view : { kind: "list", collectionId: 0, label: "" };
  return {
    collectionId: q.collectionId,
    search: q.search,
    // Une liste VIDE devient `undefined` : la clé de cache de useRaindrops est
    // l'objet entier, et `{tags: []}` ne hache pas comme `{}` — retirer la
    // dernière étiquette ouvrirait donc une SECONDE entrée de cache pour la
    // liste non filtrée, déjà chargée. `undefined` disparaît du hachage.
    tags: q.tags && q.tags.length > 0 ? q.tags : undefined,
    sort: q.sort,
    notag: q.notag,
    media: opts.omitMedia ? undefined : q.media,
    // Task 7b : les trois contrôles de la TopBar livrés en Task 6 étaient
    // collectés dans la vue puis jetés — ils ne filtraient rien. useRaindrops
    // les acceptait pourtant déjà et les passe au sidecar.
    domain: q.domain,
    createdStart: q.createdStart,
    createdEnd: q.createdEnd,
  };
}
