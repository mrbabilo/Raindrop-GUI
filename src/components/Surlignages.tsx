import { t } from "../i18n/fr";
import type { RaindropItem } from "../../shared/types";

/** Les surlignages de la fiche, en lecture seule (spec §12, Phase 1). Sorti de
 *  DetailPane (cible de 300 lignes). §9 « masqué si nul » : pas de
 *  surlignage, pas de section — le titre seul annoncerait un contenu que la
 *  fiche n'a pas. */
export function Surlignages({ highlights }: { highlights: RaindropItem["highlights"] }) {
  if (highlights.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-app-muted">{t("detail.highlights")}</h3>
      {highlights.map((h) => (
        <blockquote key={h.id} className="border-l-2 border-app-border pl-2 text-sm">
          {h.text}
          {h.note !== "" && <footer className="text-xs text-app-muted">{h.note}</footer>}
        </blockquote>
      ))}
    </section>
  );
}
