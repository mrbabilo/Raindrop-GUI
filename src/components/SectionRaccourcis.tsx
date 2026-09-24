import { t, type FrKey } from "../i18n/fr";

// Les raccourcis de l'application, écrits là où l'on cherche un réglage
// (audit UX du 2026-09-23, proposition 4) : ⌘K n'avait ni bouton ni mention
// — une fonction qu'on ne pouvait pas découvrir.
const RACCOURCIS: readonly (readonly [string, FrKey])[] = [
  ["⌘K", "raccourci.palette"],
  ["⌘F", "raccourci.recherche"],
  ["⌘E", "raccourci.composer"],
  ["⌘,", "raccourci.reglages"],
  ["⌘[ ⌘←", "raccourci.reculer"],
  ["⌘] ⌘→", "raccourci.avancer"],
  ["⌘R", "raccourci.relire"],
  ["⌫", "raccourci.corbeille"],
  ["F", "raccourci.favori"],
  ["E", "raccourci.editer"],
  ["Échap", "raccourci.echap"],
];

export function SectionRaccourcis() {
  return (
    <>
      <p className="mb-1 text-xs uppercase tracking-wide text-app-muted">{t("reglages.raccourcis")}</p>
      <ul aria-label={t("reglages.raccourcis")} className="mb-4 flex flex-col gap-1 text-sm">
        {RACCOURCIS.map(([touche, cle]) => (
          <li key={touche} className="flex justify-between">
            <span>{t(cle)}</span>
            <kbd className="text-xs text-app-muted">{touche}</kbd>
          </li>
        ))}
      </ul>
    </>
  );
}
