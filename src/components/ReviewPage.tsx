import { useState } from "react";
import { t } from "../i18n/fr";
import { toCsv, downloadCsv } from "../lib/csv";
import { useBulk, useEmptyTrash, useCleanupCollections, useInvalidate } from "../hooks/useMutations";
import { useAppState, type View } from "../state/appState";

type ReviewView = Extract<View, { kind: "review" }>;

// Task 15 — la Revue de l'action : l'aperçu de ce qui va se produire, la
// désélection item par item (compteur live), la recherche locale, l'export
// CSV, puis les deux niveaux de confirmation de la spec §4.3 : niveau 1 =
// case de confirmation, niveau 2 = frappe exacte de SUPPRIMER (le vidage de
// corbeille est la seule écriture définitive, spec §3). DESIGN.md : la Revue
// est le seul écran aéré (§9), titre 26 px (§7), action engageante 38 px (§8).
export function ReviewPage({ review, goBack }: { review: ReviewView; goBack(): void }) {
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [typed, setTyped] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const { clearSelection } = useAppState();
  const bulk = useBulk();
  const emptyTrash = useEmptyTrash();
  const cleanup = useCleanupCollections();
  const invalidate = useInvalidate();

  const level2 = review.action.op === "empty-trash" || review.action.op === "delete-empty-collections";
  const visible = review.items.filter((i) => i.title.toLowerCase().includes(filter.toLowerCase()));
  const remaining = review.items.filter((i) => !excluded.has(i.id));
  // Niveau 2 : vidage/cleanup sont GLOBAUX — la désélection ne retire pas
  // l'action (liste informative, compteur = remaining) et une liste vide
  // n'est pas un obstacle. Niveau 1 : rien à exécuter sans item restant.
  const canRun = (level2 ? typed === "SUPPRIMER" : confirmed) && (level2 || remaining.length > 0);

  const execute = async () => {
    const ids = remaining.map((i) => i.id);
    try {
      if (review.action.op === "trash") await bulk.mutateAsync({ operation: "delete", collection_id: 0, ids });
      else if (review.action.op === "move")
        await bulk.mutateAsync({ operation: "move", collection_id: 0, ids, to_collection_id: review.action.toCollectionId });
      else if (review.action.op === "tag")
        await bulk.mutateAsync({ operation: "update", collection_id: 0, ids, tags: review.action.tags });
      else if (review.action.op === "empty-trash") await emptyTrash.mutateAsync();
      else await cleanup.mutateAsync(true);
    } catch (e) {
      // R8P-1 : un échec reste inline (role="alert"), la Revue reste
      // affichée — pas de goBack, la sélection et la confirmation tiennent.
      setErreur(e instanceof Error ? e.message : String(e));
      return;
    }
    invalidate("raindrops", "collections", "tags");
    clearSelection();
    goBack();
  };

  const actionLabel =
    review.action.op === "trash" ? t("bulk.trash")
    : review.action.op === "move" ? t("bulk.move")
    : review.action.op === "tag" ? t("bulk.tag")
    : review.action.op === "empty-trash" ? t("cleanup.empty-trash")
    : t("cleanup.delete-empty");
  const titre = level2 ? actionLabel : `${actionLabel} — ${review.sourceLabel}`;

  return (
    <main className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-1 px-4 pb-3 pt-5">
        <h1 className="titre-fiche">{titre}</h1>
        <p className="text-xs text-app-muted">{t("review.count", { n: remaining.length })}</p>
      </header>
      <div className="flex items-center gap-2 px-4 py-2">
        <input
          className="input w-64"
          placeholder={t("review.filterPlaceholder")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button type="button" className="btn" onClick={() => downloadCsv("revue.csv", toCsv(remaining))}>
          {t("review.export")}
        </button>
        <button type="button" className="btn" onClick={() => setExcluded(new Set(review.items.map((i) => i.id)))}>
          {t("review.deselect")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.map((i) => (
          <label key={i.id} className="flex min-h-9 items-center gap-2 border-b border-app-border px-4 text-sm">
            <input
              type="checkbox"
              aria-label={i.title}
              checked={!excluded.has(i.id)}
              onChange={() =>
                setExcluded((s) => {
                  const n = new Set(s);
                  if (n.has(i.id)) n.delete(i.id);
                  else n.add(i.id);
                  return n;
                })
              }
            />
            <span className="min-w-0 flex-1 truncate">{i.title}</span>
            <span className="url shrink-0 text-[11px] text-app-muted">{i.url}</span>
          </label>
        ))}
      </div>
      <footer className="flex items-center gap-3 border-t border-app-border bg-app-panel px-4 py-3 text-sm">
        {level2 ? (
          // R15P-1 : le jeton `border-app-danger` du snippet n'existe pas —
          // §6 : le rouge est un diagnostic (app-broken), la garde du niveau 2
          // est la frappe SUPPRIMER, pas une teinte.
          <input
            aria-label={t("review.typeDelete")}
            className="input w-48 border-app-broken"
            placeholder={t("review.typeDelete")}
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              setErreur(null);
            }}
          />
        ) : (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                setErreur(null);
              }}
            />
            {t("review.confirmL1", { n: remaining.length })}
          </label>
        )}
        {erreur && (
          <p role="alert" className="text-xs text-app-broken">
            {t("state.error", { message: erreur })}
          </p>
        )}
        {/* R15P-1 : le bouton Exécuter prend la surface `sel` (pas de teinte
            d'action) — §8 : action engageante 38 px. */}
        <button
          type="button"
          className="btn ml-auto h-[38px] bg-app-sel px-4 disabled:opacity-40"
          disabled={!canRun}
          onClick={() => void execute()}
        >
          {t("review.execute")}
        </button>
      </footer>
    </main>
  );
}
