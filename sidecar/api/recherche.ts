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
 * Assemble la recherche saisie et le filtre de domaine en UN seul terme de
 * recherche. Les guillemets autour de la valeur sont sans effet sur un
 * domaine ordinaire (vérifié : 64 avec et sans) et protègent des espaces
 * qu'une saisie maladroite laisserait passer.
 */
export function composerRecherche(
  search: string | undefined,
  domain: string | undefined,
): string | undefined {
  const dom = domaineRecherche(domain);
  const termes = [search, dom === undefined ? undefined : `domain:"${dom}"`].filter(
    (t): t is string => t !== undefined && t !== "",
  );
  return termes.length === 0 ? undefined : termes.join(" ");
}
