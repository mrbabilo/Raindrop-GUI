//! Les deux vues de scan de liens : morts et redirections.
//!
//! Extraites de `CleanupView` quand la sélection d'archivage (spec sélection
//! §4.2) a poussé le fichier au-dessus de la cible de 300 lignes. Frontière
//! naturelle : ces deux vues partagent leur source (`useAnalysisResults`),
//! leur pagination et leur ligne — le reste du Nettoyage ne les touche pas.

import { useState } from "react";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { EtatListe } from "./EtatListe";
import { useAppState } from "../state/appState";
import { useAnalysisResults } from "../hooks/useAnalysis";
import { useCollections } from "../hooks/useStaticData";
import { racine } from "../lib/arbre";
import { DeadRow, RedirectRow } from "./CleanupRows";
import { Entete, LABELS } from "./EnteteCleanup";

// Pagination des vues de scan (dead/redirect) : page/total côté sidecar.
// Une seule page = aucun paginateur — du bruit inutile sous une liste courte.
function Paginateur({ page, total, perPage, onPage }: { page: number; total: number; perPage: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-end gap-2 px-4 pb-4 text-xs text-app-muted">
      <button type="button" className="btn btn-icone" aria-label={t("cleanup.prev")} disabled={page === 0} onClick={() => onPage(page - 1)}>
        <Icone nom="chevronGauche" />
      </button>
      <span>{t("cleanup.page", { n: page + 1, total: pages })}</span>
      <button type="button" className="btn btn-icone" aria-label={t("cleanup.next")} disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>
        <Icone nom="chevronDroit" />
      </button>
    </nav>
  );
}

// Suite infinie des listes raindrops (même mécanique que ListPane : le
// callback ref tourne à chaque rendu — on débranche l'observeur précédent
// avant d'en créer un, sinon N rendus = N observateurs).
// dead / redirect : la même page de résultats filtrée — useAnalysisResults
// (résolution contrôleur 2 : enum filter réel du sidecar, page qui va bien).
export function ResultatsLiens({ type, jamaisAnalyse, analyser }: {
  type: "dead" | "redirect" | "indeterminate";
  /** Aucune analyse de liens n'a jamais tourné : « rien ici » mentirait. */
  jamaisAnalyse?: boolean;
  analyser?: () => void;
}) {
  const [page, setPage] = useState(0);
  const q = useAnalysisResults("links", type, page);
  const arbre = useCollections().data ?? [];
  const { selectedIds, toggleSelect, clearSelection, go } = useAppState();
  const titreRacine = (id: number) => racine(arbre, id)?.title;
  // Les URL remplacées sont notées PAR LA VUE, pas par la ligne : le cache
  // de scan du sidecar ne change qu'au re-scan, et la pagination démonte la
  // ligne — un état local ressusciterait la ligne remplacée (et son
  // bouton) à chaque aller-retour de page. Le `total` du chip reste le
  // total du scan : le scan le rattrape, comme pour l'élagage des doublons.
  const [remplaces, setRemplaces] = useState<ReadonlySet<number>>(new Set());
  const marquerRemplace = (id: number) => setRemplaces((s) => new Set(s).add(id));
  const items = (q.data?.items ?? []).filter((r) => !remplaces.has(r.raindropId));
  // L'archive vaut le plus ici : la page est morte, la copie permanente est
  // tout ce qui en reste (spec sélection §4.2). La vue suit son propre motif
  // — « action d'entête → Revue » — comme la corbeille et les collections
  // vides ; elle ne monte pas de BulkBar.
  const archivable = type === "dead";
  const selectionnes = items.filter((r) => selectedIds.has(r.raindropId));
  // Tout sélectionner est borné à LA PAGE : la pagination existe ici (contraire
  // de la liste principale), et sélectionner ce qu'on ne voit pas trahit le
  // geste. La Revue reste de toute façon l'aperçu désélectionnable.
  const toutSelectionner = () => {
    // Les orphelins restent hors de la sélection : leur signet n'existe plus,
    // les actions de masse ne peuvent plus y aboutir.
    for (const r of items) {
      if (r.orphelin || selectedIds.has(r.raindropId)) continue;
      toggleSelect(r.raindropId);
    }
  };
  const corbeille = () => {
    go({
      kind: "review",
      items: selectionnes.map((r) => ({ id: r.raindropId, url: r.url, title: r.title, collectionId: r.collectionId })),
      action: { op: "trash" },
      sourceLabel: t("cleanup.dead"),
      returnView: { kind: "cleanupView", type: "dead" },
    });
    clearSelection();
  };
  const archiver = () => {
    go({
      kind: "review",
      // Pas de `cache` : l'analyse ne le porte pas. La Revue le dit, et le
      // sidecar comptera les échecs individuels.
      items: selectionnes.map((r) => ({
        id: r.raindropId,
        url: r.url,
        title: r.title,
        collectionId: r.collectionId,
      })),
      action: { op: "archive" },
      sourceLabel: t("cleanup.dead"),
      returnView: { kind: "cleanupView", type: "dead" },
    });
    clearSelection(); // R9P-1 : le clear appartient à l'action
  };
  // `indeterminate` emprunte la ligne des redirections : DOMAINE.md interdit
  // de le traiter comme un mort (« jamais classé mort »), donc surtout pas
  // `DeadRow` et son filet rouge — ces liens attendent une vérification, ils
  // ne portent aucun verdict.
  const ligne = (r: (typeof items)[number]) =>
    type === "dead" ? (
      <DeadRow
        key={r.raindropId}
        r={r}
        collectionRacine={titreRacine(r.collectionId)}
        selected={selectedIds.has(r.raindropId)}
        onToggle={() => toggleSelect(r.raindropId)}
      />
    ) : (
      <RedirectRow key={r.raindropId} r={r} collectionRacine={titreRacine(r.collectionId)} onRemplace={marquerRemplace} />
    );
  return (
    <>
      <Entete
        label={LABELS[type]}
        retour={{ label: t("cleanup.retour"), onClick: () => go({ kind: "cleanup" }) }}
        count={jamaisAnalyse === true ? undefined : q.data?.total}
        action={
          archivable ? (
            <span className="flex items-center gap-2">
              <button type="button" className="btn" disabled={items.length === 0} onClick={toutSelectionner}>
                {t("cleanup.toutSelectionner")}
              </button>
              <button type="button" className="btn" disabled={selectionnes.length === 0} onClick={archiver}>
                {t("cleanup.archiver", { n: selectionnes.length })}
              </button>
              <button type="button" className="btn" disabled={selectionnes.length === 0} onClick={corbeille}>
                <Icone nom="corbeille" className="inline align-[-2px] mr-1" />
                {t("cleanup.corbeille", { n: selectionnes.length })}
              </button>
            </span>
          ) : undefined
        }
      />
      <EtatListe
        chargement={!!q.isLoading}
        erreur={q.isError ? q.error?.message : null}
        vide={items.length === 0 && !q.isLoading}
        reessayer={() => void q.refetch()}
        jamaisAnalyse={jamaisAnalyse === true && items.length === 0}
        {...(analyser ? { analyser } : {})}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">{items.map(ligne)}</div>
      {q.data && <Paginateur page={page} total={q.data.total} perPage={q.data.perPage} onPage={setPage} />}
    </>
  );
}

