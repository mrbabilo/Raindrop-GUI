import { t } from "../i18n/fr";
import { useAppState, type View } from "../state/appState";

/**
 * Le filtre par étiquettes : une liste retenue, intersectée côté serveur.
 *
 * Partagé par TOUS les points qui posent une étiquette (ligne de liste, fiche,
 * vue Collection, vue Tags, barre latérale, palette ⌘K) : la sémantique d'un
 * clic sur une pilule ne doit pas dépendre de l'endroit où on l'a cliquée —
 * c'est exactement le grief qui avait fait rendre toutes les pilules
 * cliquables.
 */

/**
 * La forme CANONIQUE d'une liste d'étiquettes : rognée, sans vide, sans
 * doublon de casse, triée.
 *
 * Le tri n'est pas cosmétique. La clé de cache de `useRaindrops` est l'objet
 * de requête entier : sans ordre stable, `["a","b"]` et `["b","a"]` sont deux
 * entrées de cache pour un seul et même résultat — deux requêtes, deux
 * balayages de la file à 550 ms, pour rien.
 *
 * Le dédoublonnage ignore la casse parce que le filtre l'ignore (mesuré :
 * `#WEBDESIGN` rend exactement autant que `#webdesign`).
 */
export function canoniser(tags: readonly string[] | undefined): string[] {
  const vues = new Set<string>();
  const out: string[] = [];
  for (const brut of tags ?? []) {
    const nom = brut.trim();
    if (nom === "") continue;
    const cle = nom.toLowerCase();
    if (vues.has(cle)) continue;
    vues.add(cle);
    out.push(nom);
  }
  return out.sort((a, b) => a.localeCompare(b, "fr"));
}

/** Présente ? On la retire. Absente ? On l'ajoute. La comparaison ignore la
 *  casse, sinon `#Code` ne retirerait pas `#code` — et le second clic sur la
 *  pilule, au lieu de défaire le premier, poserait un doublon inerte. */
export function basculer(tags: readonly string[] | undefined, nom: string): string[] {
  const cle = nom.trim().toLowerCase();
  const actuelles = canoniser(tags);
  return actuelles.some((n) => n.toLowerCase() === cle)
    ? actuelles.filter((n) => n.toLowerCase() !== cle)
    : canoniser([...actuelles, nom]);
}

/** Les étiquettes retenues par une vue — vide partout ailleurs que sur une
 *  liste, qui est la seule à porter des filtres. */
export function etiquettesDe(view: View): string[] {
  return view.kind === "list" ? (view.tags ?? []) : [];
}

export function useFiltreEtiquettes() {
  const { view, go, patchList } = useAppState();
  const actives = etiquettesDe(view);

  /**
   * `patchList` est un NO-OP hors vue liste (le reducer le garde
   * explicitement) : la fiche pouvant être ouverte au-dessus du Nettoyage ou
   * de la vue Tags, s'en contenter rendrait la pilule morte précisément là où
   * rien ne l'annoncerait. On navigue alors vers « Tous », filtré sur elle.
   */
  const bascule = (nom: string) => {
    if (view.kind === "list") patchList({ tags: basculer(view.tags, nom) });
    else go({ kind: "list", collectionId: 0, label: t("nav.all"), tags: canoniser([nom]) });
  };

  return {
    actives,
    bascule,
    estActive: (nom: string) => actives.some((n) => n.toLowerCase() === nom.trim().toLowerCase()),
    // MÊME garde que `bascule`, pour la même raison : `patchList` est muet
    // hors vue liste. Le retrait n'est pas atteignable là aujourd'hui (la
    // rangée ne s'affiche que s'il y a des étiquettes, et il n'y en a que sur
    // une liste) — mais une commande câblée ailleurs demain hériterait d'un
    // silence, alors que la ligne au-dessus explique justement pourquoi on ne
    // s'en contente pas.
    vider: () => {
      if (view.kind === "list") patchList({ tags: [] });
      else go({ kind: "list", collectionId: 0, label: t("nav.all") });
    },
  };
}

/** Une vue « Tous » filtrée sur UNE étiquette : ce que produisent les points
 *  de NAVIGATION (barre latérale, palette, nom dans la vue Tags), qui ouvrent
 *  un écran neuf au lieu d'ajuster le filtre courant. */
export function vueEtiquette(noms: readonly string[]): View {
  const tags = canoniser(noms);
  return { kind: "list", collectionId: 0, label: tags.map((n) => `#${n}`).join(" ") || t("nav.all"), tags };
}
