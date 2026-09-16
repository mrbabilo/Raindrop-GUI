import { createContext, useContext, useReducer, type ReactNode } from "react";
import { t } from "../i18n/fr";

// SPA à un écran, pas de router : cette union porte la vue courante.
// Extensible : les tasks 6-8 ajouteront des kinds/champs par fusion du
// reducer — les kinds existants ne bougent pas, l'action inconnue est
// ignorée (l'état se rend tel quel).
export type View =
  | { kind: "list"; collectionId: number; label: string; notag?: boolean }
  | { kind: "cleanup" }
  | { kind: "cleanupView"; type: "dead" | "redirect" | "duplicates" | "untagged" | "empty-collections" | "trash" }
  | { kind: "tags" };

interface State { view: View }
type Action = { type: "go"; view: View };

const initial: State = { view: { kind: "list", collectionId: 0, label: t("nav.all") } };
function reducer(s: State, a: Action): State { return a.type === "go" ? { view: a.view } : s; }

// Hors provider, `go` est un no-op volontaire : les tests rendent App nu.
const Ctx = createContext<{ view: View; go: (v: View) => void }>({ view: initial.view, go: () => undefined });

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  return <Ctx.Provider value={{ view: state.view, go: (view) => dispatch({ type: "go", view }) }}>{children}</Ctx.Provider>;
}

export const useAppState = () => useContext(Ctx);
