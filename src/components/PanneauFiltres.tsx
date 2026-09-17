import { t } from "../i18n/fr";
import { useAppState } from "../state/appState";

// DESIGN.md §9 « révélé, pas posé » : domaine et dates servent rarement —
// posés en permanence, ils alignaient sept contrôles de même poids dans la
// TopBar (le grief de §11). Ils vivent ici, dépliés par l'icône de réglages.
// Même précédent que NatureChips : le panneau lit la vue lui-même, TopBar ne
// lui passe que la révélation.

// Les filtres du panneau — un seul endroit les nomme, et « Effacer » comme
// « y a-t-il quelque chose à effacer » s'en déduisent.
const CHAMPS = ["domain", "createdStart", "createdEnd"] as const;

export function actifs(view: ReturnType<typeof useAppState>["view"]): boolean {
  return view.kind === "list" && CHAMPS.some((k) => view[k]);
}

export function PanneauFiltres({ ouvert }: { ouvert: boolean }) {
  const { view, patchList } = useAppState();
  if (view.kind !== "list") return null;
  // Un filtre posé ne peut pas devenir invisible : sans cette persistance,
  // replier le panneau laisserait un filtre actif que plus rien ne retire
  // (même contrat qu'en §11 pour une puce de nature active).
  if (!ouvert && !actifs(view)) return null;

  const effacer = () => patchList({ domain: undefined, createdStart: undefined, createdEnd: undefined });

  return (
    <div id="panneau-filtres" className="flex items-center gap-2 px-3 pb-2">
      <input
        aria-label={t("filter.domain")}
        className="input w-32"
        placeholder={t("filter.domainPlaceholder")}
        value={view.domain ?? ""}
        onChange={(e) => patchList({ domain: e.target.value || undefined })}
      />
      <input
        aria-label={t("filter.from")}
        type="date"
        className="input"
        value={view.createdStart ?? ""}
        onChange={(e) => patchList({ createdStart: e.target.value || undefined })}
      />
      <input
        aria-label={t("filter.to")}
        type="date"
        className="input"
        value={view.createdEnd ?? ""}
        onChange={(e) => patchList({ createdEnd: e.target.value || undefined })}
      />
      {/* §9 « masqué si nul » : rien à effacer, pas de commande — et c'est
          elle qui rend le repli possible quand un filtre est posé. */}
      {actifs(view) && (
        <button type="button" className="btn" onClick={effacer}>
          {t("filter.clear")}
        </button>
      )}
    </div>
  );
}
