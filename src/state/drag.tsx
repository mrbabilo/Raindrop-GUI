import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

// L'état d'un déplacement en cours, partagé entre la LISTE (la source) et la
// SIDEBAR (les cibles) — deux sous-arbres sans ancêtre commun autre que App.
// Il vit dans son propre contexte plutôt que dans appState : la navigation et
// la sélection n'ont rien à voir avec un geste de souris en cours, et le
// reducer de navigation n'a pas à se réveiller à chaque survol.

export interface DragEtat {
  /** Signets embarqués. `null` : aucun déplacement en cours. */
  ids: number[] | null;
  /** Collection survolée, si le dépôt y est permis. `null` : aucune. */
  cible: number | null;
}

interface DragApi extends DragEtat {
  commencer(ids: number[]): void;
  survoler(collectionId: number | null): void;
  /** Termine le geste et rend ce qu'il portait — au consommateur d'agir. */
  terminer(): DragEtat;
}

const vide: DragEtat = { ids: null, cible: null };

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
      commencer: (ids) => setEtat({ ids, cible: null }),
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
