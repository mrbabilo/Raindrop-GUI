import { useRef, useState, type ReactNode } from "react";
import { t } from "../i18n/fr";
import { EtatListe } from "./EtatListe";
import { useRovingFocus } from "../hooks/useRovingFocus";
import { ChargePlus } from "./ChargePlus";
import type { View } from "../state/appState";
import { useAppState } from "../state/appState";
import { useAnalysisResults, useDuplicateGroups } from "../hooks/useAnalysis";
import { useRaindrops } from "../hooks/useRaindrops";
import { useCollections } from "../hooks/useStaticData";
import { racine } from "../design/Signaux";
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

function Doublons() {
  const q = useDuplicateGroups();
  const arbre = useCollections().data ?? [];
  const titreRacine = (id: number) => racine(arbre, id)?.title;
  const data = q.data;
  const groupes = data ? KINDS.flatMap((k) => data[k]) : [];
  return (
    <>
      {/* Même sémantique que le compteur T12 : le chip compte les groupes. */}
      <Entete label={LABELS.duplicates} count={groupes.length} />
      <EtatListe
        chargement={!!q.isLoading}
        erreur={q.isError ? q.error?.message : null}
        vide={groupes.length === 0 && !q.isLoading}
        reessayer={() => void q.refetch()}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {KINDS.map((kind) => {
          const gs = data?.[kind] ?? [];
          if (gs.length === 0) return null;
          return (
            <section key={kind} aria-label={DUP_LABELS[kind]} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">
                {DUP_LABELS[kind]} ({gs.length})
              </h2>
              {gs.map((g) => (
                <DuplicateGroupCard key={g.key} g={g} titreRacine={titreRacine} />
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
  const { selectedRaindropId, selectRaindrop } = useAppState();
  const q = useRaindrops({ collectionId: 0, notag: true });
  const arbre = useCollections().data ?? [];
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <Entete label={LABELS.untagged} count={q.data?.pages[0]?.count} />
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
      {type === "dead" && <ResultatsLiens type="dead" />}
      {type === "redirect" && <ResultatsLiens type="redirect" />}
      {type === "duplicates" && <Doublons />}
      {type === "untagged" && <NonTaggues />}
      {type === "empty-collections" && <CollectionsVides />}
      {type === "trash" && <Corbeille />}
    </section>
  );
}
