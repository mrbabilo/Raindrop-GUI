import { useCallback, useState } from "react";

// L'état replié de la barre latérale, retenu d'une session à l'autre : un
// panneau qu'on replie pour gagner de la place se rouvrirait sinon à chaque
// lancement. Même motif que `theme.ts` — lecture défensive, écriture qui
// n'explose jamais (mode privé, stockage refusé).
const CLE = "raindrop-gui-sidebar-repliee";

function lire(): boolean {
  try {
    return localStorage.getItem(CLE) === "1";
  } catch {
    return false;
  }
}

export function useSidebarRepliee(): { repliee: boolean; basculer: () => void } {
  const [repliee, setRepliee] = useState<boolean>(lire);
  const basculer = useCallback(() => {
    setRepliee((avant) => {
      const apres = !avant;
      try {
        localStorage.setItem(CLE, apres ? "1" : "0");
      } catch {
        /* stockage indisponible : le repli vaut pour la session, c'est tout */
      }
      return apres;
    });
  }, []);
  return { repliee, basculer };
}

// La largeur de la FICHE (audit d'ergonomie du 2026-09-24 : 320 px fixes).
// Bornée : en deçà de 280, les boutons d'action se replient mal ; au-delà
// de 560, la liste n'a plus de quoi montrer un titre.
const CLE_FICHE = "raindrop-gui-largeur-fiche";
export const FICHE = { defaut: 320, min: 280, max: 560 } as const;
const borner = (px: number) => Math.round(Math.min(FICHE.max, Math.max(FICHE.min, px)));

function lireLargeur(): number {
  try {
    const px = Number(localStorage.getItem(CLE_FICHE));
    return Number.isFinite(px) && px > 0 ? borner(px) : FICHE.defaut;
  } catch {
    return FICHE.defaut;
  }
}

export function useLargeurFiche(): { largeur: number; regler: (px: number) => void } {
  const [largeur, setLargeur] = useState<number>(lireLargeur);
  const regler = useCallback((px: number) => {
    const b = borner(px);
    setLargeur(b);
    try {
      localStorage.setItem(CLE_FICHE, String(b));
    } catch {
      /* stockage indisponible : la largeur vaut pour la session */
    }
  }, []);
  return { largeur, regler };
}
