import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Paginated, RaindropItem } from "../../shared/types";

export interface RaindropQuery {
  collectionId: number;
  search?: string;
  /** Étiquettes intersectées. Canonique (triée, dédoublonnée) — sans quoi
   *  `["a","b"]` et `["b","a"]` feraient DEUX entrées de cache pour un seul
   *  résultat : voir `canoniser` (hooks/filtreEtiquettes.ts). */
  tags?: string[];
  sort?: string;
  important?: boolean;
  notag?: boolean;
  domain?: string;
  media?: string;
  createdStart?: string;
  createdEnd?: string;
}

// Marqueurs d'UI (ruling projet R3P) : ils n'existent PAS côté sidecar.
// -3 (Favoris) → important=true sur Tous (0) ;
// -1 (non classés) et -99 (corbeille) passent tels quels.
// Aucun marqueur ne sort jamais du front.
const FAVORITES = -3;

// Booleans → "true"/"false" ou undefined (jamais d'autre valeur — le zod du
// sidecar n'accepte que ces deux chaînes ; false est un filtre explicite).
const bool = (v?: boolean) => (v === undefined ? undefined : v ? "true" : "false");

export function useRaindrops(q: RaindropQuery) {
  const isFavorites = q.collectionId === FAVORITES;
  return useInfiniteQuery({
    queryKey: ["raindrops", q],
    queryFn: ({ pageParam }) =>
      api.get<Paginated<RaindropItem>>("/api/raindrops", {
        collection_id: isFavorites ? 0 : q.collectionId,
        search: q.search,
        // Répété (`?tags=a&tags=b`), jamais joint : un séparateur suppose une
        // étiquette qui ne le contient pas, et rien ne le garantit.
        tags: q.tags,
        sort: q.sort,
        important: isFavorites ? "true" : bool(q.important),
        notag: bool(q.notag),
        domain: q.domain,
        media: q.media,
        created_start: q.createdStart,
        created_end: q.createdEnd,
        per_page: 50,
        page: pageParam,
      }),
    initialPageParam: 0,
    // Pas de champ « page totale » dans le contrat {items, count, page,
    // perPage} : on déduit du cumul reçu — s'il reste moins d'items que le
    // total, la page suivante est all.length.
    // Garde (revue finale) : une page VIDE — items supprimés en séance alors
    // que `count` est périmé — ne promet JAMAIS une suite, sinon l'infinite
    // scroll enchaîne les requêtes sans fin.
    getNextPageParam: (last, all) =>
      last.items.length === 0 ? undefined : all.reduce((n, p) => n + p.items.length, 0) < last.count ? all.length : undefined,
  });
}
