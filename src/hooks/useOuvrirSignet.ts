// src/hooks/useOuvrirSignet.ts
import { useAppState } from "../state/appState";
import { useArchives, useJobsEnVol } from "./useBackup";
import { lisibilite } from "../lib/lisibilite";
import type { RaindropItem } from "../../shared/types";

/** Le point d'entrée unique du clic de bibliothèque (spec inversion §3) :
 *  lisible → la lecture s'ouvre (returnView = la vue courante) ET la fiche
 *  l'accompagne ; non lisible → la fiche seule, où la raison est nommée.
 *  Le clic ne tombe JAMAIS sur un écran d'échec. */
export function useOuvrirSignet() {
  const { view, go, selectRaindrop } = useAppState();
  const archives = useArchives().data?.set;
  const jobs = useJobsEnVol();
  const archivageEnVol = jobs.data?.some((j) => j.type === "archive") === true;
  return (r: RaindropItem) => {
    const etat = lisibilite(r, archives?.has(r.id) === true, archivageEnVol);
    if (!etat.lisible) {
      selectRaindrop(r.id);
      return;
    }
    go({
      kind: "lecture",
      raindropId: r.id,
      label: r.title,
      // Le contrat dit ABSENT pour l'archive locale : la clé n'est posée que
      // quand elle porte (un `false` explicite serait un état de plus à lire
      // — même contrat que ActionsLecture).
      ...(etat.source === "copie" ? { sourceCopie: true } : {}),
      returnView: view,
    });
    selectRaindrop(r.id);
  };
}
