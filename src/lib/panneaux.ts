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
