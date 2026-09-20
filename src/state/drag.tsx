import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

// L'état d'un déplacement en cours, partagé entre la LISTE (la source) et la
// SIDEBAR (les cibles) — deux sous-arbres sans ancêtre commun autre que App.
// Il vit dans son propre contexte plutôt que dans appState : la navigation et
// la sélection n'ont rien à voir avec un geste de souris en cours, et le
// reducer de navigation n'a pas à se réveiller à chaque survol.

/** La cible d'un dépôt, par SORTE — chaque sorte a son verbe au relâchement
 *  (useDragBookmark) :
 *  - `collection` : déplacer vers elle ;
 *  - `tous` : SORTIR le signet de sa collection (non classés) — « Tous »
 *    n'est pas un lieu, y déposer est une sortie ;
 *  - `favoris` : marquer favori ;
 *  - `corbeille` : mettre à la corbeille (origines lues par le sidecar) ;
 *  - `tag` : marquer avec l'étiquette (union, jamais remplacement).
 *  Non-lus n'existe pas ici : un filtre d'état n'est pas une destination. */
export type CibleDepot =
  | { sorte: "collection"; id: number }
  | { sorte: "tous" }
  | { sorte: "favoris" }
  | { sorte: "corbeille" }
  | { sorte: "tag"; nom: string };

/** Deux cibles sont la MÊME quand leur sorte coïncide — et leur identité
 *  pour celles qui en portent une. La sidebar surligne par cette égalité. */
export function laMemeCible(a: CibleDepot | null, b: CibleDepot | null): boolean {
  if (a === null || b === null || a.sorte !== b.sorte) return false;
  if (a.sorte === "collection" && b.sorte === "collection") return a.id === b.id;
  if (a.sorte === "tag" && b.sorte === "tag") return a.nom === b.nom;
  return true;
}

export interface DragEtat {
  /** Signets embarqués. `null` : aucun déplacement en cours. */
  ids: number[] | null;
  /** Cible survolée, si l'entrée en accepte un. `null` : aucune. */
  cible: CibleDepot | null;
  /** Ce que le fantôme annonce sous le curseur. */
  libelle: string;
}

interface DragApi extends DragEtat {
  commencer(ids: number[], libelle: string): void;
  survoler(cible: CibleDepot | null): void;
  /** Termine le geste et rend ce qu'il portait — au consommateur d'agir. */
  terminer(): DragEtat;
}

const vide: DragEtat = { ids: null, cible: null, libelle: "" };

const DragContext = createContext<DragApi>({
  ...vide,
  commencer: () => undefined,
  survoler: () => undefined,
  terminer: () => vide,
});

export function DragProvider({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<DragEtat>(vide);
  // `dernier` double l'état : `terminer()` doit rendre ce que portait le geste
  // AU MOMENT du relâchement. Un setState est asynchrone — lire `etat` dans le
  // même tour rendrait la valeur du rendu précédent, donc parfois une cible
  // survolée juste avant le relâchement, et le dépôt tomberait à côté.
  const dernier = useMemo(() => ({ courant: vide }), []);
  dernier.courant = etat;

  const api = useMemo<DragApi>(
    () => ({
      ...etat,
      commencer: (ids, libelle) => setEtat({ ids, cible: null, libelle }),
      survoler: (collectionId) =>
        setEtat((s) => (s.ids === null ? s : { ...s, cible: collectionId })),
      terminer: () => {
        const porte = dernier.courant;
        setEtat(vide);
        return porte;
      },
    }),
    [etat, dernier],
  );

  return <DragContext.Provider value={api}>{children}</DragContext.Provider>;
}

export const useDrag = () => useContext(DragContext);
