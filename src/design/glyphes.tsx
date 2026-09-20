import type { ReactNode } from "react";

// DESIGN.md §2.1 : six glyphes de nature, un par valeur de RaindropItem.type.
// Grille 16, trait 1.7, jamais de couleur ni de fond (§2, "quiet" seulement,
// hérité de currentColor) — une lettre de plus dans la ligne du domaine, pas
// un badge. Task 7b consomme ce module tel quel : ne pas le dupliquer.
const STROKE_WIDTH = 1.7;

// Un seul type par item : Task 7b et NatureChips itèrent sur cet ordre pour
// retomber sur le tableau §2.1 quand aucune fréquence ne les départage.
export const NATURE_TYPES = ["link", "article", "image", "video", "document", "audio"] as const;
export type NatureType = (typeof NATURE_TYPES)[number];

// Un type absent de la table (valeur inconnue renvoyée par Raindrop) retombe
// sur le maillon — DESIGN.md §2.1 ne prévoit pas de septième glyphe.
const paths: Record<NatureType, ReactNode> = {
  // maillon : deux arcs ouverts qui s'entrecroisent
  link: (
    <>
      <path d="M6.4 9.6a2.4 2.4 0 0 0 3.5.2l1.7-1.7a2.4 2.4 0 0 0-3.5-3.5L7 5.7" />
      <path d="M9.6 6.4a2.4 2.4 0 0 0-3.5-.2L4.4 7.9a2.4 2.4 0 0 0 3.5 3.5L9 10.3" />
    </>
  ),
  // feuillet : page avec trois filets de texte
  article: (
    <>
      <rect x="3.5" y="2.5" width="9" height="11" rx="1" />
      <path d="M5.5 6h6M5.5 8.5h6M5.5 11h4" />
    </>
  ),
  // vue : cadre, un mont, un disque en haut à gauche
  image: (
    <>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1" />
      <circle cx="5.4" cy="6.4" r="1" />
      <path d="M2.5 10.7l2.8-2.8 2.3 2.3 2-2.3 3.9 3.9" />
    </>
  ),
  // lecture : cadre, triangle plein centré
  video: (
    <>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1" />
      <path d="M6.7 6.1v3.8l3.4-1.9z" fill="currentColor" stroke="none" />
    </>
  ),
  // document : page à coin replié
  document: <path d="M4.5 2.5h4.5l3 3v8a1 1 0 0 1-1 1h-6.5a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1zM9 2.5v3h3" />,
  // onde : trois barres verticales de hauteurs inégales
  audio: <path d="M5 10.5V6.5M8 12V4M11 10.5V6.5" />,
};

export function Glyphe({ type, className }: { type: string; className?: string }) {
  const key = (type in paths ? type : "link") as NatureType;
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[key]}
    </svg>
  );
}

// Le libellé SINGULIER de la nature de l'item (« Lien », « Vidéo »…) —
// distinct des catégories plurielles des puces (nature.* du dictionnaire).
// Identifié EN TOUTES LETTRES à côté du glyphe en liste et grille
// (signalement 2026-09-20 : le glyphe seul exige de le deviner). Un type
// inconnu se rend tel quel plutôt que de se déguiser en maillon.
const LIBELLES: Record<NatureType, string> = {
  link: "Lien",
  article: "Article",
  image: "Image",
  video: "Vidéo",
  document: "Document",
  audio: "Audio",
};

export function libelleNature(type: string): string {
  return (LIBELLES as Record<string, string>)[type] ?? type;
}
