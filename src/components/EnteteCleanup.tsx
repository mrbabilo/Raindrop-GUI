//! L'entête commune des vues de traitement, et leurs libellés.
//!
//! Partagée depuis que `ResultatsLiens` vit dans son propre fichier : deux
//! consommateurs, un seul endroit qui range les libellés.

import type { ReactNode } from "react";
import { Icone } from "../design/icones";
import { t } from "../i18n/fr";
import type { View } from "../state/appState";
import { nomIcone } from "../design/nomIcone";

export type CleanupType = Extract<View, { kind: "cleanupView" }>["type"];

// R6P : mêmes libellés que les compteurs du dashboard (clés cleanup.*).
export const LABELS: Record<CleanupType, string> = {
  dead: t("cleanup.dead"),
  redirect: t("cleanup.redirects"),
  indeterminate: t("cleanup.indeterminate"),
  duplicates: t("cleanup.duplicates"),
  untagged: t("cleanup.untagged"),
  "empty-collections": t("cleanup.empty-collections"),
  trash: t("cleanup.trash"),
};

// Chip d'entête : libellé + compteur (total selon type) — « Liens morts (23) ».
// L'action engageante de branche (vider, supprimer les vides) vit à droite.
export function Entete({ label, count, action, retour }: {
  label: string;
  count?: number;
  action?: ReactNode;
  /** L'écran d'où l'on vient, quand la navigation ne se devine pas : les
   *  vues de traitement s'ouvrent depuis un compteur, pas d'un voisin
   *  visible — sans ce bouton, le retour ne passe que par la barre
   *  latérale, et rien ne le dit. */
  retour?: { label: string; onClick(): void };
}) {
  return (
    <header className="flex items-center gap-3 px-4 pt-4">
      {retour && (
        <button type="button" className="btn btn-icone shrink-0" {...nomIcone(retour.label)} onClick={retour.onClick}>
          <Icone nom="chevronGauche" />
        </button>
      )}
      <h1 className="titre-fiche">{label}</h1>
      {count !== undefined && <span className="text-xs text-app-muted">({count})</span>}
      {action && <div className="ml-auto">{action}</div>}
    </header>
  );
}

