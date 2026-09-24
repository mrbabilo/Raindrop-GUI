import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import { t } from "../i18n/fr";
import { ecrireAffichage, lireAffichage, type Affichage } from "../lib/affichage";

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
      // Smart list ouverte (spec 2026-09-22) : l'identifiant PORTE la
      // surlignage de la barre latérale — jamais une heuristique de label.
      // Le reducer l'efface à tout patch de filtre (la vue diverge, l'entrée
      // n'est plus « la » smart list) et à forgetSmartList (vue supprimée).
      smartlistId?: string;
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
  // (T15) exécute empty-trash par sa mutation dédiée. `items` reste la forme
  // raindrop : empty-trash passe les items de corbeille chargés (aperçu
  // gratuit), delete-empty-collections une liste vide (une collection n'a pas
  // cette forme — l'action porte le sens).
  | {
      kind: "review";
      // `cache` PRÉSENT quand la vue d'origine le connaît (liste principale),
      // ABSENT quand elle ne le porte pas (liens morts, qui viennent de
      // l'analyse) : la Revue distingue « pas de copie » d'« information
      // inconnue » — spec sélection §4.2.
      items: { id: number; url: string; title: string; collectionId: number; cache?: { status: string; size?: number } | null;
        /** Doublons : le gardé DU GROUPE de cette copie — ses étiquettes
         *  remontent chez lui avant la corbeille (demande utilisateur du
         *  2026-09-19). Présent seulement pour `op: "dedupe"`. */
        dedupeGarde?: { id: number; title: string }; }[];
      action:
        | { op: "trash" }
        | { op: "move"; toCollectionId: number }
        | { op: "tag"; tags: string[] }
        | { op: "archive" } // copies permanentes → POST /api/backup/archive (spec sélection §4.2)
        | { op: "dedupe" } // doublons : étiquettes des copies → gardé, puis corbeille
        | { op: "empty-trash" }
        // Suppression de masse des collections vides : les ids viennent de
        // triPourSuppression — DÉJÀ ORDONNÉS des feuilles vers la racine, la
        // Revue les exécute tels quels (jamais le cleanup GLOBAL de Raindrop,
        // dont la définition du « vide » n'est pas la nôtre).
        | { op: "delete-empty-collections"; ids: number[] }
        // Suppression INDIVIDUELLE d'une collection vide (CleanupRows) :
        // irréversible (DOMAINE.md niveau 2), elle emprunte la même Revue
        // que la masse — R15P-4 : l'action porte ses ids.
        | { op: "delete-collections"; ids: number[] };
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
    }
  // La LECTURE du contenu archivé (spec lecture §3, inversion 2026-09-22) :
  // ouverte par le clic de bibliothèque ou par « Lire » de la fiche, la
  // fiche l'accompagne en colonne. `sourceCopie` : le texte vient d'une
  // copie permanente téléchargée À LA VOLÉE (badge de la ligne de tête) ;
  // absent = l'archive locale était déjà là. `returnView`, même règle que
  // la Revue : l'aller ne prouve rien sans le retour.
  | { kind: "lecture"; raindropId: number; label: string; sourceCopie?: boolean; returnView?: View };

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
  /** Mode et tri PRÉFÉRÉS : ils suivent la navigation (lib/affichage.ts). */
  affichage: Affichage;
  selectedIds: Set<number>;
  selectedRaindropId: number | null;
}
type Action =
  | { type: "go"; view: View }
  | { type: "patch"; patch: ListPatch }
  | { type: "forgetSmartList"; id: string }
  | { type: "toggleSelect"; id: number }
  | { type: "selectMany"; ids: number[] }
  | { type: "clearSelection" }
  | { type: "selectRaindrop"; id: number | null };

const initial: State = {
  view: { kind: "list", collectionId: 0, label: t("nav.all") },
  affichage: {},
  selectedIds: new Set<number>(),
  selectedRaindropId: null,
};
/** Une liste qui ne précise ni mode ni tri prend les préférés — une vue
 *  sauvegardée qui porte son tri le garde. */
function avecAffichage(view: View, affichage: Affichage): View {
  if (view.kind !== "list") return view;
  return {
    ...view,
    ...(view.viewMode === undefined && affichage.viewMode !== undefined ? { viewMode: affichage.viewMode } : {}),
    ...(view.sort === undefined && affichage.sort !== undefined ? { sort: affichage.sort } : {}),
  };
}

