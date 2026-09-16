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

interface State { view: View }
type Action = { type: "go"; view: View } | { type: "patch"; patch: ListPatch };

const initial: State = { view: { kind: "list", collectionId: 0, label: t("nav.all") } };
function reducer(s: State, a: Action): State {
  if (a.type === "go") return { view: a.view };
  if (a.type === "patch" && s.view.kind === "list") return { view: { ...s.view, ...a.patch } };
  return s;
}

// Hors provider, `go` et `patchList` sont des no-op volontaires : les tests
// rendent App nu.
const Ctx = createContext<{ view: View; go: (v: View) => void; patchList: (p: ListPatch) => void }>({
  view: initial.view,
  go: () => undefined,
  patchList: () => undefined,
});

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  return (
    <Ctx.Provider
      value={{
        view: state.view,
        go: (view) => dispatch({ type: "go", view }),
        patchList: (patch) => dispatch({ type: "patch", patch }),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAppState = () => useContext(Ctx);
