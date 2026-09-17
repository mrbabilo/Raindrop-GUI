import { useRef, useState, type ReactNode } from "react";
import { t } from "../i18n/fr";
import type { View } from "../state/appState";
import { useAppState } from "../state/appState";
import { useAnalysisResults, useDuplicateGroups } from "../hooks/useAnalysis";
import { useRaindrops } from "../hooks/useRaindrops";
import { useCollections } from "../hooks/useStaticData";
import { racine } from "../design/Signaux";
import type { DuplicateGroup } from "../../shared/types";
import {
  DeadRow,
  DuplicateGroupCard,
  EmptyCollectionRow,
  RedirectRow,
  TrashRow,
} from "./CleanupRows";

// Task 13 — les vues de traitement joignables depuis le dashboard (T12) :
// un composant à branch par `type`, chacun ≤ 60 lignes (brief). Les jetons
// et classes viennent de styles.css ; DESIGN.md §8-§10 fait foi.

type CleanupType = Extract<View, { kind: "cleanupView" }>["type"];

// R6P : mêmes libellés que les compteurs du dashboard (clés cleanup.*).
const LABELS: Record<CleanupType, string> = {
  dead: t("cleanup.dead"),
  redirect: t("cleanup.redirects"),
  duplicates: t("cleanup.duplicates"),
  untagged: t("cleanup.untagged"),
  "empty-collections": t("cleanup.empty-collections"),
  trash: t("cleanup.trash"),
};

// Chip d'entête : libellé + compteur (total selon type) — « Liens morts (23) ».
// L'action engageante de branche (vider, supprimer les vides) vit à droite.
function Entete({ label, count, action }: { label: string; count?: number; action?: ReactNode }) {
  return (
    <header className="flex items-center gap-3 px-4 pt-4">
      <h1 className="titre-fiche">{label}</h1>
      {count !== undefined && <span className="text-xs text-app-muted">({count})</span>}
      {action && <div className="ml-auto">{action}</div>}
    </header>
  );
}

// §10 : un écran vide est une invitation à agir — « Rien ici » dit qu'il n'y
// a plus rien à réparer, pas un échec.
function Etat({ chargement, vide }: { chargement: boolean; vide: boolean }) {
  if (chargement) return <p className="p-4 text-app-muted">{t("state.loading")}</p>;
  if (vide) return <p className="p-4 text-app-muted">{t("state.empty")}</p>;
  return null;
}

// Pagination des vues de scan (dead/redirect) : page/total côté sidecar.
// Une seule page = aucun paginateur — du bruit inutile sous une liste courte.
function Paginateur({ page, total, perPage, onPage }: { page: number; total: number; perPage: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-end gap-2 px-4 pb-4 text-xs text-app-muted">
      <button type="button" className="btn" disabled={page === 0} onClick={() => onPage(page - 1)}>
        {t("cleanup.prev")}
      </button>
      <span>{t("cleanup.page", { n: page + 1, total: pages })}</span>
      <button type="button" className="btn" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>
        {t("cleanup.next")}
      </button>
    </nav>
  );
}

// Suite infinie des listes raindrops (même mécanique que ListPane : le
// callback ref tourne à chaque rendu — on débranche l'observeur précédent
// avant d'en créer un, sinon N rendus = N observateurs).
function ChargePlus({ q }: { q: { hasNextPage?: boolean; isFetchingNextPage: boolean; fetchNextPage: () => void } }) {
  const ioRef = useRef<IntersectionObserver | null>(null);
  if (!q.hasNextPage) return null;
  return (
    <div
      ref={(el) => {
        ioRef.current?.disconnect();
        if (!el) return;
        const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && q.fetchNextPage()));
        io.observe(el);
        ioRef.current = io;
      }}
      className="p-4 text-center text-app-muted"
    >
      {q.isFetchingNextPage ? t("list.loadingMore") : ""}
    </div>
  );
}

// dead / redirect : la même page de résultats filtrée — useAnalysisResults
// (résolution contrôleur 2 : enum filter réel du sidecar, page qui va bien).
function ResultatsLiens({ type }: { type: "dead" | "redirect" }) {
  const [page, setPage] = useState(0);
  const q = useAnalysisResults("links", type, page);
  const arbre = useCollections().data ?? [];
  const titreRacine = (id: number) => racine(arbre, id)?.title;
  const items = q.data?.items ?? [];
  const ligne = (r: (typeof items)[number]) =>
    type === "dead" ? (
      <DeadRow key={r.raindropId} r={r} collectionRacine={titreRacine(r.collectionId)} />
    ) : (
      <RedirectRow key={r.raindropId} r={r} collectionRacine={titreRacine(r.collectionId)} />
    );
  return (
    <>
      <Entete label={LABELS[type]} count={q.data?.total} />
      <Etat chargement={!!q.isLoading} vide={items.length === 0 && !q.isLoading} />
      <div className="min-h-0 flex-1 overflow-y-auto">{items.map(ligne)}</div>
      {q.data && <Paginateur page={page} total={q.data.total} perPage={q.data.perPage} onPage={setPage} />}
    </>
  );
}

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
      <Etat chargement={!!q.isLoading} vide={groupes.length === 0 && !q.isLoading} />
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
      <Etat chargement={!!q.isLoading} vide={items.length === 0 && !q.isLoading} />
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
                sourceLabel: t("cleanup.trash"),
                returnView: { kind: "cleanupView", type: "trash" }, // R15P-3
              })
            }
          >
            {t("cleanup.empty-trash")}
          </button>
        }
      />
      <Etat chargement={!!q.isLoading} vide={items.length === 0 && !q.isLoading} />
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
                sourceLabel: t("cleanup.empty-collections"),
                returnView: { kind: "cleanupView", type: "empty-collections" }, // R15P-3
              })
            }
          >
            {t("cleanup.delete-empty")}
          </button>
        }
      />
      <Etat chargement={collections === undefined} vide={vides.length === 0 && collections !== undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {vides.map((c) => (
          <EmptyCollectionRow key={c.id} c={c} />
        ))}
      </div>
    </>
  );
}

export function CleanupView({ type }: { type: CleanupType }) {
  return (
    <section aria-label={LABELS[type]} className="flex h-full min-h-0 flex-col">
      {type === "dead" && <ResultatsLiens type="dead" />}
      {type === "redirect" && <ResultatsLiens type="redirect" />}
      {type === "duplicates" && <Doublons />}
      {type === "untagged" && <NonTaggues />}
      {type === "empty-collections" && <CollectionsVides />}
      {type === "trash" && <Corbeille />}
    </section>
  );
}
