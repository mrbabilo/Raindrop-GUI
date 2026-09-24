import { useState } from "react";
import { t } from "../i18n/fr";

/**
 * Le bouton qui lance une analyse — et, quand elle ENVOIE quelque chose
 * hors de l'application, qui l'annonce d'abord (proposition 3 de l'audit
 * UX). Premier clic : l'annonce et deux issues ; « Lancer la vérification »
 * lance, « Ne pas lancer » referme. Sans annonce, un clic lance.
 * Partagé par le tableau de bord et les vues vides : aucun point de
 * lancement ne contourne l'annonce.
 */
export function LancementAnalyse({ libelle, annonce, lancer, disabled = false }: {
  libelle: string;
  annonce?: string;
  lancer: () => void;
  disabled?: boolean;
}) {
  const [arme, setArme] = useState(false);
  if (annonce === undefined || !arme)
    return (
      <button type="button" className="btn shrink-0" disabled={disabled} onClick={annonce === undefined ? lancer : () => setArme(true)}>
        {libelle}
      </button>
    );
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span role="note" className="text-xs text-app-muted">{annonce}</span>
      <button type="button" className="btn shrink-0" disabled={disabled} onClick={() => { setArme(false); lancer(); }}>
        {t("scan.confirmer")}
      </button>
      <button type="button" className="btn shrink-0" onClick={() => setArme(false)}>
        {t("scan.renoncer")}
      </button>
    </span>
  );
}
