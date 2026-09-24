import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { nomIcone } from "../design/nomIcone";
import type { useDragBookmark } from "../hooks/useDragBookmark";

/**
 * Ce qu'a donné le dernier glisser-déposer, sous la liste : l'échec (R8P-1,
 * un déplacement raté se dit) ou, depuis l'audit d'ergonomie du 2026-09-24,
 * la RÉUSSITE — avec « Annuler » quand le défaire est sûr. Partagé par la
 * liste et la vue de collection, et rendu aussi quand la liste est vide :
 * tout déplacer hors d'une collection ne doit pas emporter l'Annuler.
 */
export function AvisDepot({ drag }: { drag: ReturnType<typeof useDragBookmark> }) {
  if (drag.erreur !== null)
    return (
      <p role="alert" className="border-t border-app-border px-3 py-2 text-xs text-app-broken">
        {t("state.error", { message: drag.erreur })}
      </p>
    );
  if (drag.avis === null) return null;
  return (
    <p role="status" className="flex items-center gap-2 border-t border-app-border px-3 py-2 text-xs text-app-muted">
      <span>{drag.avis.texte}</span>
      {drag.avis.annuler && (
        <button type="button" className="btn" onClick={drag.avis.annuler}>
          {t("drag.annuler")}
        </button>
      )}
      <button type="button" className="btn btn-icone ml-auto" {...nomIcone(t("drag.fermerAvis"))} onClick={drag.fermerAvis}>
        <Icone nom="croix" />
      </button>
    </p>
  );
}
