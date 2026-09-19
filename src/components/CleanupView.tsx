import { useRef, useState } from "react";
import { t } from "../i18n/fr";
import { EtatListe } from "./EtatListe";
import { useRovingFocus } from "../hooks/useRovingFocus";
import { ChargePlus } from "./ChargePlus";
import { useAppState } from "../state/appState";
import { useAnalysisStatus, useDuplicateGroups, useStartScan } from "../hooks/useAnalysis";
import { useRaindrops } from "../hooks/useRaindrops";
import { useCollections } from "../hooks/useStaticData";
import { racine } from "../lib/arbre";
import { pairesCertaines } from "../lib/doublons";
import type { DuplicateGroup } from "../../shared/types";
import {
  DuplicateGroupCard,
  EmptyCollectionRow,
  TrashRow,
} from "./CleanupRows";
import { Entete, LABELS, type CleanupType } from "./EnteteCleanup";
import { ResultatsLiens } from "./ResultatsLiens";

// Task 13 — les vues de traitement joignables depuis le dashboard (T12) :
// un composant à branch par `type`, chacun ≤ 60 lignes (brief). Les jetons
// et classes viennent de styles.css ; DESIGN.md §8-§10 fait foi.

// Doublons : les trois catégories restent séparées (DOMAINE.md — jamais
// fusionnées), chaque section étiquetée, les groupes en grappes.
const KINDS = ["exact", "normalized", "fuzzy"] as const;
const DUP_LABELS: Record<DuplicateGroup["kind"], string> = {
  exact: t("cleanup.dup-exact"),
  normalized: t("cleanup.dup-normalized"),
  fuzzy: t("cleanup.dup-fuzzy"),
};

// Un groupe de N signets ne rend RETIRABLES que N−1 d'entre eux : on en garde
// toujours un. C'est le seul nombre qui dise ce qu'on gagne à nettoyer, et il
// n'apparaissait nulle part.
const signetsDe = (gs: DuplicateGroup[]) => gs.reduce((n, g) => n + g.items.length, 0);
const retirablesDe = (gs: DuplicateGroup[]) => signetsDe(gs) - gs.length;

