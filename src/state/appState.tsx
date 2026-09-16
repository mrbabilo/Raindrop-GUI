import { createContext, useContext, useReducer, type ReactNode } from "react";
import { t } from "../i18n/fr";

// SPA à un écran, pas de router : cette union porte la vue courante.
// Extensible : les tasks 7-8 ajouteront des kinds/champs par fusion du
// reducer — les kinds existants ne bougent pas, l'action inconnue est
// ignorée (l'état se rend tel quel).
export type View =
  | {
      kind: "list";
      collectionId: number;
      label: string;
      notag?: boolean;
      search?: string;
      sort?: string;
      viewMode?: "list" | "mosaic";
      domain?: string;
      media?: string;
      createdStart?: string;
      createdEnd?: string;
    }
  | { kind: "cleanup" }
  | { kind: "cleanupView"; type: "dead" | "redirect" | "duplicates" | "untagged" | "empty-collections" | "trash" }
  | { kind: "tags" };

// Les filtres/tri/mode portés par la vue list — cible du merge de patchList.
type ListPatch = Partial<Extract<View, { kind: "list" }>>;

// Task 7 : le même store porte la sélection — SPA à un écran, pas de router.
// `selectedIds` : cases à cocher des lignes (actions groupées, Task 9) ;
// `selectedRaindropId` : l'item ouvert dans le volet détail (Task 8).
interface State {
  view: View;
  selectedIds: Set<number>;
  selectedRaindropId: number | null;
}
type Action =
  | { type: "go"; view: View }
  | { type: "patch"; patch: ListPatch }
  | { type: "toggleSelect"; id: number }
  | { type: "clearSelection" }
  | { type: "selectRaindrop"; id: number };

const initial: State = {
  view: { kind: "list", collectionId: 0, label: t("nav.all") },
  selectedIds: new Set<number>(),
  selectedRaindropId: null,
};
function reducer(s: State, a: Action): State {
  if (a.type === "go") return { ...s, view: a.view };
  if (a.type === "patch" && s.view.kind === "list") return { ...s, view: { ...s.view, ...a.patch } };
  if (a.type === "toggleSelect") {
    const selectedIds = new Set(s.selectedIds); // copie : l'immutabilité fait le re-rendu
    if (selectedIds.has(a.id)) selectedIds.delete(a.id);
    else selectedIds.add(a.id);
    return { ...s, selectedIds };
  }
  if (a.type === "clearSelection") return { ...s, selectedIds: new Set<number>() };
  if (a.type === "selectRaindrop") return { ...s, selectedRaindropId: a.id };
  return s;
}

// Hors provider, toutes les actions sont des no-op volontaires : les tests
// rendent App nu.
const Ctx = createContext<{
  view: View;
  go: (v: View) => void;
  patchList: (p: ListPatch) => void;
  selectedIds: Set<number>;
  toggleSelect: (id: number) => void;
  clearSelection: () => void;
  selectedRaindropId: number | null;
  selectRaindrop: (id: number) => void;
}>({
  view: initial.view,
  go: () => undefined,
  patchList: () => undefined,
  selectedIds: new Set<number>(),
  toggleSelect: () => undefined,
  clearSelection: () => undefined,
  selectedRaindropId: null,
  selectRaindrop: () => undefined,
});

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  return (
    <Ctx.Provider
      value={{
        view: state.view,
        go: (view) => dispatch({ type: "go", view }),
        patchList: (patch) => dispatch({ type: "patch", patch }),
        selectedIds: state.selectedIds,
        toggleSelect: (id) => dispatch({ type: "toggleSelect", id }),
        clearSelection: () => dispatch({ type: "clearSelection" }),
        selectedRaindropId: state.selectedRaindropId,
        selectRaindrop: (id) => dispatch({ type: "selectRaindrop", id }),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAppState = () => useContext(Ctx);
