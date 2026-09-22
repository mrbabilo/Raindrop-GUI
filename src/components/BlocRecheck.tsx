import { useEffect, useState } from "react";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { useCancelJob, useRecheckIndetermine, type ScanEvent } from "../hooks/useAnalysis";
import { useJobsEnVol } from "../hooks/useBackup";

// La revérification des indéterminés (ROADMAP 2026-09-22) vit DANS la vue
// « À vérifier à la main » : un bouton qui re-regarde ce qu'on n'a pas su
// classer, sans balayer la bibliothèque. Le patron est celui de BlocScan
// (dashboard) en miniature : le handle {jobId, controller} vit dans CE
// state ; `running` sidecar ferme le trou du remount ; le job EN VOL qu'on
// n'a pas lancé soi-même est adopté par /api/jobs (même règle que la
// sauvegarde : quitter la vue pendant le job ne le rend ni insuivable ni
// inannulable).
export function BlocRecheck({ total }: { total: number }) {
  const [job, setJob] = useState<{ jobId: string; controller: AbortController } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Quitter la vue coupe le SUIVI SSE — le job sidecar, lui, continue ; le
  // retour l'adopte par /api/jobs.
  useEffect(() => () => job?.controller.abort(), [job]);
  const cancelJob = useCancelJob();
  const adopte = useJobsEnVol().data?.find((j) => j.type === "recheck-indeterminate");
  const start = useRecheckIndetermine((e: ScanEvent) => {
    if (e.kind === "start") setJob({ jobId: e.jobId, controller: e.controller });
    else setProgress({ done: e.done, total: e.total });
  });
  const lancer = () =>
    start.mutate(undefined, {
      onSettled: () => {
        setJob(null);
        setProgress(null);
      },
    });
  const annuler = () => {
    if (job) job.controller.abort();
    const id = job?.jobId ?? adopte?.id;
    if (id) cancelJob.mutate(id);
  };

  const vu = progress ?? adopte?.progress ?? null;
  if (job || adopte) {
    return (
      <span className="flex items-center gap-2">
        {vu && (
          <span role="status" className="text-xs text-app-muted">
            {t("cleanup.rechecking", { done: vu.done, total: vu.total })}
          </span>
        )}
        <button type="button" className="btn btn-icone" aria-label={t("cleanup.cancel")} onClick={annuler}>
          <Icone nom="croix" />
        </button>
      </span>
    );
  }
  return (
    <>
      {/* N=0 : rien à re-regarder — un bouton qui ne ferait rien n'existe pas. */}
      <button type="button" className="btn" disabled={start.isPending || total === 0} onClick={lancer}>
        {t("cleanup.reverifier", { n: total })}
      </button>
      {start.isError && start.error?.name !== "AbortError" && (
        <p role="alert" className="text-xs text-app-broken">
          {t("state.error", { message: String(start.error?.message ?? "") })}
        </p>
      )}
    </>
  );
}
