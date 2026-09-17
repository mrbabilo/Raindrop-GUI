import { t } from "../i18n/fr";

// L'état d'une liste qui charge : chargement, ÉCHEC, ou vide.
//
// Le troisième cas mentait jusqu'ici. Une requête en échec laisse
// `isLoading` retomber à faux et la liste vide : les trois vues affichaient
// donc « Rien ici » — « il n'y a plus rien à réparer » — là où la vérité
// était « je n'ai pas pu regarder ». §10 : une erreur dit ce qui s'est passé
// et comment le corriger.
//
// L'ordre compte : l'échec prime sur le vide, puisque c'est LUI qui explique
// le vide.
export function EtatListe({
  chargement, erreur, vide, reessayer,
}: {
  chargement: boolean;
  /** Message d'échec, s'il y en a un. */
  erreur?: string | null;
  vide: boolean;
  /** Relance la requête — sans quoi il ne resterait qu'à recharger la page. */
  reessayer?: () => void;
}) {
  if (erreur != null && erreur !== "") {
    return (
      // §6 : --color-app-broken, le seul rouge légitime — couleur d'un
      // diagnostic. §10 : le bouton nomme ce qui va se produire.
      <p role="alert" className="flex items-center gap-3 p-4 text-sm text-app-broken">
        <span>{t("state.error", { message: erreur })}</span>
        {reessayer !== undefined && (
          <button type="button" className="btn shrink-0" onClick={reessayer}>
            {t("state.retry")}
          </button>
        )}
      </p>
    );
  }
  if (chargement) return <p className="p-4 text-app-muted">{t("state.loading")}</p>;
  // §10 : « Rien ici » dit qu'il n'y a plus rien à traiter, pas un échec.
  if (vide) return <p className="p-4 text-app-muted">{t("state.empty")}</p>;
  return null;
}
