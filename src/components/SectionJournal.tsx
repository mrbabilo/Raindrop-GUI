import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { t } from "../i18n/fr";
import { chargerJournal, formatterEntree } from "../lib/journal";

/** La section « Journal » des Réglages (2026-09-20) : le journal du jour,
 *  lisible — écritures, jobs, erreurs. Il se RELIT (Rafraîchir), il ne se
 *  regarde pas en direct ; « Copier » emporte le texte formaté pour un
 *  rapport. Extrait de Reglages, même frontière que SectionSauvegarde. */
export function SectionJournal() {
  const q = useQuery({ queryKey: ["journal"], queryFn: chargerJournal });
  const [copie, setCopie] = useState(false);
  const entrees = q.data ?? [];
  const texte = () => entrees.map(formatterEntree).join("\n");

  const copier = () => {
    void navigator.clipboard.writeText(texte()).then(
      () => setCopie(true),
      () => undefined, // un clipboard refusé n'est pas une panne : le bouton retente
    );
  };

  return (
    <section aria-label={t("reglages.journal")} className="mb-4">
      <p className="mb-1 text-xs uppercase tracking-wide text-app-muted">{t("reglages.journal")}</p>
      <div className="mb-2 max-h-48 overflow-y-auto rounded border border-app-border bg-app px-2 py-1">
        {q.isPending ? (
          <p className="text-xs text-app-muted">{t("state.loading")}</p>
        ) : q.isError ? (
          <p role="alert" className="text-xs text-app-broken">
            {t("state.error", { message: q.error.message })}
          </p>
        ) : entrees.length === 0 ? (
          <p className="text-xs text-app-muted">{t("reglages.journal.vide")}</p>
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">{texte()}</pre>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn" onClick={() => void q.refetch()}>
          {t("reglages.journal.rafraichir")}
        </button>
        <button
          type="button"
          className="btn"
          disabled={entrees.length === 0}
          onClick={copier}
        >
          {copie ? t("reglages.journal.copie") : t("reglages.journal.copier")}
        </button>
      </div>
    </section>
  );
}
