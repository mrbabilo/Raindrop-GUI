import type { ReactNode } from "react";

// Icônes d'INTERFACE — les six glyphes de NATURE vivent dans glyphes.tsx et
// ne se mélangent pas aux commandes (une responsabilité par fichier).
// DESIGN.md §9 : SVG au trait, 1,6–1,8 sur grille 15–16, jamais d'emoji.
// Précédent : Etoile.tsx, seule icône jusqu'ici.
const STROKE_WIDTH = 1.7;

const paths: Record<string, ReactNode> = {
  // liste : trois filets pleine largeur
  liste: <path d="M3 4.5h10M3 8h10M3 11.5h10" />,
  // mosaïque : quatre tuiles
  mosaique: (
    <>
      <rect x="2.5" y="2.5" width="5" height="5" rx="1" />
      <rect x="8.5" y="2.5" width="5" height="5" rx="1" />
      <rect x="2.5" y="8.5" width="5" height="5" rx="1" />
      <rect x="8.5" y="8.5" width="5" height="5" rx="1" />
    </>
  ),
  // réglages : deux curseurs, poignée à des hauteurs différentes — les
  // filets s'interrompent sous la poignée plutôt que de la traverser.
  reglages: (
    <>
      <path d="M2.5 5.5h1.8M7.7 5.5h5.8M2.5 10.5h6.3M12.2 10.5h1.3" />
      <circle cx="6" cy="5.5" r="1.7" />
      <circle cx="10.5" cy="10.5" r="1.7" />
    </>
  ),
  // chevron : l'ornement d'un bouton-état, jamais seul
  chevron: <path d="M4.5 6.5L8 10l3.5-3.5" />,
};

export type NomIcone = keyof typeof paths;

export function Icone({ nom, className }: { nom: NomIcone; className?: string }) {
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
      {paths[nom]}
    </svg>
  );
}
