import { t } from "../i18n/fr";
import { estPlusRecente } from "../lib/versions";
import { useReleases, useVersionInstallee } from "../hooks/useReleases";

/** La section « Version » des Réglages : ce que vous avez, ce qui est
 *  publié, et les notes quand une mise à jour existe. L'échec de l'API
 *  GitHub est silencieux (le confort ne se plaint pas) ; une version mal
 *  formée n'affiche jamais de mise à jour fabriquée (comparerVersion). */
export function SectionVersion() {
  const installee = useVersionInstallee();
  const releases = useReleases();
  const derniere = releases.data?.[0];
  const dispo =
    derniere != null && installee.data != null && estPlusRecente(derniere.tag_name, installee.data);

  return (
    <section aria-label={t("reglages.version")} className="mb-4">
      <p className="mb-1 text-xs uppercase tracking-wide text-app-muted">{t("reglages.version")}</p>
      <p className="flex justify-between text-sm">
        <span>{t("reglages.version.installee")}</span>
        <span className="text-app-muted">{installee.data ?? "—"}</span>
      </p>
      {derniere && (
        <p className="flex justify-between text-sm">
          <span>{t("reglages.version.derniere")}</span>
          <span className={dispo ? "font-medium" : "text-app-muted"}>
            {derniere.tag_name}
            {dispo && ` — ${t("reglages.version.dispo")}`}
          </span>
        </p>
      )}
      {dispo && derniere.body && (
        <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded border border-app-border bg-app p-2 font-mono text-[11px] leading-relaxed">
          {derniere.body}
        </pre>
      )}
    </section>
  );
}
