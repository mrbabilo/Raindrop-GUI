import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { api } from "../lib/api";
import { jobEvents } from "../lib/sse";
import { useCollections } from "./useStaticData";
import type { EtatLien } from "../design/Signaux";
import { elaguerGroupes } from "../lib/doublons";
import { collectionsVides } from "../lib/arbre";
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
  items: (LinkCheckResult & { title: string; collectionId: number; orphelin?: boolean })[];
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

// Les filtres que le zod du sidecar accepte réellement (sidecar/api/routes/
// analysis.ts — revue T12 : l'enum « mort côté serveur » a été vérifiée) :
// le front ne passe que ces valeurs, jamais une chaîne libre.
export type LinksFilter = "all" | "dead" | "indeterminate" | "redirect" | "ok";

// Task 13 : activé par les vues cleanupView dead/redirect (résolution
// contrôleur 1). `enabled` garde la porte ouverte à un hook monté sans fetch ;
// les vues ne montent la branche concernée que si nécessaire. `perPage` fait
// partie de la clé : deux appelants à per_page différents pour le même
// filtre/page liraient sinon le cache l'un de l'autre, sans erreur.
export const useAnalysisResults = (
  type: "links",
  filter: LinksFilter,
  page: number,
  perPage = 50,
  enabled = true,
): UseQueryResult<LinksResultsPage> =>
  useQuery({
    queryKey: ["analysis", "results", type, filter, page, perPage],
    queryFn: () =>
      api.get<LinksResultsPage>(`/api/analysis/results/${type}`, { page, per_page: perPage, filter }),
    enabled,
  });

// Groupes de doublons (GET /api/analysis/results/duplicates) — UNE SEULE
// clé pour les deux consommateurs (le dashboard compte, la vue liste) :
// le payload vit une fois en cache et TanStack déduplique, là où deux clés
// en gardaient deux exemplaires. Les groupes sont un PRODUIT DU SCAN :
// refetcher le cache serveur inchangé ne rapporte rien — et réécrirait
// l'élagage qu'un tri vient d'appliquer côté client. Seul un scan invalide
// la clé (useStartScan).
export const CLE_GROUPES = ["analysis", "results", "duplicates"] as const;

export const useDuplicateGroups = () =>
  useQuery({
    queryKey: CLE_GROUPES,
    queryFn: () => api.get<DuplicateGroups>("/api/analysis/results/duplicates"),
    staleTime: Infinity,
  });

/**
 * Les diagnostics par signet, pour la signalétique de la liste principale.
 *
 * Une `Map` et non un tableau : chaque ligne de liste interroge par
 * identifiant, et 12 210 lignes contre un tableau seraient quadratiques —
 * même raison que le `Set` de `useArchives`, dont ce hook est le jumeau.
 *
 * La clé vit sous `["analysis", …]` : `useStartScan` invalide déjà tout ce
 * préfixe à la fin d'un scan, donc les marques se rafraîchissent sans qu'on
 * ait à y penser.
 *
 * ⚠️ L'ABSENCE de marque ne certifie rien (DESIGN.md §5) : elle recouvre trois
 * états — vérifié sain, jamais vérifié, et périmé au sens du TTL. La fraîcheur
 * se lit dans `useAnalysisStatus`, que le Nettoyage affiche honnêtement ; la
 * liste, elle, ne prétend rien.
 */
export const useEtatsAnalyse = () =>
  useQuery({
    queryKey: ["analysis", "etats"],
    queryFn: async () => {
      const r = await api.get<{ etats: Record<string, EtatLien> }>("/api/analysis/etats");
      return new Map(Object.entries(r.etats).map(([id, e]) => [Number(id), e]));
    },
    staleTime: 60_000,
  });

/**
 * L'écran des doublons dit vrai APRÈS une suppression : les copies corbeillées
 * sortent des groupes en cache, et un groupe réduit à un exemplaire cesse
 * d'être un doublon. Le cache d'analyse ne se recalcule qu'au scan — sans cet
 * élagage, l'écran affichait les morts jusqu'au re-scan suivant. UNE seule
 * clé désormais : dashboard et vue partagent le même payload.
 */
export const useElaguerDoublons = () => {
  const qc = useQueryClient();
  return (supprimes: readonly number[]) => {
    if (supprimes.length === 0) return;
    qc.setQueryData<DuplicateGroups | undefined>(CLE_GROUPES, (vieille) =>
      vieille ? elaguerGroupes(vieille, supprimes) : vieille,
    );
  };
};

export const useCancelJob = () =>
  useMutation({ mutationFn: (jobId: string) => api.send<{ cancelled: boolean }>("POST", `/api/jobs/${jobId}/cancel`) });

// Événements du scan remontés au composant. Le handle d'annulation UI
// ({jobId, controller}) vit dans le state du composant (note du brief,
// résolution 2) — jamais dans un global window.__scanAbort.
export type ScanEvent =
  | { kind: "start"; jobId: string; controller: AbortController }
  // `label` : le scan de liens a DEUX étapes (« lecture de la bibliothèque »
  // puis « vérification des liens »), avec deux totaux différents. Sans lui,
  // la barre repart de zéro sans que rien ne l'explique — exactement le
  // reproche que la spec faisait à une barre.
  | { kind: "progress"; done: number; total: number; label: string | null };

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
            const p = e.progress as { done?: unknown; total?: unknown; label?: unknown } | undefined;
            const done = typeof p?.done === "number" ? p.done : 0;
            const total = typeof p?.total === "number" ? p.total : 0;
            const label = typeof p?.label === "string" ? p.label : null;
            onEvent?.({ kind: "progress", done, total, label });
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
  // DOMAINE.md en fait une catégorie à part — « vérification manuelle ;
  // jamais classé mort ». Le filtre existait, personne ne le lisait.
  const indeterminate = useQuery({
    queryKey: ["analysis", "counts", "indeterminate"],
    queryFn: () => api.get<{ total: number }>("/api/analysis/results/links", { filter: "indeterminate", page: 0, per_page: 1 }),
  });
  const groups = useQuery({
    queryKey: CLE_GROUPES, // le MÊME payload que la vue — une seule copie en cache
    queryFn: () => api.get<DuplicateGroups>("/api/analysis/results/duplicates"),
    staleTime: Infinity, // produit du scan — même raison que useDuplicateGroups
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
  const gd = groups.data;
  const compter = (gs: DuplicateGroup[]) => gs.reduce((n, g) => n + g.items.length, 0);
  return {
    dead: dead.data?.total,
    redirect: redirect.data?.total,
    indeterminate: indeterminate.data?.total,
    // GROUPES et SIGNETS. « 414 » seul se lisait « 414 signets en double » ;
    // la mesure réelle donne 414 groupes pour 1 032 signets concernés, dont
    // 618 copies retirables (un exemplaire gardé par groupe).
    duplicates: gd ? gd.exact.length + gd.normalized.length + gd.fuzzy.length : undefined,
    duplicatesItems: gd ? compter(gd.exact) + compter(gd.normalized) + compter(gd.fuzzy) : undefined,
    untagged: untagged.data?.count,
    // Le helper partagé exclut les parents-avec-enfants — la même définition
    // que la vue, sinon le tableau de bord annonce plus que l'action n'en
    // supprime.
    emptyCollections: collections ? collectionsVides(collections).length : undefined,
    trash: trash.data?.count,
  };
}
