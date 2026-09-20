import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n/fr";
import { useAppState } from "../state/appState";
import { useDrag, type CibleDepot } from "../state/drag";
import { useBulk } from "./useMutations";
import { api } from "../lib/api";

// Déplacer un signet en le tirant sur une collection de la sidebar.
//
// Pointer events plutôt que le drag & drop HTML5 : ce dernier n'est pas
// pilotable sous jsdom (pas de vrai DataTransfer), la fonctionnalité ne
// reposerait donc que sur un contrôle au navigateur. `pointerdown` /
// `pointermove` / `pointerup` se posent en test, et chaque règle du geste —
// seuil, sélection liée, cibles interdites, échec — garde son contrat.

/** En deçà, le geste reste un clic : la main tremble, elle ne déplace pas. */
const SEUIL_PX = 5;

// La garde de sélection, MESURÉE dans le vrai WebKit (sonde, 2026-09-22) :
// la forme STANDARD `style.userSelect` y est ignorée — le computed reste
// `text` — quand la forme PRÉFIXÉE décide. La garde est donc une FEUILLE DE
// STYLE qui pose les deux formes en CSS pur — le parseur du webview lit les
// deux, exactement comme le `select-none` de Tailwind — et se retire à la
// fin du geste. Posée AU POINTERDOWN, pas au rendu du fantôme : quelques
// frames plus tard, WebKit avait déjà amorcé la sélection sur les zones
// traversées (barre latérale, fiche).
const couperSelection = (): HTMLStyleElement => {
  const garde = document.createElement("style");
  garde.dataset.gardeDrag = "";
  garde.textContent =
    "body, body * { user-select: none !important; -webkit-user-select: none !important; }";
  document.head.appendChild(garde);
  return garde;
};
const rendreSelection = (garde: HTMLStyleElement | null): void => {
  garde?.remove();
};

// `depotPermis` a vécu : la garde n'est plus une interdiction de nombre mais
// une TABLE DES SORTES — chaque entrée de la sidebar pose SA cible (ou pas,
// pour Non-lus, un filtre d'état), et c'est dans `deposer` que la sorte
// choisit le verbe.

