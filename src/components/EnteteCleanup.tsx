//! L'entête commune des vues de traitement, et leurs libellés.
//!
//! Partagée depuis que `ResultatsLiens` vit dans son propre fichier : deux
//! consommateurs, un seul endroit qui range les libellés.

import type { ReactNode } from "react";
import { t } from "../i18n/fr";
import type { View } from "../state/appState";

export type CleanupType = Extract<View, { kind: "cleanupView" }>["type"];

// R6P : mêmes libellés que les compteurs du dashboard (clés cleanup.*).
export const LABELS: Record<CleanupType, string> = {
  dead: t("cleanup.dead"),
  redirect: t("cleanup.redirects"),
  duplicates: t("cleanup.duplicates"),
  untagged: t("cleanup.untagged"),
  "empty-collections": t("cleanup.empty-collections"),
  trash: t("cleanup.trash"),
};

// Chip d'entête : libellé + compteur (total selon type) — « Liens morts (23) ».
// L'action engageante de branche (vider, supprimer les vides) vit à droite.
export function Entete({ label, count, action }: { label: string; count?: number; action?: ReactNode }) {
  return (
    <header className="flex items-center gap-3 px-4 pt-4">
      <h1 className="titre-fiche">{label}</h1>
      {count !== undefined && <span className="text-xs text-app-muted">({count})</span>}
      {action && <div className="ml-auto">{action}</div>}
    </header>
  );
}

