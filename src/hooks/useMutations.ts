import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { RaindropItem } from "../../shared/types";

// Toutes les écritures du front passent ici : une mutation = un endpoint
// sidecar + l'invalidation des queryKeys qu'il modifie. Les résultats sont
// renvoyés tels quels aux appelants (BulkBar/Revue, Tasks 9 et 15).

export function useInvalidate() {
  const qc = useQueryClient();
  // Les listes vivent sous ["raindrops", q] : invalider le radical suffit.
  return (...keys: string[]) => keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
}

export const useUpdateRaindrop = (id: number) => {
  const invalidate = useInvalidate();
  return useMutation({
    // `url` (Task 13, correction des redirections) : le sidecar l'exige SEUL
    // (refine du patchBody) et le route en REST direct — n'envoyer que {url}.
    // `collectionId` est le nom du DTO front ; le sidecar attend `collection_id`
    // — la conversion reste à la frontière (le front ne parle que DTO).
    mutationFn: (patch: Partial<Pick<RaindropItem, "url" | "title" | "excerpt" | "note" | "tags" | "important" | "collectionId">>) =>
      api.send<RaindropItem>("PATCH", `/api/raindrops/${id}`, {
        ...patch, ...(patch.collectionId !== undefined ? { collection_id: patch.collectionId } : {}),
      }),
    // "raindrop" aussi (le détail) : sans lui, le titre enregistré ne
    // réapparaîtrait dans le volet qu'au prochain refetch indirect.
    onSuccess: () => invalidate("raindrops", "raindrop", "collections"),
  });
};

export const useTrashRaindrop = () => {
  const invalidate = useInvalidate();
  return useMutation({
    // `from` = collection courante de l'item : le sidecar la mémorise pour
    // pouvoir restaurer à l'origine (spec §4.2, Task 0b). Omis = origine inconnue.
    mutationFn: (v: { id: number; from?: number }) =>
      api.send("DELETE", `/api/raindrops/${v.id}${v.from != null ? `?from=${v.from}` : ""}`),
    onSuccess: () => invalidate("raindrops", "collections", "tags"),
  });
};

export const useCreateRaindrop = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { link: string; title?: string; excerpt?: string; collection_id?: number }) =>
      api.send<RaindropItem>("POST", "/api/raindrops", body),
    onSuccess: () => invalidate("raindrops", "collections"),
  });
};

export const useBulk = () => {
  const invalidate = useInvalidate();
  return useMutation({
    // `origins` (§4.2, revue finale) : l'origine de restauration de CHAQUE id
    // — le sidecar la mémorise AVANT l'opération et la raye avant le tool MCP.
    mutationFn: (body: {
      operation: "update" | "move" | "delete";
      collection_id: number;
      ids?: number[];
      to_collection_id?: number;
      tags?: string[];
      important?: boolean;
      origins?: { id: number; from: number }[];
    }) => api.send("POST", "/api/raindrops/bulk", body),
    // delete en masse : le sidecar mémorise les origines (§4.2) — la corbeille
    // reste restaurable, les compteurs de collections bougent aussi.
    onSuccess: () => invalidate("raindrops", "collections", "tags"),
  });
};

export const useTagManage = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { operation: "rename" | "merge" | "delete"; tags: string[]; new_name?: string }) =>
      api.send("POST", "/api/tags/manage", body),
    // "raindrop" aussi (ruling T8-5, T14) : sans lui, une fiche ouverte garde
    // des tags stales après un renommage/fusion — même famille que les
    // invalidations de useUpdateRaindrop.
    onSuccess: () => invalidate("tags", "raindrops", "raindrop"),
  });
};

export const useUnrestore = () => {
  const invalidate = useInvalidate();
  return useMutation({
    // Sans toCollectionId, le sidecar restaure chacun à son origine mémorisée
    // et renvoie dans `unknown` ceux dont l'origine est inconnue — NON
    // restaurés : l'appelant demande alors une destination et rappelle (§4.2).
    mutationFn: (v: { ids: number[]; toCollectionId?: number }) =>
      api.send<{ restored: number; unknown: number[] }>("POST", "/api/raindrops/unrestore", v),
    onSuccess: () => invalidate("raindrops", "collections", "tags"),
  });
};

export const useEmptyTrash = () => {
  const invalidate = useInvalidate();
  return useMutation({
    // Seul le vidage de la corbeille est définitif (spec §3) : confirm:true
    // est exigé par le zod du sidecar.
    mutationFn: () => api.send("POST", "/api/maintenance/empty-trash", { confirm: true }),
    onSuccess: () => invalidate("raindrops"),
  });
};

export const useDeleteCollection = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => api.send("DELETE", `/api/collections/${id}`),
    onSuccess: () => invalidate("collections"),
  });
};
