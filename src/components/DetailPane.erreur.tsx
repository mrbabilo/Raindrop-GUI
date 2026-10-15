import { t } from "../i18n/fr";
import { useAppState } from "../state/appState";
import { useStartScan } from "../hooks/useAnalysis";

/** Une absence confirmée n'est ni une preuve de suppression ni un lien mort. */
export function ErreurDetail({ error, retry, fetching }: { error: Error; retry(): void; fetching: boolean }) {
  const { view } = useAppState();
  const scan = useStartScan("duplicates");
  const absent = (error as Error & { code?: string }).code === "SIGNET_INTROUVABLE";
  const doublons = view.kind === "cleanupView" && view.type === "duplicates";
  return (
    <div className="space-y-3">
      <p role="alert">{absent ? t("detail.introuvable") : t("state.error", { message: error.message })}</p>
      {absent && doublons && <>
        <p>{t("detail.analysePerimee")}</p>
        <button type="button" className="btn btn-primary" disabled={scan.isPending} onClick={() => scan.mutate()}>
          {t("detail.actualiserDoublons")}
        </button>
        {scan.isPending && <p role="status">{t("detail.actualisationEnCours")}</p>}
        {scan.isError && <p role="alert">{scan.error.message}</p>}
      </>}
      <button type="button" className="btn block" disabled={fetching} onClick={retry}>{t("state.retry")}</button>
    </div>
  );
}
