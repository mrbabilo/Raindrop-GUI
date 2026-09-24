import { t } from "../i18n/fr";
import { coutBalayage } from "../hooks/useBackup";

/**
 * Ce que l'analyse des liens va ENVOYER, dit avant qu'on la lance
 * (proposition 3 de l'audit UX) : une lecture de la bibliothèque chez
 * Raindrop, puis une requête vers le serveur de chaque adresse restant à
 * vérifier — des sites tiers, par milliers. Tout se CALCULE (jamais de
 * chiffre en dur) : la lecture suit `coutBalayage`, le nombre d'adresses la
 * reprise en cache, sinon la taille de la bibliothèque — une borne haute,
 * les adresses partagées ne se vérifiant qu'une fois.
 */
export function annonceScanLiens({ signets, reprise }: {
  signets?: number;
  reprise?: { verifies: number; total: number };
}): string {
  if (signets === undefined) return t("scan.annonceSansCompte");
  const restant = reprise !== undefined && reprise.total > 0 ? Math.max(0, reprise.total - reprise.verifies) : signets;
  const { requetes, duree } = coutBalayage(signets);
  return t("scan.annonce", { n: restant, adresses: restant.toLocaleString("fr-FR"), requetes, duree });
}
