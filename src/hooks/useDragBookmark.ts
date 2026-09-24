import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n/fr";
import { useAppState } from "../state/appState";
import { useDrag, type CibleDepot } from "../state/drag";
import { useBulk, useUnrestore } from "./useMutations";
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
// pour Non-taggés, un filtre d'état), et c'est dans `deposer` que la sorte
// choisit le verbe.

/** `visibles` : les signets que la vue MONTRE. La sélection est globale et
 *  survit à la navigation (R9P-1) : tirer un coché n'emmène que les cochés
 *  VISIBLES — comme la BulkBar, qui n'agit que sur l'intersection. Sans
 *  cette borne, le dépôt déplaçait (ou corbeillait) des signets cochés dans
 *  une autre vue, que rien à l'écran ne montrait (audit du 2026-09-23). */
export function useDragBookmark(visibles: readonly number[], origines?: ReadonlyMap<number, number>) {
  const { selectedIds, view } = useAppState();
  // Hors du rendu, comme le geste : lue au pointerdown, jamais une dépendance.
  const vus = useRef(visibles);
  vus.current = visibles;
  // La collection d'où vient chaque signet montré — ce qui rend un
  // déplacement DÉFAISABLE (audit d'ergonomie du 2026-09-24).
  const depuis = useRef(origines);
  depuis.current = origines;
  const unrestore = useUnrestore();
  /** Ce qu'a fait le dernier dépôt réussi, et comment le défaire quand c'est
   *  sûr. Un dépôt réussi ne disait rien : la ligne disparaissait, c'était
   *  tout. */
  const [avis, setAvis] = useState<{ texte: string; annuler?: () => void } | null>(null);
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

  // Rend `true` quand le verbe a abouti : la barre de sélection, qui joue
  // les mêmes verbes sans le geste (`agir`), ne vide la sélection qu'à ce
  // prix. Le dépôt, lui, ignore la promesse.
  const deposer = useCallback(
    (porte: { ids: number[] | null; cible: CibleDepot | null }): Promise<boolean> => {
      const { ids: portes, cible } = porte;
      if (portes === null || portes.length === 0 || cible === null) return Promise.resolve(false);
      setErreur(null);
      setAvis(null);
      const echec = (e: unknown) => setErreur(e instanceof Error ? e.message : String(e));
      // Défaire un déplacement : chaque signet retourne dans SA collection
      // d'origine, un bulk par origine, dans l'ordre. Une origine inconnue,
      // ou une sortie de la corbeille : pas d'Annuler plutôt qu'un faux.
      const retours = new Map<number, number[]>();
      for (const id of portes) {
        const o = depuis.current?.get(id);
        if (o === undefined || sourceCorbeille) { retours.clear(); break; }
        retours.set(o, [...(retours.get(o) ?? []), id]);
      }
      const defaireDeplacement = async () => {
        for (const [origine, ids] of retours) await bulk.mutateAsync({ operation: "move", collection_id: 0, ids, to_collection_id: origine });
        setAvis(null);
      };
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
            // L'union se joue côté sidecar, item par item : l'update PAR ITEM
            // de Raindrop REMPLACE les étiquettes — poser ne doit jamais effacer.
            return api.send("POST", "/api/raindrops/bulk-tag", { ids: portes, tag: cible.nom });
        }
      })();
      return verbe.then((res) => {
        const n = portes.length;
        switch (cible.sorte) {
          case "collection":
          case "tous":
            setAvis({ texte: t("drag.deplaces", { n }), ...(retours.size > 0 ? { annuler: () => void defaireDeplacement().catch(echec) } : {}) });
            break;
          case "favoris":
            // Pas d'Annuler : on ne sait pas lesquels étaient déjà favoris.
            setAvis({ texte: t("drag.favoris", { n }) });
            break;
          case "corbeille": {
            const r = res as { corbeille: number; deja: number; echecs: unknown[] };
            // Annuler restaurerait AUSSI un signet déjà corbeillé avant le
            // geste — seulement quand tout ce qui a été tiré y est allé.
            const sur = r.deja === 0 && r.echecs.length === 0 && r.corbeille > 0;
            const defaire = () => void unrestore.mutateAsync({ ids: portes }).then(() => setAvis(null), echec);
            setAvis({ texte: t("drag.corbeilles", { n: r.corbeille }), ...(sur ? { annuler: defaire } : {}) });
            break;
          }
          case "tag":
            // Pas d'Annuler : on ne sait pas qui la portait déjà.
            setAvis({ texte: t("drag.etiquete", { n: (res as { marques: number }).marques, tag: cible.nom }) });
        }
        return true;
      }, (e) => {
        echec(e);
        return false;
      });
    },
    // `view` dans les deps : quitter la corbeille doit recalculer la source
    // du move — une closure périmée corbeillerait depuis -99 hors corbeille.
    [bulk, view, unrestore],
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
      void deposer(terminer());
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
        // Sélection liée : tirer un signet COCHÉ emmène les cochés VISIBLES ;
        // un signet non coché ne s'agrège pas à elle — on tire ce qu'on
        // montre, pas ce qui est coché ailleurs.
        const montres = new Set(vus.current);
        const embarques = selectedIds.has(id) ? [...selectedIds].filter((v) => v === id || montres.has(v)) : [id];
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

  // Les verbes du dépôt SANS le geste — la barre de sélection (écart §115 :
  // déplacer plusieurs signets n'existait qu'à la souris). Mêmes routes, même
  // avis, même Annuler.
  const agir = useCallback((ids: number[], cible: CibleDepot) => deposer({ ids, cible }), [deposer]);

  return { poignee, agir, enCours: ids !== null, erreur, effacerErreur: () => setErreur(null), avis, fermerAvis: () => setAvis(null) };
}
