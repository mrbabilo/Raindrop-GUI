import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useIndexClavier } from "../hooks/useIndexClavier";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { toCsv, downloadCsv } from "../lib/csv";
import { useBulk, useEmptyTrash, useDeleteCollection, useInvalidate } from "../hooks/useMutations";
import { useAppState, type View } from "../state/appState";
import { useArchives, useInvalidateSauvegarde } from "../hooks/useBackup";
import { useElaguerDoublons, type ResultatDedupe } from "../hooks/useAnalysis";
import { AnnonceArchive, ArchiveJob, BORNE_ARCHIVE, porteeArchive } from "./RevueArchive";
import { RevueDedupeFin } from "./RevueDedupeFin";
import { BarreProgression } from "./BarreProgression";
import { api } from "../lib/api";
import { jobEvents } from "../lib/sse";

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
  const deleteCollection = useDeleteCollection();
  const invalidate = useInvalidate();
  const elaguerDoublons = useElaguerDoublons();
  const invaliderSauvegarde = useInvalidateSauvegarde();

  const level2 =
    review.action.op === "empty-trash" ||
    review.action.op === "delete-empty-collections" ||
    review.action.op === "delete-collections";
  // L'archivage n'écrit rien chez Raindrop : c'est un job local, borné, qui
  // ne détruit rien. Il garde la confirmation de niveau 1, jamais la frappe
  // SUPPRIMER — celle-ci est réservée aux deux écritures définitives.
  const estArchive = review.action.op === "archive";
  const visible = review.items.filter((i) => i.title.toLowerCase().includes(filter.toLowerCase()));
  const remaining = review.items.filter((i) => !excluded.has(i.id));
  // §4.3 « Liste complète scrollable (virtualisée) » (revue finale : le mot
  // s'était perdu) — même mécanique que ListPane. La Revue peut porter des
  // milliers d'items (empty-trash sur 5 000) : le map intégral les monterait
  // tous. Lignes FIXES 36 px (§8) : estimateSize exact, pas de mesure.
  const parentRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });
  // Une seule case tabulable, les flèches circulent : la Revue peut porter
  // des milliers d'items, et autant d'arrêts de tabulation avant d'atteindre
  // le bouton d'exécution. Même mécanique que la liste — toutes deux sont
  // virtualisées, et leurs lignes se démontent en défilant.
  const basculer = (id: number) =>
    setExcluded((s2) => {
      const n = new Set(s2);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const clavier = useIndexClavier({
    nombre: visible.length,
    zone: parentRef,
    defilerVers: (i) => virtual.scrollToIndex(i),
    // Espace ET Entrée basculent l'exclusion : c'est le seul geste d'une
    // ligne de Revue, autant qu'il réponde aux deux touches.
    surEspace: (i) => { const it = visible[i]; if (it !== undefined) basculer(it.id); },
    surEntree: (i) => { const it = visible[i]; if (it !== undefined) basculer(it.id); },
  });

  // Revue finale : sur les deux actions L2, le compteur porte le TOTAL
  // SERVEUR (posé par la vue d'origine) — l'aperçu chargé ne vaut pas la
  // portée réelle de l'action. Absent (L1) : compteur = items portés.
  const totalAnnonce = review.totalServer ?? remaining.length;
  // Niveau 2 : vidage/cleanup sont GLOBAUX — la désélection ne retire pas
  // l'action (liste informative, compteur = remaining) et une liste vide
  // n'est pas un obstacle. Niveau 1 : rien à exécuter sans item restant.
  // Ce que l'archivage fera vraiment : les déjà-archivés sont écartés ET
  // comptés, ceux qui n'ont pas de copie aussi (spec sélection §4.2).
  const archives = useArchives().data?.set;
  const portee = porteeArchive(remaining, archives ?? new Set<number>());
  const [archiveLancee, setArchiveLancee] = useState(false);

  // Trois bras EXPLICITES plutôt qu'un ternaire imbriqué : c'est là qu'un
  // décalage se cacherait, et la frappe SUPPRIMER du niveau 2 ne doit jamais
  // s'affaiblir par l'ajout d'une branche.
  const canRun = level2
    ? typed === "SUPPRIMER"
    : estArchive
      ? confirmed && portee.ids.length > 0 && portee.ids.length <= BORNE_ARCHIVE
      : confirmed && remaining.length > 0;
  // Le suivi du job dedupe : N lectures + M écritures dans la file à 550 ms —
  // le tri global des doublons se compte en minutes, la barre le dit.
  const [dedupeProgress, setDedupeProgress] = useState<{ done: number; total: number } | null>(null);
  // Le terme du job, retenu quand il porte un DÉFICIT : la Revue tient pour
  // le dire (le silence a déjà caché une corbeille entière — 2026-09-20).
  const [dedupeFin, setDedupeFin] = useState<ResultatDedupe | null>(null);
  // Exécuter ET Retour se désactivent pendant TOUTE l'exécution (spec §3 :
  // pas de double émission) — boucle des DELETE de collections comprise.
  const [enVol, setEnVol] = useState(false);
  const pending = enVol || bulk.isPending || emptyTrash.isPending || dedupeProgress !== null;

  // Un DELETE PAR collection, SÉQUENTIELLEMENT dans l'ordre reçu (les ids de
  // delete-empty-collections arrivent déjà triés feuilles d'abord —
  // triPourSuppression) : au moment où un parent part, sa descendance a déjà
  // répondu, et le comportement de Raindrop face aux enfants restants
  // (emportés ? déracinés ?) devient sans objet. allSettled lançait tout en
  // parallèle — l'ordre n'y était qu'une intention. Un échec n'avorte pas
  // les suivantes (un id déjà parti répond 404 et ne doit pas bloquer sa
  // chaîne) ; le premier rejeté reste inline (R8P-1), la Revue tient.
  const supprimerCollections = async (ids: number[]) => {
    let premierEchec: unknown = null;
    for (const id of ids) {
      try {
        await deleteCollection.mutateAsync(id);
      } catch (e) {
        if (premierEchec === null) premierEchec = e;
      }
    }
    if (premierEchec !== null) throw premierEchec;
  };

  const execute = () => { setEnVol(true); void executer().finally(() => setEnVol(false)); };
  const executer = async () => {
    // L'archivage est un JOB (202 + SSE), pas une mutation : on bascule le
    // pied de page sur son suivi, ArchiveJob poste et s'abonne.
    if (review.action.op === "archive") {
      setArchiveLancee(true);
      return;
    }
    if (review.action.op === "dedupe") {
      // Les paires se reconstruisent des items RESTANTS : une copie
      // désélectionnée sort de sa paire ; un gardé n'est jamais un item.
      const parGarde = new Map<number, { id: number; collectionId: number }[]>();
      for (const i of remaining) {
        if (!i.dedupeGarde) continue;
        const arr = parGarde.get(i.dedupeGarde.id) ?? [];
        arr.push({ id: i.id, collectionId: i.collectionId });
        parGarde.set(i.dedupeGarde.id, arr);
      }
      try {
        const { jobId, total } = await api.send<{ jobId: string; total: number }>(
          "POST",
          "/api/raindrops/dedupe",
          { paires: [...parGarde.entries()].map(([garde, copies]) => ({ garde, copies })) },
        );
        setDedupeProgress({ done: 0, total });
        let resultat: ResultatDedupe | undefined;
        await new Promise<void>((resolve, reject) => {
          // Même garde que useStartScan : l'event `error` rejette AVANT le
          // onDone, sinon l'échec se résoudrait comme une fin normale.
          let settled = false;
          void jobEvents(jobId, {
            onEvent: (e: { kind: string; message?: unknown; progress?: { done?: number } }) => {
              if (e.kind === "error") {
                settled = true;
                reject(new Error(typeof e.message === "string" && e.message ? e.message : "event error sans message"));
                return;
              }
              if (e.kind !== "progress" && e.kind !== "done") return;
              if (e.kind === "progress") {
                const p = e.progress;
                if (p && typeof p.done === "number") setDedupeProgress({ done: p.done, total });
                return;
              }
              // Sur `done`, le sidecar sérialise LE RÉSULTAT à plat (sse.ts) :
              // retenu pour DIRE le terme — le jeter cachait les échecs.
              const { kind: _kind, ...reste } = e;
              resultat = reste as ResultatDedupe;
            },
            onDone: () => {
              if (!settled) resolve();
            },
          }, new AbortController().signal).catch((err: unknown) => {
            if (!settled) reject(err);
          });
        });
        // L'élagage ne retire que ce qui est VRAIMENT parti : un id en échec
        // reste vivant chez Raindrop — le sortir de la vue serait un mensonge
        // de plus.
        const echoues = new Set((resultat?.echecs ?? []).map((x) => x.id));
        elaguerDoublons(remaining.filter((i) => i.dedupeGarde && !echoues.has(i.id)).map((i) => i.id));
        invalidate("raindrops", "collections", "tags");
        clearSelection();
        if (resultat && (resultat.echecs.length > 0 || resultat.nonFusionnees.length > 0)) {
          // Un terme portant un déficit TIENT la Revue : le résumé se lit, le
          // « Retour » du haut (déverrouillé) part — jamais un retour en
          // silence sur des échecs nommés (R8P-1).
          setDedupeProgress(null);
          setDedupeFin(resultat);
          return;
        }
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
        setDedupeProgress(null);
        return;
      }
      goBack();
      return;
    }
    const ids = remaining.map((i) => i.id);
    try {
      if (review.action.op === "trash") {
        // §4.2 (revue finale) : chaque item emporte son ORIGINE de
        // restauration (collectionId de la vue) — sans elle, le sidecar
        // mémoriserait « Tous » et la restauration partirait en silence au
        // mauvais endroit. L'alignement ids/origines vient du même `remaining`.
        await bulk.mutateAsync({
          operation: "delete",
          collection_id: 0,
          ids,
          origins: remaining.map((i) => ({ id: i.id, from: i.collectionId })),
        });
        // Les groupes de doublons ne se recalculent qu'au scan : on les taille
        // ici, sinon l'écran affiche les corbeillés jusqu'au re-scan.
        elaguerDoublons(ids);
      } else if (review.action.op === "move")
        await bulk.mutateAsync({ operation: "move", collection_id: 0, ids, to_collection_id: review.action.toCollectionId });
      else if (review.action.op === "tag")
        await bulk.mutateAsync({ operation: "update", collection_id: 0, ids, tags: review.action.tags });
      else if (review.action.op === "empty-trash") await emptyTrash.mutateAsync();
      else if (review.action.op === "delete-collections") await supprimerCollections(review.action.ids);
      else if (review.action.op === "delete-empty-collections") await supprimerCollections(review.action.ids);
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
    review.action.op === "archive" ? t("bulk.archive")
    : review.action.op === "trash" ? t("bulk.trash")
    : review.action.op === "move" ? t("bulk.move")
    : review.action.op === "tag" ? t("bulk.tag")
    : review.action.op === "dedupe" ? t("review.dedupe")
    : review.action.op === "empty-trash" ? t("cleanup.empty-trash")
    : review.action.op === "delete-collections" ? t("cleanup.delete-collection")
    : t("cleanup.delete-empty");
  const titre = level2 ? actionLabel : `${actionLabel} — ${review.sourceLabel}`;

  return (
    <main className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-1 px-4 pb-3 pt-5">
        <h1 className="titre-fiche">{titre}</h1>
        <p className="text-xs text-app-muted">{t("review.count", { n: totalAnnonce })}</p>
        {review.action.op === "dedupe" && <p className="text-xs text-app-muted">{t("review.dedupeNote")}</p>}
      </header>
      <div className="flex items-center gap-2 px-4 py-2">
        <input
          className="input w-64"
          placeholder={t("review.filterPlaceholder")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button type="button" className="btn btn-icone" aria-label={t("review.export")} onClick={() => downloadCsv("revue.csv", toCsv(remaining))}>
          <Icone nom="telecharger" />
        </button>
        <button type="button" className="btn" onClick={() => setExcluded(new Set(review.items.map((i) => i.id)))}>
          {t("review.deselect")}
        </button>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => {
            clearSelection();
            goBack();
          }}
        >
          {t("cleanup.retour")}
        </button>
      </div>
      <div ref={parentRef} onKeyDown={clavier.surTouche} className="min-h-0 flex-1 overflow-y-auto">
        <div data-testid="review-virtual" style={{ height: virtual.getTotalSize(), position: "relative" }}>
          {virtual.getVirtualItems().map((v) => {
            const i = visible[v.index]!;
            return (
              // Ligne fixe h-9 (36 px, §8) positionnée par le virtualizer —
              // data-index rattache la fenêtre à l'index filtré (même contrat
              // que ListPane ; pas de measureElement, la hauteur est exacte).
              <label
                key={i.id}
                {...clavier.ligne(v.index)}
                className="absolute left-0 flex h-9 w-full items-center gap-2 border-b border-app-border px-4 text-sm"
                style={{ transform: `translateY(${v.start}px)` }}
              >
                {/* C'est la LIGNE qui est l'arrêt de tabulation : la case en
                    sort, et l'espace la coche depuis la ligne active. */}
                <input
                  type="checkbox"
                  tabIndex={-1}
                  aria-label={i.title}
                  checked={!excluded.has(i.id)}
                  onChange={() => basculer(i.id)}
                />
                <span className="min-w-0 flex-1 truncate">
                  {i.title}
                  {i.dedupeGarde && (
                    <span className="ml-2 text-[11px] text-app-muted">
                      {t("review.dedupeGarde", { titre: i.dedupeGarde.title })}
                    </span>
                  )}
                </span>
                <span className="url shrink-0 text-[11px] text-app-muted">{i.url}</span>
              </label>
            );
          })}
        </div>
      </div>
      {estArchive && !archiveLancee && <AnnonceArchive portee={portee} />}
      {estArchive && archiveLancee ? (
        <footer className="border-t border-app-border bg-app-panel py-3 text-sm">
          <ArchiveJob
            ids={portee.ids}
            onErreur={setErreur}
            onTermine={(r) => {
              // Seul l'inventaire change. Un DÉFICIT (échecs, non tentés) TIENT
              // la Revue pour se lire — R8P-1, comme le dedupe (audit 09-23).
              invaliderSauvegarde();
              clearSelection();
              if (r.echecs.length === 0 && r.nonTentes === 0) goBack();
            }}
          />
        </footer>
      ) : dedupeFin ? (
        // Un terme dedupe portant un déficit : la Revue tient pour le dire.
        <RevueDedupeFin r={dedupeFin} />
      ) : (
      <footer className="flex flex-col gap-2 border-t border-app-border bg-app-panel px-4 py-3 text-sm">
        {dedupeProgress !== null && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-app-muted">{t("review.dedupeEnCours")}</span>
            <BarreProgression done={dedupeProgress.done} total={dedupeProgress.total} cle="dedupe" />
          </div>
        )}
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
            {t("review.confirmL1", { n: estArchive ? portee.ids.length : remaining.length })}
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
          disabled={!canRun || pending}
          onClick={execute}
        >
          {t("review.execute")}
        </button>
      </footer>
      )}
    </main>
  );
}