export function useDragBookmark() {
  const { selectedIds, view } = useAppState();
  const { ids, commencer, terminer } = useDrag();
  const bulk = useBulk();
  const [erreur, setErreur] = useState<string | null>(null);

  // La SOURCE du bulk move est l'endroit D'OÙ l'on tire (trap compilé MCP :
  // `PUT /raindrops/{collection_id}`). Depuis la liste Corbeille, les ids
  // vivent en -99 : déposer les en FAIT SORTIR — `PUT /raindrops/-99` avec
  // la destination choisie par le dépôt, exactement la voie de restauration.
  // Depuis 0, Raindrop ne trouvait rien à déplacer et rien ne sortait jamais
  // de la corbeille par drag (défaut signalé 2026-09-20).
  const sourceCorbeille = view.kind === "list" && view.collectionId === -99;
  const sourceMove = sourceCorbeille ? -99 : 0;

  // Origine du geste et signets embarqués, hors du rendu : ils changent à
  // chaque pixel parcouru, et un rendu par pixel ferait ramer la liste.
  // `garde` : les DEUX formes de user-select posées au document au
  // pointerdown, à rendre au relâchement — posées AU POINTERDOWN, pas au
  // rendu du fantôme : quelques frames plus tard, WebKit avait déjà amorcé
  // la sélection sur les zones traversées (barre latérale, fiche).
  const geste = useRef<{ x: number; y: number; ids: number[]; libelle: string; franchi: boolean; garde: HTMLStyleElement } | null>(null);
  // Vrai tant que le clic de fin appartient à un déplacement. Sans cette
  // garde, relâcher au-dessus d'une ligne ouvrirait la fiche en prime.
  const etaitDrag = useRef(false);

  const deposer = useCallback(
    (porte: { ids: number[] | null; cible: CibleDepot | null }) => {
      const { ids: portes, cible } = porte;
      if (portes === null || portes.length === 0 || cible === null) return;
      setErreur(null);
      // La table des sortes : une cible, un verbe. `sourceMove` porte la
      // source du bulk move (0 hors corbeille, -99 dedans) — jamais un
      // marqueur front (R3P).
      const verbe = (async () => {
        switch (cible.sorte) {
          case "collection":
            return bulk.mutateAsync({ operation: "move", collection_id: sourceMove, ids: portes, to_collection_id: cible.id });
          case "tous":
            // Y déposer SORT le signet de sa collection : non classés (-1),
            // destination réelle côté API (demande du 2026-09-20). Depuis la
            // corbeille, la source est -99 : c'est une sortie vers les non
            // classés.
            return bulk.mutateAsync({ operation: "move", collection_id: sourceMove, ids: portes, to_collection_id: -1 });
          case "favoris":
            // Non destructeur : `important` est un booléen, la route bulk
            // l'accepte telle quelle.
            return bulk.mutateAsync({ operation: "update", collection_id: 0, ids: portes, important: true });
          case "corbeille":
            // La sélection tirée ne transporte pas les origines : le sidecar
            // les LIT, item par item, et les mémorise avant la corbeille
            // (§4.2 — la restauration à l'origine ne se dégrade jamais).
            return api.send("POST", "/api/raindrops/bulk-trash", { ids: portes });
          case "tag":
            // L'union se joue côté sidecar : le bulk update de Raindrop
            // REMPLACE les étiquettes — poser ne doit jamais effacer.
            return api.send("POST", "/api/raindrops/bulk-tag", { ids: portes, tag: cible.nom });
        }
      })();
      verbe.catch((e: unknown) => setErreur(e instanceof Error ? e.message : String(e)));
    },
    // `view` dans les deps : quitter la corbeille doit recalculer la source
    // du move — une closure périmée corbeillerait depuis -99 hors corbeille.
    [bulk, view],
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
      if (g === null) return;
      rendreSelection(g.garde);
      if (!g.franchi) return;
      deposer(terminer());
    };
    // Le système peut interrompre le geste (changement d'app, geste du
    // trackpad avorté) : sans ce filet, la garde resterait posée et la
    // sélection de texte serait morte jusqu'au prochain drag.
    const interrompu = () => {
      const g = geste.current;
      geste.current = null;
      if (g === null) return;
      rendreSelection(g.garde);
    };
    window.addEventListener("pointermove", bouge);
    window.addEventListener("pointerup", lache);
    window.addEventListener("pointercancel", interrompu);
    return () => {
      window.removeEventListener("pointermove", bouge);
      window.removeEventListener("pointerup", lache);
      window.removeEventListener("pointercancel", interrompu);
    };
  }, [commencer, terminer, deposer]);

  // Filet de DÉMONTAGE uniquement (deps vides) : un re-render qui re-court
  // l'effet des listeners ne doit jamais tuer un geste en cours — le geste
  // vit hors du rendu (ref), le re-rendu fait partie de sa vie normale
  // (survoler() en pose un, au cœur du geste). Seul le démontage du
  // composant rend la garde et le geste morts-nés.
  useEffect(() => {
    const notre = geste;
    return () => {
      const g = notre.current;
      if (g !== null) {
        notre.current = null;
        rendreSelection(g.garde);
      }
    };
  }, []);

  /**
   * Handlers à étaler sur une ligne. `ouvrir` est son action de clic : elle
   * n'est jouée que si le geste est resté un clic.
   */
  const poignee = useCallback(
    (id: number, ouvrir: () => void, titre = "") => ({
      onPointerDown: (e: { clientX: number; clientY: number; button?: number }) => {
        if (e.button !== undefined && e.button !== 0) return; // clic droit : pas un déplacement
        // La garde AVANT tout pixel (les deux formes — voir plus haut).
        const garde = couperSelection();
        // Sélection liée : tirer un signet COCHÉ emmène toute la sélection ;
        // un signet non coché ne s'agrège pas à elle — on tire ce qu'on
        // montre, pas ce qui est coché ailleurs.
        const embarques = selectedIds.has(id) ? [...selectedIds] : [id];
        // Un fantôme qui annonce « 3 signets » vaut mieux que trois titres
        // empilés : on déplace un LOT, sa taille est la seule chose à savoir.
        const libelle = embarques.length > 1 ? t("drag.count", { n: embarques.length }) : titre;
        geste.current = { x: e.clientX, y: e.clientY, ids: embarques, libelle, franchi: false, garde };
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
