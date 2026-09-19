import { useState } from "react";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { useAppState } from "../state/appState";
import type { AnalysisType } from "../../shared/types";
import {
  useAnalysisStatus,
  useCancelJob,
  useCleanupCounts,
  useStartScan,
  type ScanEvent,
} from "../hooks/useAnalysis";
import { useJobsEnVol } from "../hooks/useBackup";

// DESIGN.md §6-§9 : compteur posé sur la surface work (rayon 11 px), la
// valeur en 12 px quiet (§7), survol par la surface dédiée — pas d'ombre,
// pas de bordure, l'espacement passe par gap.
const compteur =
  "flex items-baseline justify-between gap-3 rounded-[11px] bg-app-panel px-4 py-3 text-left hover:bg-app-hover cursor-pointer";

// Fraîcheur : lastScan ISO formaté fr, sinon « jamais » (§10 : l'écran vide
// invite à agir). Libellés fixés par le plan — R6P, on ne les renomme pas.
const fraicheur = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });
const dateFr = (iso: string | null) => (iso ? fraicheur.format(new Date(iso)) : t("cleanup.never"));

// Les 6 compteurs : `type` est l'union de la vue cleanupView (appState),
// les libellés sont les clés cleanup.* existantes (R6P).
// `scan` nomme l'analyse DONT dépend le compteur : sans elle, sa valeur n'est
// pas « 0 » mais INCONNUE, et les trois premiers l'affichaient comme un
// résultat. Les quatre autres sont des comptes vivants, toujours vrais.
const COMPTEURS = [
  { type: "dead", label: t("cleanup.dead"), scan: "links" },
  { type: "redirect", label: t("cleanup.redirects"), scan: "links" },
  { type: "indeterminate", label: t("cleanup.indeterminate"), scan: "links" },
  { type: "duplicates", label: t("cleanup.duplicates"), scan: "duplicates" },
  { type: "untagged", label: t("cleanup.untagged"), scan: null },
  { type: "empty-collections", label: t("cleanup.empty-collections"), scan: null },
  { type: "trash", label: t("cleanup.trash"), scan: null },
] as const;

type CompteurType = (typeof COMPTEURS)[number]["type"];