function reducer(s: State, a: Action): State {
  if (a.type === "go") return { ...s, view: avecAffichage(a.view, s.affichage) };
  if (a.type === "patch" && s.view.kind === "list") {
    // Changer de mode ou de tri, c'est aussi dire sa PRÉFÉRENCE.
    const affichage = {
      ...s.affichage,
      ...(a.patch.viewMode !== undefined ? { viewMode: a.patch.viewMode } : {}),
      ...(a.patch.sort !== undefined ? { sort: a.patch.sort } : {}),
    };
    s = { ...s, affichage };
    // La bascule d'affichage n'est pas un filtre : la vue reste la smart
    // list (spec §5 — la marque ne survit qu'à viewMode).
    const filtreBouge = Object.keys(a.patch).some((k) => k !== "viewMode");
    return { ...s, view: { ...s.view, ...a.patch, ...(filtreBouge ? { smartlistId: undefined } : {}) } };
  }
  if (a.type === "forgetSmartList" && s.view.kind === "list" && s.view.smartlistId === a.id) {
    // La smart list ouverte a été supprimée : la liste filtrée reste —
    // ce sont des filtres, pas un fichier (spec §5).
    return { ...s, view: { ...s.view, smartlistId: undefined } };
  }
  if (a.type === "toggleSelect") {
    const selectedIds = new Set(s.selectedIds); // copie : l'immutabilité fait le re-rendu
    if (selectedIds.has(a.id)) selectedIds.delete(a.id);
    else selectedIds.add(a.id);
    return { ...s, selectedIds };
  }
  if (a.type === "selectMany") return { ...s, selectedIds: new Set([...s.selectedIds, ...a.ids]) };
  if (a.type === "clearSelection") return { ...s, selectedIds: new Set<number>() };
  if (a.type === "selectRaindrop") return { ...s, selectedRaindropId: a.id };
  return s;
}

/** La vue de retour — Revue ET Lecture, une seule règle (spec lecture §3 :
 *  « même règle que la Revue ») : la vue d'origine notée, sinon « Tous ».
 *  Testée par le comportement des deux vues ; une seule définition. */
export function vueDeRetour(v: View): View {
  return (v.kind === "review" || v.kind === "lecture") && v.returnView
    ? v.returnView
    : { kind: "list", collectionId: 0, label: t("nav.all") };
}

// Hors provider, toutes les actions sont des no-op volontaires : les tests
// rendent App nu.
const Ctx = createContext<{
  view: View;
  go: (v: View) => void;
  patchList: (p: ListPatch) => void;
  /** Efface la marque de smart list de la vue ouverte si c'est celle-ci —
   *  appelé à la suppression de la vue (Task 7) ; no-op sinon. */
  forgetSmartList: (id: string) => void;
  selectedIds: Set<number>;
  toggleSelect: (id: number) => void;
  /** AJOUTE ces signets à la sélection (Maj-clic, « Tout sélectionner »). */
  selectMany: (ids: number[]) => void;
  clearSelection: () => void;
  selectedRaindropId: number | null;
  /** `null` FERME le volet détail — il ne s'affiche que sur un signet
   *  ouvert, et doit donc pouvoir se refermer. */
  selectRaindrop: (id: number | null) => void;
}>({
  view: initial.view,
  go: () => undefined,
  patchList: () => undefined,
  forgetSmartList: () => undefined,
  selectedIds: new Set<number>(),
  toggleSelect: () => undefined,
  selectMany: () => undefined,
  clearSelection: () => undefined,
  selectedRaindropId: null,
  selectRaindrop: () => undefined,
});

export function AppStateProvider({ children }: { children: ReactNode }) {
  // Au lancement, la première vue prend les préférences retenues.
  const [state, dispatch] = useReducer(reducer, initial, (i) => {
    const affichage = lireAffichage();
    return { ...i, affichage, view: avecAffichage(i.view, affichage) };
  });
  // Retenues d'une session à l'autre — hors du reducer, qui reste pur.
  useEffect(() => ecrireAffichage(state.affichage), [state.affichage]);
  return (
    <Ctx.Provider
      value={{
        view: state.view,
        go: (view) => dispatch({ type: "go", view }),
        patchList: (patch) => dispatch({ type: "patch", patch }),
        forgetSmartList: (id) => dispatch({ type: "forgetSmartList", id }),
        selectedIds: state.selectedIds,
        toggleSelect: (id) => dispatch({ type: "toggleSelect", id }),
        selectMany: (ids) => dispatch({ type: "selectMany", ids }),
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
