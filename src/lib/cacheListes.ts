import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { Paginated, RaindropItem } from "../../shared/types";

/** Le signet tel que l'a rendu une liste déjà chargée (même mapper que la
 *  fiche côté sidecar), s'il y figure. */
export function depuisLesListes(qc: QueryClient, id: number): RaindropItem | undefined {
  for (const [, data] of qc.getQueriesData<InfiniteData<Paginated<RaindropItem>>>({ queryKey: ["raindrops"] })) {
    for (const page of data?.pages ?? []) {
      const trouve = page.items.find((r) => r.id === id);
      if (trouve) return trouve;
    }
  }
  return undefined;
}
