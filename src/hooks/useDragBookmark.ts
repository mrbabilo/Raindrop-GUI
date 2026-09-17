import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n/fr";
import { useAppState } from "../state/appState";
import { useDrag } from "../state/drag";
import { useBulk } from "./useMutations";

// Déplacer un signet en le tirant sur une collection de la sidebar.
//
// Pointer events plutôt que le drag & drop HTML5 : ce dernier n'est pas
// pilotable sous jsdom (pas de vrai DataTransfer), la fonctionnalité ne
// reposerait donc que sur un contrôle au navigateur. `pointerdown` /
// `pointermove` / `pointerup` se posent en test, et chaque règle du geste —
// seuil, sélection liée, cibles interdites, échec — garde son contrat.

/** En deçà, le geste reste un clic : la main tremble, elle ne déplace pas. */
const SEUIL_PX = 5;

/**
 * Une collection accepte-t-elle un dépôt ?
 *
 * Non pour la **corbeille** (-99) : y glisser un signet l'effacerait par un
 * geste, sans confirmation, là où la mise à la corbeille est un verbe nommé
 * (§10). Non pour « Tous » (0), qui n'est pas un lieu mais l'absence de
 * filtre, ni pour les marqueurs front Non-lus (-2) et Favoris (-3), qui
 * décrivent un état et ne sortent jamais du front (R3P). Oui pour les non
 * classés (-1), destination réelle côté API.
 */
export function depotPermis(collectionId: number): boolean {
  return collectionId === -1 || collectionId > 0;
}

export function useDragBookmark() {
  const { selectedIds } = useAppState();
  const { ids, commencer, terminer } = useDrag();
  const bulk = useBulk();
  const [erreur, setErreur] = useState<string | null>(null);

  // Origine du geste et signets embarqués, hors du rendu : ils changent à
  // chaque pixel parcouru, et un rendu par pixel ferait ramer la liste.
  const geste = useRef<{ x: number; y: number; ids: number[]; libelle: string; franchi: boolean } | null>(null);
  // Vrai tant que le clic de fin appartient à un déplacement. Sans cette
  // garde, relâcher au-dessus d'une ligne ouvrirait la fiche en prime.
  const etaitDrag = useRef(false);

  const deposer = useCallback(
    (porte: { ids: number[] | null; cible: number | null }) => {
      const { ids: portes, cible } = porte;
      if (portes === null || portes.length === 0) return;
      if (cible === null || !depotPermis(cible)) return;
      setErreur(null);
      // `collection_id: 0` comme la Revue : le contexte du bulk n'est jamais
      // un marqueur front, qui ne doit pas atteindre le sidecar (R3P).
      bulk
        .mutateAsync({ operation: "move", collection_id: 0, ids: portes, to_collection_id: cible })
        .catch((e: unknown) => setErreur(e instanceof Error ? e.message : String(e)));
    },
    [bulk],
  );

  // Les mouvements s'écoutent sur la FENÊTRE, pas sur la ligne : le pointeur
  // quitte la liste dès les premiers pixels — c'est même le but du geste.
  useEffect(() => {
    const bouge = (e: MouseEvent) => {
      const g = geste.current;
      if (g === null || g.franchi) return;
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < SEUIL_PX) return;
      g.franchi = true;
      etaitDrag.current = true;
      commencer(g.ids, g.libelle);
    };
    const lache = () => {
      const g = geste.current;
      geste.current = null;
      if (g === null || !g.franchi) return;
      deposer(terminer());
    };
    window.addEventListener("pointermove", bouge);
    window.addEventListener("pointerup", lache);
    return () => {
      window.removeEventListener("pointermove", bouge);
      window.removeEventListener("pointerup", lache);
    };
  }, [commencer, terminer, deposer]);

  /**
   * Handlers à étaler sur une ligne. `ouvrir` est son action de clic : elle
   * n'est jouée que si le geste est resté un clic.
   */
  const poignee = useCallback(
    (id: number, ouvrir: () => void, titre = "") => ({
      onPointerDown: (e: { clientX: number; clientY: number; button?: number }) => {
        if (e.button !== undefined && e.button !== 0) return; // clic droit : pas un déplacement
        // Sélection liée : tirer un signet COCHÉ emmène toute la sélection ;
        // un signet non coché ne s'agrège pas à elle — on tire ce qu'on
        // montre, pas ce qui est coché ailleurs.
        const embarques = selectedIds.has(id) ? [...selectedIds] : [id];
        // Un fantôme qui annonce « 3 signets » vaut mieux que trois titres
        // empilés : on déplace un LOT, sa taille est la seule chose à savoir.
        const libelle = embarques.length > 1 ? t("drag.count", { n: embarques.length }) : titre;
        geste.current = { x: e.clientX, y: e.clientY, ids: embarques, libelle, franchi: false };
        etaitDrag.current = false;
      },
      onClick: () => {
        if (etaitDrag.current) {
          etaitDrag.current = false;
          return;
        }
        ouvrir();
      },
    }),
    [selectedIds],
  );

  return { poignee, enCours: ids !== null, erreur, effacerErreur: () => setErreur(null) };
}