function Doublons({ jamaisAnalyse, analyser }: { jamaisAnalyse?: boolean; analyser?: () => void }) {
  const q = useDuplicateGroups();
  const { go } = useAppState();
  const surRevue = (copies: { id: number; url: string; title: string; collectionId: number; dedupeGarde: { id: number; title: string } }[]) => {
    go({
      kind: "review",
      items: copies,
      action: { op: "dedupe" },
      sourceLabel: LABELS.duplicates,
      returnView: { kind: "cleanupView", type: "duplicates" },
    });
  };
  const arbre = useCollections().data ?? [];
  const titreRacine = (id: number) => racine(arbre, id)?.title;
  const data = q.data;
  const groupes = data ? KINDS.flatMap((k) => data[k]) : [];
  // Le tri GLOBAL est borné aux catégories certaines (exact, normalisé) :
  // même domaine + même titre flou n'est pas une certitude — la pollution au
  // titre d'interstitiel (« Weiterleitungshinweis », 163 signets réels) vient
  // de le démontrer. Le flou, lui, se trie groupe par groupe.
  const paires = pairesCertaines(data ?? { exact: [], normalized: [], fuzzy: [] });
  const triables = paires.flatMap((p) => p.copies.map((c) => ({ ...c, dedupeGarde: { id: p.garde.id, title: p.garde.title } })));
  return (
    <>
      {/* Le chip compte les GROUPES ; le détail par catégorie dit les signets
          concernés et les copies retirables. « 414 » seul se lisait
          « 414 signets en double » — la mesure réelle donne 414 groupes pour
          1 032 signets, dont 618 retirables. */}
      <Entete
        label={LABELS.duplicates}
        count={jamaisAnalyse === true ? undefined : groupes.length}
        action={
          triables.length > 0 ? (
            <button type="button" className="btn" onClick={() => surRevue(triables)}>
              {t("cleanup.trierDoublons", { n: triables.length })}
            </button>
          ) : undefined
        }
      />
      <EtatListe
        chargement={!!q.isLoading}
        erreur={q.isError ? q.error?.message : null}
        vide={groupes.length === 0 && !q.isLoading}
        reessayer={() => void q.refetch()}
        jamaisAnalyse={jamaisAnalyse === true && groupes.length === 0}
        {...(analyser ? { analyser } : {})}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {KINDS.map((kind) => {
          const gs = data?.[kind] ?? [];
          if (gs.length === 0) return null;
          return (
            <section key={kind} aria-label={DUP_LABELS[kind]} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">
                {DUP_LABELS[kind]} ({gs.length})
                <span className="ml-2 text-xs font-normal text-app-muted">
                  {t("cleanup.dupDetail", { n: retirablesDe(gs), items: signetsDe(gs), retirables: retirablesDe(gs) })}
                </span>
              </h2>
              {gs.map((g) => (
                <DuplicateGroupCard key={g.key} g={g} titreRacine={titreRacine} surRevue={surRevue} />
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

// Non-taggés : liste raindrops standard (notag=true). Ligne simple, pas de
// cases (BulkBar n'est pas monté ici — pas de sélection sans issue) ; le clic
// ouvre la fiche, où l'étiquette se corrige.
function NonTaggues() {
  const { selectedRaindropId, selectRaindrop, selectedIds, toggleSelect, go } = useAppState();
  const [etiquettes, setEtiquettes] = useState("");
  const q = useRaindrops({ collectionId: 0, notag: true });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const selectionnes = items.filter((r) => selectedIds.has(r.id));
  const etiqueter = () => {
    // Le garde porte la liste PARSÉE (même règle que le BulkBar) : « , , »
    // est truthy mais parse vide — le bulk update qui en résulterait effacerait
    // toutes les étiquettes des items sélectionnés.
    const tags = etiquettes.split(",").map((s) => s.trim()).filter(Boolean);
    if (tags.length === 0 || selectionnes.length === 0) return;
    go({
      kind: "review",
      items: selectionnes.map((i) => ({ id: i.id, url: i.url, title: i.title, collectionId: i.collectionId })),
      action: { op: "tag", tags },
      sourceLabel: LABELS.untagged,
      returnView: { kind: "cleanupView", type: "untagged" },
    });
  };
  return (
    <>
      <Entete
        label={LABELS.untagged}
        count={q.data?.pages[0]?.count}
        action={
          <span className="flex items-center gap-2">
            <input
              aria-label={t("bulk.tagField")}
              className="input w-40"
              placeholder={t("bulk.tagPlaceholder")}
              value={etiquettes}
              onChange={(e) => setEtiquettes(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              disabled={selectionnes.length === 0 || etiquettes.split(",").map((s) => s.trim()).filter(Boolean).length === 0}
              onClick={etiqueter}
            >
              {t("cleanup.etiqueter", { n: selectionnes.length })}
            </button>
          </span>
        }
      />
      <EtatListe
        chargement={!!q.isLoading}
        erreur={q.isError ? q.error?.message : null}
        vide={items.length === 0 && !q.isLoading}
        reessayer={() => void q.refetch()}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.map((r) => (
          <div
            key={r.id}
            className={"flex min-h-9 cursor-pointer items-center gap-2 overflow-hidden border-b border-app-border px-3 " + (selectedRaindropId === r.id ? "bg-app-sel" : "hover:bg-app-hover")}
            onClick={() => selectRaindrop(r.id)}
          >
            {/* C'est la LIGNE qui ouvre la fiche ; la case, elle, sélectionne
                pour l'étiquetage en masse — stopPropagation, sinon cocher
                ouvrirait la fiche au passage. */}
            <input
              type="checkbox"
              aria-label={t("list.select", { title: r.title })}
              checked={selectedIds.has(r.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleSelect(r.id)}
            />
            <span className="min-w-[8rem] flex-1 truncate font-medium">{r.title}</span>
            <span className="url shrink-0 text-[11px] text-app-muted">{r.domain}</span>
          </div>
        ))}
        <ChargePlus q={q} />
      </div>
    </>
  );
}

// Corbeille : « Vider la corbeille » est une action de niveau 2 — elle part
// en Revue (Task 15 exécutera), avec les items chargés comme aperçu gratuit.
function Corbeille() {
  const { go } = useAppState();
  const q = useRaindrops({ collectionId: -99 });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <Entete
        label={LABELS.trash}
        count={q.data?.pages[0]?.count}
        action={
          <button
            type="button"
            className="btn"
            disabled={items.length === 0}
            onClick={() =>
              go({
                kind: "review",
                items: items.map((i) => ({ id: i.id, url: i.url, title: i.title, collectionId: i.collectionId })),
                action: { op: "empty-trash" },
                // Revue finale : le compteur de la Revue porte le total
                // SERVEUR — le vidage dépasse les pages chargées en aperçu.
                totalServer: q.data?.pages[0]?.count,
                sourceLabel: t("cleanup.trash"),
                returnView: { kind: "cleanupView", type: "trash" }, // R15P-3
              })
            }
          >
            {t("cleanup.empty-trash")}
          </button>
        }
      />
      <EtatListe
        chargement={!!q.isLoading}
        erreur={q.isError ? q.error?.message : null}
        vide={items.length === 0 && !q.isLoading}
        reessayer={() => void q.refetch()}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.map((r) => (
          <TrashRow key={r.id} r={r} />
        ))}
        <ChargePlus q={q} />
      </div>
    </>
  );
}

// Collections vides : suppression individuelle en ligne ; « Supprimer les
// collections vides » (niveau 2) part en Revue SANS items — une collection
// n'a pas la forme raindrop des items de Revue, l'action porte le sens
// (choix documenté au rapport) et T15 appellera POST /collections/cleanup.
function CollectionsVides() {
  const { go } = useAppState();
  const collections = useCollections().data;
  const vides = (collections ?? []).filter((c) => c.count === 0);
  return (
    <>
      <Entete
        label={LABELS["empty-collections"]}
        count={vides.length}
        action={
          <button
            type="button"
            className="btn"
            disabled={vides.length === 0}
            onClick={() =>
              go({
                kind: "review",
                items: [],
                action: { op: "delete-empty-collections" },
                // Revue finale : les items de Revue sont vides (une collection
                // n'a pas leur forme) — le VRAI nombre est vides.length.
                totalServer: vides.length,
                sourceLabel: t("cleanup.empty-collections"),
                returnView: { kind: "cleanupView", type: "empty-collections" }, // R15P-3
              })
            }
          >
            {t("cleanup.delete-empty")}
          </button>
        }
      />
      <EtatListe chargement={collections === undefined} vide={vides.length === 0 && collections !== undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {vides.map((c) => (
          <EmptyCollectionRow key={c.id} c={c} />
        ))}
      </div>
    </>
  );
}

export function CleanupView({ type }: { type: CleanupType }) {
  // « Jamais analysé » ≠ « rien à nettoyer ». La vue le sait par le statut, et
  // porte l'action qui corrige le manque — arriver ici depuis un compteur
  // vide sans pouvoir lancer l'analyse obligerait à repartir en arrière.
  const statut = useAnalysisStatus();
  const jamais = (quoi: "links" | "duplicates") =>
    statut.data !== undefined && statut.data[quoi].lastScan === null;
  const lienScan = useStartScan("links");
  const dupScan = useStartScan("duplicates");
  const lancerLiens = () => lienScan.mutate(undefined);
  const lancerDoublons = () => dupScan.mutate(undefined);
  // Lot a11y : la vue n'est qu'UN arrêt de tabulation. Les lignes portent
  // `data-nav` (CleanupRows.Ligne) ; Enter/F2 y entrent — leurs contrôles ne
  // sont tabulables qu'ensuite (pattern « ligne activée »). Le maillage ARIA
  // grid est réduit à grid/row : le contrat est le clavier, pas une grille
  // exhaustive — les en-têtes de vue vivent dans la section, hors rows.
  const zone = useRef<HTMLElement>(null);
  const roving = useRovingFocus(zone, {
    surEchap: () => (document.activeElement as HTMLElement | null)?.blur(),
  });
  return (
    <section
      ref={zone}
      role="grid"
      aria-label={LABELS[type]}
      onKeyDown={roving.surTouche}
      className="flex h-full min-h-0 flex-col"
    >
      {type === "dead" && <ResultatsLiens type="dead" jamaisAnalyse={jamais("links")} analyser={lancerLiens} />}
      {type === "redirect" && <ResultatsLiens type="redirect" jamaisAnalyse={jamais("links")} analyser={lancerLiens} />}
      {type === "indeterminate" && (
        <ResultatsLiens type="indeterminate" jamaisAnalyse={jamais("links")} analyser={lancerLiens} />
      )}
      {type === "duplicates" && <Doublons jamaisAnalyse={jamais("duplicates")} analyser={lancerDoublons} />}
      {type === "untagged" && <NonTaggues />}
      {type === "empty-collections" && <CollectionsVides />}
      {type === "trash" && <Corbeille />}
    </section>
  );
}
