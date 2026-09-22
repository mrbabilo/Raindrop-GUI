import { canoniser } from "../hooks/filtreEtiquettes";
import type { SmartList, SmartListView } from "../../shared/types";
import type { View } from "../state/appState";

type ListView = Extract<View, { kind: "list" }>;

/** Au moins un filtre actif ? (spec §4 : le geste « Sauvegarder la vue »
 *  n'existe qu'ici.) Le TRI seul ne compte pas — « Tous triés par titre »
 *  n'est pas une smart list — mais il voyage avec la vue stockée. `viewMode`
 *  non plus : un affichage n'est pas un filtre. */
export function filtreActif(view: View): boolean {
  return (
    view.kind === "list" &&
    (view.notag === true ||
      (view.search !== undefined && view.search.trim() !== "") ||
      (view.tags?.length ?? 0) > 0 ||
      view.domain !== undefined ||
      view.createdStart !== undefined ||
      view.createdEnd !== undefined ||
      view.media !== undefined)
  );
}

/** La vue courante en forme sérialisable : seuls les champs DÉFINIS partent
 *  (JSON n'a pas de undefined), les étiquettes canonisées — la clé de cache
 *  de useRaindrops hache la liste entière : deux formes d'un même filtre
 *  feraient deux entrées de cache (trap 2026-09-19). */
export function serialiserVue(view: ListView): SmartListView {
  return {
    collectionId: view.collectionId,
    ...(view.notag === true ? { notag: true } : {}),
    ...(view.search !== undefined && view.search.trim() !== "" ? { search: view.search } : {}),
    ...(view.tags !== undefined && view.tags.length > 0 ? { tags: canoniser(view.tags) } : {}),
    ...(view.sort !== undefined ? { sort: view.sort } : {}),
    ...(view.domain !== undefined ? { domain: view.domain } : {}),
    ...(view.media !== undefined ? { media: view.media } : {}),
    ...(view.createdStart !== undefined ? { createdStart: view.createdStart } : {}),
    ...(view.createdEnd !== undefined ? { createdEnd: view.createdEnd } : {}),
  };
}

/** La vue stockée rejetée telle quelle dans le View par le clic de la barre
 *  latérale — `listQueryArgs` fait le reste : c'est lui, notre parser (spec
 *  §3). Re-canonisation défensive des étiquettes : le JSON est écrit par
 *  nous, mais la clé de cache exige la forme canonique. */
export function vueVersView(sl: SmartList): View {
  const v = sl.vue;
  return {
    kind: "list",
    collectionId: v.collectionId,
    label: sl.label,
    smartlistId: sl.id,
    ...(v.notag === true ? { notag: true } : {}),
    ...(v.search !== undefined ? { search: v.search } : {}),
    ...(v.tags !== undefined && v.tags.length > 0 ? { tags: canoniser(v.tags) } : {}),
    ...(v.sort !== undefined ? { sort: v.sort } : {}),
    ...(v.domain !== undefined ? { domain: v.domain } : {}),
    ...(v.media !== undefined ? { media: v.media } : {}),
    ...(v.createdStart !== undefined ? { createdStart: v.createdStart } : {}),
    ...(v.createdEnd !== undefined ? { createdEnd: v.createdEnd } : {}),
  };
}