// Un bloc de scan par type : fraîcheur + Lancer/Relancer, ou progression +
// Annuler tant que le job lancé ici vit (résolution 2 : le handle
// {jobId, controller} vit dans CE state, jamais dans un global).
// `running` (status sidecar, pollé 5 s) ferme le trou du remount : un scan
// lancé avant de quitter la vue désactive le lancement au retour (R12P-1).
function BlocScan({ type, label, lastScan, running, reprise }: {
  type: AnalysisType;
  label: string;
  lastScan: string | null;
  running: boolean;
  /** L'avancement déjà acquis (liens uniquement) : il rend visible la reprise. */
  reprise?: { verifies: number; total: number };
}) {
  const [job, setJob] = useState<{ jobId: string; controller: AbortController } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cancelJob = useCancelJob();
  // Le job EN VOL qu'on n'a pas lancé soi-même — parce qu'on avait quitté la
  // vue, et que ce composant perd son état au démontage. Sans cette adoption,
  // revenir sur le Nettoyage pendant une analyse de 12 210 liens ne montrait
  // qu'un bouton grisé : ni progression, ni moyen d'annuler. La liste
  // `/api/jobs` porte pourtant tout (mesuré : `300/12210` avec son libellé).
  // Même règle que la sauvegarde (`suiviSauvegarde.ts`) : le job local prime,
  // il est connu avant que la liste ne le voie.
  const adopte = useJobsEnVol().data?.find((j) => j.type === `scan-${type}`);
  const start = useStartScan(type, (e: ScanEvent) => {
    if (e.kind === "start") setJob({ jobId: e.jobId, controller: e.controller });
    else setProgress({ done: e.done, total: e.total });
  });
  const lancer = () =>
    start.mutate(undefined, {
      // Fin du suivi dans TOUS les cas (done, erreur, annulation) : retour au
      // repos ; l'échec, lui, reste affiché inline ci-dessous (pattern T8).
      onSettled: () => {
        setJob(null);
        setProgress(null);
      },
    });
  const annuler = () => {
    // Le job local coupe AUSSI son flux SSE ; l'adopté n'en a pas — il se suit
    // par la liste pollée, et il suffit de demander l'arrêt.
    if (job) job.controller.abort();
    const id = job?.jobId ?? adopte?.id;
    if (id) cancelJob.mutate(id);
  };

  return (
    <section aria-label={label} className="flex items-center gap-3">
      <h2 className="text-sm font-medium">{label}</h2>
      <span className="text-xs text-app-muted">
        {t("cleanup.lastScan")} : {dateFr(lastScan)}
      </span>
      {/* La reprise, dite avant qu'on relance : sinon l'écran affiche
          « Dernier scan : jamais » au-dessus de milliers de liens déjà
          vérifiés, puis une progression qui repart de zéro sur un total
          mystérieusement réduit. */}
      {!job && !running && reprise !== undefined && reprise.verifies > 0 && reprise.verifies < reprise.total && (
        <span className="text-xs text-app-muted">{t("sauvegarde.repriseLiens", reprise)}</span>
      )}
      {job || adopte ? (
        <>
          {(progress ?? adopte?.progress) && (
            <span role="status">
              {t("cleanup.scanning", progress ?? adopte!.progress)}
            </span>
          )}
          <button type="button" className="btn btn-icone" aria-label={t("cleanup.cancel")} onClick={annuler}>
            <Icone nom="croix" />
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn" disabled={start.isPending || running} onClick={lancer}>
            {running ? t("cleanup.scanRunning") : lastScan ? t("cleanup.rescan") : t("cleanup.scan")}
          </button>
          {/* R12P-1 : l'échec de lancement ou du scan ne doit jamais être
              silencieux — inline, brouillon/état non destructif (pattern T8).
              Revue finale : l'AbortError d'une annulation VOLONTAIRE (clic
              Annuler, qui coupe le flux SSE) n'est pas une erreur — pas
              d'alerte, la fin du suivi reste affichée par le retour au repos. */}
          {start.isError && start.error?.name !== "AbortError" && (
            <p role="alert" className="text-xs text-app-broken">
              {t("state.error", { message: String(start.error?.message ?? "") })}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function CleanupDashboard() {
  const { go } = useAppState();
  const status = useAnalysisStatus();
  const counts = useCleanupCounts();
  const valeur: Record<CompteurType, number | undefined> = {
    dead: counts.dead,
    redirect: counts.redirect,
    indeterminate: counts.indeterminate,
    duplicates: counts.duplicates,
    untagged: counts.untagged,
    "empty-collections": counts.emptyCollections,
    trash: counts.trash,
  };
  /**
   * Un compteur dont l'analyse n'a JAMAIS tourné ne vaut pas zéro : il ne vaut
   * rien. Le sidecar rend honnêtement `total: 0` sur un cache vide — c'est
   * l'écran qui mentait en l'affichant tel quel. « Liens morts 0 » se lit
   * « bibliothèque saine », alors que personne n'a regardé.
   */
  const jamais = (scan: "links" | "duplicates" | null): boolean =>
    scan !== null && status.data !== undefined && status.data[scan].lastScan === null;

  return (
    <section aria-label={t("cleanup.title")} className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <h1 className="titre-fiche">{t("cleanup.title")}</h1>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {COMPTEURS.map((c) => (
          <button key={c.type} type="button" className={compteur} onClick={() => go({ kind: "cleanupView", type: c.type })}>
            <span>{c.label}</span>
            <span className="text-xs text-app-muted" data-testid={`compteur-${c.type}`}>
              {jamais(c.scan)
                ? t("cleanup.jamaisAnalyse")
                : c.type === "duplicates" && counts.duplicatesItems !== undefined && valeur[c.type] !== undefined
                  ? // GROUPES et SIGNETS : « 414 » seul se lisait « 414 signets
                    // en double », quand la mesure réelle donne 414 groupes
                    // pour 1 032 signets concernés.
                    t("cleanup.duplicatesCount", { n: valeur[c.type]!, items: counts.duplicatesItems })
                  : (valeur[c.type] ?? "…")}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <BlocScan
          type="links"
          label={t("nature.link")}
          lastScan={status.data?.links.lastScan ?? null}
          running={status.data?.links.running ?? false}
          reprise={
            status.data?.links.verifies !== undefined && status.data.links.total !== undefined
              ? { verifies: status.data.links.verifies, total: status.data.links.total }
              : undefined
          }
        />
        <BlocScan
          type="duplicates"
          label={t("cleanup.duplicates")}
          lastScan={status.data?.duplicates.lastScan ?? null}
          running={status.data?.duplicates.running ?? false}
        />
      </div>
    </section>
  );
}
