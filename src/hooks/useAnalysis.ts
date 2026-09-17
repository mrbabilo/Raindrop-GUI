import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { api } from "../lib/api";
import { jobEvents } from "../lib/sse";
import { useCollections } from "./useStaticData";
import type {
  AnalysisStatusEntry,
  AnalysisType,
  DuplicateGroup,
  LinkCheckResult,
  Paginated,
} from "../../shared/types";

// Forme de GET /api/analysis/results/duplicates (sidecar/api/routes/analysis.ts
// → AnalysisCache.getGroups). Absente de shared/types : posée ici tant qu'un
// seul consommateur l'exige, à migrer vers le DTO partagé au besoin.
export interface DuplicateGroups {
  exact: DuplicateGroup[];
  normalized: DuplicateGroup[];
  fuzzy: DuplicateGroup[];
}

// Forme de GET /api/analysis/status — AnalysisStatusEntry est le DTO partagé.
export type StatusBody = { links: AnalysisStatusEntry; duplicates: AnalysisStatusEntry };

export interface LinksResultsPage {
  items: (LinkCheckResult & { title: string; collectionId: number })[];
  total: number;
  page: number;
  perPage: number;
}

export const useAnalysisStatus = () =>
  useQuery({
    queryKey: ["analysis", "status"],
    queryFn: () => api.get<StatusBody>("/api/analysis/status"),
    refetchInterval: 5_000,
  });

// Posé pour la Task 13 (vues cleanupView paginées) : désactivé ici, la Task 13
// activera le hook dans la vue concernée (résolution contrôleur 1).
export const useAnalysisResults = (
  type: "links",
  filter: string,
  page: number,
  perPage = 50,
): UseQueryResult<LinksResultsPage> =>
  useQuery({
    queryKey: ["analysis", "results", type, filter, page],
    queryFn: () =>
      api.get<LinksResultsPage>(`/api/analysis/results/${type}`, { page, per_page: perPage, filter }),
    enabled: false, // activé par T13
  });
// duplicates : api.get<DuplicateGroups>("/api/analysis/results/duplicates")

export const useCancelJob = () =>
  useMutation({ mutationFn: (jobId: string) => api.send<{ cancelled: boolean }>("POST", `/api/jobs/${jobId}/cancel`) });

// Événements du scan remontés au composant. Le handle d'annulation UI
// ({jobId, controller}) vit dans le state du composant (note du brief,
// résolution 2) — jamais dans un global window.__scanAbort.
export type ScanEvent =
  | { kind: "start"; jobId: string; controller: AbortController }
  | { kind: "progress"; done: number; total: number };

export const useStartScan = (type: AnalysisType, onEvent?: (e: ScanEvent) => void) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { jobId } = await api.send<{ jobId: string }>("POST", "/api/analysis/scan", { type });
      const controller = new AbortController();
      onEvent?.({ kind: "start", jobId, controller });
      await new Promise<void>((resolve, reject) => {
        // R12P-1 : un seul settle — l'event `error` (échec du scan) rejette
        // AVANT le onDone que le parseur appelle pour tout kind terminal ;
        // sans le garde, la promesse se résoudrait comme une fin normale et
        // l'échec serait silencieux.
        let settled = false;
        void jobEvents(jobId, {
          onEvent: (e) => {
            if (e.kind === "error") {
              settled = true;
              reject(new Error(typeof e.message === "string" && e.message ? e.message : "event error sans message"));
              return;
            }
            if (e.kind !== "progress") return;
            // Forme réelle du flux (sidecar/api/sse.ts) : le data de progress
            // est l'event sérialisé, la progression vit sous `progress`.
            const p = e.progress as { done?: unknown; total?: unknown } | undefined;
            const done = typeof p?.done === "number" ? p.done : 0;
            const total = typeof p?.total === "number" ? p.total : 0;
            qc.setQueryData(["analysis", "job", type], { done, total }); // relisible par T13
            onEvent?.({ kind: "progress", done, total });
          },
          onDone: () => {
            if (!settled) resolve();
          },
        }, controller.signal).catch((err: unknown) => {
          if (!settled) reject(err);
        });
      }).then(() => {
        // Fin du suivi (done, error, cancelled ou flux clos) : fraîcheur et
        // compteurs repartent de ce que le sidecar a persisté.
        qc.invalidateQueries({ queryKey: ["analysis"] });
        qc.invalidateQueries({ queryKey: ["raindrops"] });
      });
    },
  });
};

// Les 6 compteurs du dashboard, chacun par la voie la plus légère : total
// d'une page de 1 (liens filtrés), longueur des groupes (doublons), count
// déjà porté par la réponse (non-taggés, corbeille — même forme que
// useRaindrops : notag=true, collection_id=-99 passent tels quels), et le
// count des collections pour les vides.
export function useCleanupCounts() {
  const dead = useQuery({
    queryKey: ["analysis", "counts", "dead"],
    queryFn: () => api.get<{ total: number }>("/api/analysis/results/links", { filter: "dead", page: 0, per_page: 1 }),
  });
  const redirect = useQuery({
    queryKey: ["analysis", "counts", "redirect"],
    queryFn: () => api.get<{ total: number }>("/api/analysis/results/links", { filter: "redirect", page: 0, per_page: 1 }),
  });
  const groups = useQuery({
    queryKey: ["analysis", "counts", "duplicates"],
    queryFn: () => api.get<DuplicateGroups>("/api/analysis/results/duplicates"),
  });
  const untagged = useQuery({
    queryKey: ["raindrops", "counts", "untagged"],
    queryFn: () => api.get<Paginated<unknown>>("/api/raindrops", { notag: true, per_page: 1 }),
  });
  const trash = useQuery({
    queryKey: ["raindrops", "counts", "trash"],
    queryFn: () => api.get<Paginated<unknown>>("/api/raindrops", { collection_id: -99, per_page: 1 }),
  });
  const collections = useCollections().data;
  return {
    dead: dead.data?.total,
    redirect: redirect.data?.total,
    duplicates: groups.data
      ? groups.data.exact.length + groups.data.normalized.length + groups.data.fuzzy.length
      : undefined,
    untagged: untagged.data?.count,
    emptyCollections: collections?.filter((c) => c.count === 0).length,
    trash: trash.data?.count,
  };
}
