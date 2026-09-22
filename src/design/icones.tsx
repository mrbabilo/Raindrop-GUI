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
  // engrenage : six DENTS attachées à la jante, et un moyeu. Ce qui sépare
  // un engrenage d'un soleil tient exactement là — le soleil a des rayons
  // DÉTACHÉS qui pointent vers l'extérieur. L'icône précédente (cercle plus
  // huit rayons droits) était un soleil, et se confondait avec la bascule de
  // thème posée juste à côté dans l'en-tête.
  engrenage: (
    <>
      <path d="M6.29 2.04L9.71 2.04L10.02 3.87L10.57 4.19L12.31 3.54L14.02 6.50L12.59 7.68L12.59 8.32L14.02 9.50L12.31 12.46L10.57 11.81L10.02 12.13L9.71 13.96L6.29 13.96L5.98 12.13L5.43 11.81L3.69 12.46L1.98 9.50L3.41 8.32L3.41 7.68L1.98 6.50L3.69 3.54L5.43 4.19L5.98 3.87Z" />
      <circle cx="8" cy="8" r="2.1" />
    </>
  ),
  // poignée de déplacement : six points en deux colonnes, la convention
  // universelle du « ceci se tire ». Sans elle, rien n'annonçait qu'une ligne
  // était déplaçable — on ne le découvrait qu'en tirant.
  poignee: (
    <>
      <circle cx="6" cy="4" r="0.9" />
      <circle cx="10" cy="4" r="0.9" />
      <circle cx="6" cy="8" r="0.9" />
      <circle cx="10" cy="8" r="0.9" />
      <circle cx="6" cy="12" r="0.9" />
      <circle cx="10" cy="12" r="0.9" />
    </>
  ),
  // barre latérale : le panneau de gauche, replié ou déplié — un rectangle
  // et son montant. L'icône ne change pas selon l'état ; c'est son libellé
  // accessible qui dit vers quoi elle bascule (§9, « une icône par geste »).
  panneauLateral: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M6.2 3v10" />
    </>
  ),
  // crayon : éditer sur place — la pointe touche la ligne du bas.
  crayon: (
    <>
      <path d="M10.6 2.9l2.5 2.5" />
      <path d="M11.3 2.2a1.3 1.3 0 0 1 1.8 0l.7.7a1.3 1.3 0 0 1 0 1.8L6 12.5l-3 .5.5-3z" />
    </>
  ),
  // coche : valider une saisie. Jamais un verbe qui détruit (§9).
  coche: <path d="M3 8.4l3.2 3.2L13 4.6" />,
  // téléchargement : la flèche entre dans le plateau.
  telecharger: (
    <>
      <path d="M8 2.5v7.4M5 7l3 3 3-3" />
      <path d="M2.8 12.2v.5a.8.8 0 0 0 .8.8h8.8a.8.8 0 0 0 .8-.8v-.5" />
    </>
  ),
  // dossier : choisir où écrire.
  dossier: <path d="M2 4.3a1 1 0 0 1 1-1h3l1.3 1.6H13a1 1 0 0 1 1 1v6.8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />,
  // chevron gauche : le pendant de chevronDroit, pour la pagination.
  chevronGauche: <path d="M9.5 4.5L6 8l3.5 3.5" />,
  // croix : fermer, et rien d'autre
  croix: <path d="M4 4l8 8M12 4l-8 8" />,
  corbeille: (
    <path d="M2.5 4.5h11M6.5 2.5h3M4.2 4.5l.6 8a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-8M6.7 7.2v3.6M9.3 7.2v3.6" />
  ),
  restaurer: <path d="M3.2 4.2v3.4h3.4M3.5 7.3a4.9 4.9 0 1 1-.9 3.2" />,
  // chevron : l'ornement d'un bouton-état, jamais seul
  chevron: <path d="M4.5 6.5L8 10l3.5-3.5" />,
  // chevrons d'arbre : l'état d'un groupe plié ou déplié
  chevronBas: <path d="M4.5 6.5L8 10l3.5-3.5" />,
  chevronDroit: <path d="M6.5 4.5L10 8l-3.5 3.5" />,
  // marque-page : sauvegarder la vue courante — le ruban dit « je retiens
  // cette vue », la barre latérale en est le recueil.
  marquePage: <path d="M4.5 3.5h7v10L8 11l-3.5 2.5z" />,
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
