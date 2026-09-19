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
      // Les étiquettes retenues, INTERSECTÉES (voir sidecar/api/recherche.ts :
      // l'API n'offre que l'intersection). Un champ à part plutôt que des
      // `#tag` concaténés dans `search` : une étiquette se retire alors d'un
      // clic, là où la chirurgie de chaîne rendrait le retrait approximatif
      // et ferait lutter la saisie de la TopBar contre les pilules.
      // Toujours canonique — voir `canoniser` (hooks/filtreEtiquettes.ts).
      tags?: string[];
      sort?: string;
      viewMode?: "list" | "mosaic";
      domain?: string;
      media?: string;
      createdStart?: string;
      createdEnd?: string;
    }
  // Vue d'une collection PARENTE : ses signets directs, puis une section par
  // sous-collection. Un `kind` à part et non un drapeau sur `list` : la forme
  // des requêtes (N+1), le rendu (sections) et les contrôles diffèrent — sans
  // quoi listQueryArgs, NatureChips et BulkBar devraient partout se demander
  // dans lequel des deux cas ils sont.
  | { kind: "collection"; collectionId: number; label: string }
  | { kind: "cleanup" }
  // `indeterminate` : 401/403/429 — anti-bot ou quota. DOMAINE.md en fait une
  // catégorie à part entière (« vérification manuelle ; JAMAIS classé mort »),
  // et le filtre existait déjà côté sidecar ; il n'avait aucun lecteur.
  | { kind: "cleanupView"; type: "dead" | "redirect" | "indeterminate" | "duplicates" | "untagged" | "empty-collections" | "trash" }
  | { kind: "tags" }
  // Task 9 : la Revue de l'action, construite par BulkBar puis exécutée
  // (Task 15). Items réduits au nécessaire — `collectionId` porte
  // l'origine, que la corbeille Raindrop ne garde pas (spec §4.2).
  // CONTRAT (revue finale) : `collectionId` EST l'origine de restauration
  // (spec §4.2) — il doit atteindre le bulk (champ `origins` de
  // POST /raindrops/bulk, transmis par ReviewPage pour `op: "trash"`) pour
  // que la restauration à l'origine fonctionne ; un item dont le
  // collectionId n'atteint pas le bulk restaurerait en « Tous » en silence.
  // R15P-4 (ex-R4P) : l'action porte ses paramètres — `move` sa destination,
  // `tag` ses étiquettes — la Revue les envoie tels quels au bulk.
  // Task 13 : les deux actions de niveau 2 des vues de traitement — la Revue
  // (T15) exécutera empty-trash / collections/cleanup. `items` reste la forme
  // raindrop : empty-trash passe les items de corbeille chargés (aperçu
  // gratuit), delete-empty-collections une liste vide (une collection n'a pas
  // cette forme — l'action porte le sens).
  | {
      kind: "review";
      // `cache` PRÉSENT quand la vue d'origine le connaît (liste principale),
      // ABSENT quand elle ne le porte pas (liens morts, qui viennent de
      // l'analyse) : la Revue distingue « pas de copie » d'« information
      // inconnue » — spec sélection §4.2.
      items: { id: number; url: string; title: string; collectionId: number; cache?: { status: string; size?: number } | null }[];
      action:
        | { op: "trash" }
        | { op: "move"; toCollectionId: number }
        | { op: "tag"; tags: string[] }
        | { op: "archive" } // copies permanentes → POST /api/backup/archive (spec sélection §4.2)
        | { op: "empty-trash" }
        | { op: "delete-empty-collections" };
      sourceLabel: string;
      // Revue finale : sur les deux actions L2, l'aperçu chargé ne vaut PAS
      // la portée réelle (empty-trash vide TOUTE la corbeille au-delà des
      // pages chargées ; delete-empty-collections n'a pas d'items de cette
      // forme) — la vue d'origine pose ici le VRAI nombre, que le compteur
      // de la Revue affiche. Absent (actions L1) : compteur = items portés.
      totalServer?: number;
      // R15P-3 : la vue d'origine, posée par les constructeurs (BulkBar : la
      // vue list courante ; CleanupView : sa vue cleanupView) — App en déduit
      // le retour après exécution. Absente (vue construite à la main) :
      // repli « Tous ».
      returnView?: View;
    };

// Les filtres/tri/mode portés par la vue list — cible du merge de patchList.
// Un patch ajuste les FILTRES de la liste courante — jamais `kind`,
// `collectionId` ni `label` : changer de collection est une NAVIGATION
// (go), qui a des effets que le patch n'a pas (reset de page, historique).
// « Trop large » corrigé : le type disait l'inverse du contrat.
type ListPatch = Partial<Omit<Extract<View, { kind: "list" }>, "kind" | "collectionId" | "label">>;

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
  | { type: "selectRaindrop"; id: number | null };

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
  /** `null` FERME le volet détail — il ne s'affiche que sur un signet
   *  ouvert, et doit donc pouvoir se refermer. */
  selectRaindrop: (id: number | null) => void;
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
