// src/hooks/useOuvrirSignet.ts
import { useAppState } from "../state/appState";
import { useArchives, useJobsEnVol, chargerInventaire } from "./useBackup";
import { lisibilite } from "../lib/lisibilite";
import type { RaindropItem } from "../../shared/types";

/** Le point d'entrée unique du clic de bibliothèque (spec inversion §3) :
 *  lisible → la lecture s'ouvre (returnView = la vue courante) ET la fiche
 *  l'accompagne ; non lisible → la fiche seule, où la raison est nommée.
 *  Le clic ne tombe JAMAIS sur un écran d'échec.
 *
 *  La décision est asynchrone : si l'inventaire d'archives n'est pas encore
 *  résolu au clic, il est ATTENDU — un appel direct à `chargerInventaire`
 *  (route locale, un essai, sans les retries de la requête montée) — au
 *  lieu de lire `undefined` comme « pas d'archive » : cette course ouvrait
 *  la fiche d'un signet archivé. Inventaire en échec → repli « pas
 *  d'archive » : la fiche nomme la raison. La course inverse — jobs non
 *  résolus lus à `false` — reste assumée : transitoire et non destructrice. */
export function useOuvrirSignet() {
  const { view, go, selectRaindrop } = useAppState();
  const archives = useArchives().data?.set;
  const jobs = useJobsEnVol();
  const archivageEnVol = jobs.data?.some((j) => j.type === "archive") === true;
  return (r: RaindropItem) => {
    void (async () => {
      let set = archives;
      if (set === undefined) {
        try {
          set = (await chargerInventaire()).set;
        } catch {
          // Inventaire indisponible : repli « pas d'archive » — la fiche
          // nomme la raison, le clic ne devient jamais un écran d'échec.
        }
      }
      const etat = lisibilite(r, set?.has(r.id) === true, archivageEnVol);
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
    })();
  };
}
