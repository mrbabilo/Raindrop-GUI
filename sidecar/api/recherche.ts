// Composition de la recherche envoyée au MCP — logique pure.
//
// CLAUDE.md §Traps : le paramètre `domain` du pont MCP ne filtre RIEN. Le
// tool le passe en paramètre d'URL (`/raindrops/0?domain=…`), or l'API
// Raindrop n'a pas ce paramètre : elle l'ignore, et rend la bibliothèque
// entière. Le filtrage par domaine n'existe que dans la RECHERCHE, via
// l'opérateur `domain:` — c'est donc là qu'on le compose.
//
// Les termes de recherche s'INTERSECTENT (vérifié en réel le 2026-09-17 :
// `#webdesign` → 1713, `domain:youtube.com` → 64, les deux → 1), ce qui
// rend la composition par simple espace sûre, y compris avec les termes
// que le pont ajoute lui-même derrière (`type:`, `created:`, `notag:`).
//
// L'ÉTIQUETTE se compose de la même façon, et l'intersection est ce qui rend
// le filtre multi-étiquettes possible sans rien calculer chez nous (mesuré en
// réel le 2026-09-19 : `#webdesign` 1713, `#code` 886, les deux 113 ;
// `#webdesign #code #wordpress` → 1). Trois mesures du même jour cadrent la
// composition ci-dessous :
//   • l'opérateur est INSENSIBLE À LA CASSE (`#WEBDESIGN` → 1713) — au
//     contraire de `domain:`, qui rend zéro sur la moindre majuscule ;
//   • les guillemets sont TRANSPARENTS (`#"webdesign"` → 1713, `#"code"` avec
//     lui → 113) : les poser toujours ne coûte rien et protège l'étiquette
//     qui porterait un espace — aucune n'en porte aujourd'hui, un renommage
//     en fabrique une demain ;
//   • il n'y a PAS d'alternative : `OR` n'est pas un opérateur
//     (`#webdesign OR #code` → 60, soit moins que chacun — « OR » est lu
//     comme un mot du texte). L'union de deux étiquettes n'existe pas côté
//     serveur, et l'intersection est la seule sémantique offerte.
// `tag:` n'existe pas non plus (→ 0) ; seul le `#` filtre.

/**
 * Ramène une saisie d'utilisateur à ce que Raindrop stocke réellement :
 * un domaine EXACT, en minuscules, sans schéma ni `www.` ni chemin.
 *
 * L'opérateur ne pardonne rien et ne signale rien — `YouTube.com`,
 * `youtube` ou `www.youtube.com` rendent zéro résultat sans erreur, soit
 * un écran vide que rien n'explique. Normaliser ici est donc la
 * différence entre un champ utilisable et un champ qui ment.
 *
 * Rend `undefined` quand il ne reste rien d'exploitable : un
 * `domain:""` rendrait zéro, là où l'absence de terme ne filtre pas.
 */
export function domaineRecherche(saisie: string | undefined): string | undefined {
  if (saisie === undefined) return undefined;
  const nu = saisie
    .trim()
    .toLowerCase()
    .replace(/"/g, "") // casserait le terme entre guillemets
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "") // schéma
    .replace(/^www\./, "")
    .split("/")[0]! // chemin, requête, ancre
    .trim();
  return nu === "" ? undefined : nu;
}

/**
 * Ramène une liste d'étiquettes aux termes `#"…"` à intersecter.
 *
 * Le dédoublonnage est fait SANS ÉGARD À LA CASSE parce que le filtre l'est
 * (mesuré) : garder `#Code` et `#code` côte à côte n'ajouterait aucun filtre,
 * juste un terme redondant dans la requête — et, côté front, deux clés de
 * cache pour un seul résultat.
 *
 * Le guillemet interne est RETIRÉ plutôt qu'échappé : il fermerait le terme
 * en cours et ferait lire la suite comme du texte libre, c'est-à-dire un
 * filtre silencieusement autre que celui demandé. Une étiquette ne peut pas
 * en contenir sans que quelqu'un l'y ait mis à la main.
 */
export function etiquettesRecherche(tags: readonly string[] | undefined): string[] {
  const vues = new Set<string>();
  const out: string[] = [];
  for (const brut of tags ?? []) {
    const nom = brut.replace(/"/g, "").trim();
    if (nom === "") continue;
    const cle = nom.toLowerCase();
    if (vues.has(cle)) continue;
    vues.add(cle);
    out.push(`#"${nom}"`);
  }
  return out;
}

/**
 * Assemble la recherche saisie, le filtre de domaine et les étiquettes
 * retenues en UN seul terme de recherche. Les guillemets autour de la valeur
 * sont sans effet sur un domaine ordinaire (vérifié : 64 avec et sans) et
 * protègent des espaces qu'une saisie maladroite laisserait passer.
 */
export function composerRecherche(
  search: string | undefined,
  domain: string | undefined,
  tags?: readonly string[],
  media?: string,
): string | undefined {
  const dom = domaineRecherche(domain);
  const termes = [
    search,
    dom === undefined ? undefined : `domain:"${dom}"`,
    ...etiquettesRecherche(tags),
    // La nature (spec puces §11) : l'API n'a pas de paramètre `media` — le
    // filtre n'existe que comme opérateur `type:` de la recherche, exactement
    // comme `domain:` (le paramètre mort du pont faisait flotter le filtre).
    media === undefined ? undefined : `type:${media}`,
  ].filter((t): t is string => t !== undefined && t !== "");
  return termes.length === 0 ? undefined : termes.join(" ");
}
