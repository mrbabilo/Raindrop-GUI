import { t } from "../i18n/fr";
import { LancementAnalyse } from "./LancementAnalyse";

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
  chargement, erreur, vide, reessayer, jamaisAnalyse, analyser, annonceAnalyse, analyseEnCours, messageVide, issueVide,
}: {
  chargement: boolean;
  /** Message d'échec, s'il y en a un. */
  erreur?: string | null;
  vide: boolean;
  /** Relance la requête — sans quoi il ne resterait qu'à recharger la page. */
  reessayer?: () => void;
  /**
   * QUATRIÈME état : aucune analyse n'a jamais tourné.
   *
   * Le troisième mentait à son tour, pour les vues de diagnostic. « Rien
   * ici » y disait « il n'y a plus rien à réparer » alors que la vérité était
   * « je n'ai jamais regardé » — et le compteur du tableau de bord affichait
   * un « 0 » qui se lit « bibliothèque saine ». Deux écrans se lisaient donc
   * comme un bilan de santé là où rien n'avait été mesuré.
   */
  jamaisAnalyse?: boolean;
  /** L'action qui corrige le vide — §10 : le bouton nomme ce qui va se
   *  produire. Absente, la mention reste informative. */
  analyser?: () => void;
  /** Ce que l'analyse ENVOIE hors de l'app, dit avant de la lancer. */
  annonceAnalyse?: string;
  /** L'analyse TOURNE sans avoir jamais abouti (`lastScan` ne se pose qu'à
   *  l'achèvement) : « aucune analyse lancée » mentirait, et le bouton
   *  relancerait ce qui tourne — le sidecar le refuse, en silence. */
  analyseEnCours?: boolean;
  /** Ce que le vide VEUT DIRE ici (« aucun signet ne correspond… ») — à
   *  défaut, « Rien ici ». §10 : un écran vide est une invitation à agir. */
  messageVide?: string;
  /** Le geste qui sort du vide, quand il en existe un. */
  issueVide?: { libelle: string; faire: () => void };
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
  // AVANT le vide : c'est lui qui explique le vide, comme l'échec plus haut.
  if (jamaisAnalyse === true) {
    if (analyseEnCours === true) return <p className="p-4 text-sm text-app-muted">{t("cleanup.scanRunning")}</p>;
    return (
      <p className="flex items-center gap-3 p-4 text-sm text-app-muted">
        <span>{t("state.neverScanned")}</span>
        {analyser !== undefined && (
          <LancementAnalyse libelle={t("cleanup.scan")} annonce={annonceAnalyse} lancer={analyser} />
        )}
      </p>
    );
  }
  // §10 : « Rien ici » dit qu'il n'y a plus rien à traiter, pas un échec.
  if (vide)
    return (
      <p className="flex items-center gap-3 p-4 text-app-muted">
        <span>{messageVide ?? t("state.empty")}</span>
        {issueVide !== undefined && (
          <button type="button" className="btn shrink-0" onClick={issueVide.faire}>
            {issueVide.libelle}
          </button>
        )}
      </p>
    );
  return null;
}
