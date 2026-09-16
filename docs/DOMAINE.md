# DOMAINE — le vocabulaire de Raindrop-GUI

Ce que le code ne dit pas. À lire avant de toucher au nettoyage, aux vues ou
à l'API locale.

## Objets Raindrop

- **Raindrop** (bookmark) : l'item de base. Le sidecar le renvoie
  **normalisé** au front : `url` (l'API brute dit `link`), `collectionId`
  (l'API brute dit `collection: {$id}`), `lastUpdate` (brute : `last_update`).
  Le front ne voit jamais le format brut.
- **Collection** : dossier de bookmarks. Racines (« root ») vs enfants
  (imbriqués, `parentId`). Identifiants spéciaux : `0` = tous, `-1` = non
  classés, `-99` = **corbeille**.
- **Tag** : étiquette. Format brut API `{_id, count}` ; le front ne voit que
  `{name, count}`.
- **Highlight** : extrait surligné d'une page. Lecture seule en Phase 1.
- **Nature du contenu** : ce qu'un raindrop *est* — `link`, `article`, `image`,
  `video`, `document`, `audio`. Une seule valeur à la fois, **calculée par
  Raindrop, jamais corrigée par nous** : on la filtre, on ne l'édite pas.
  Libellés d'interface : *Liens*, *Articles*, *Images*, *Vidéos*, *Documents*,
  *Audio*. Rendue par un glyphe monochrome (DESIGN.md §2.1), filtrée par les
  puces de la barre de recherche (§11).

  > ⚠️ **Le mot d'interface et l'identifiant de code divergent, exprès.** Côté
  > utilisateur : « nature ». Côté code : le champ reste **`media`** partout —
  > `view.media` (appState), `RaindropQuery.media`, `?media=` vers le sidecar —
  > parce que c'est le nom du paramètre de l'API locale et que le renommer
  > casserait le contrat pour rien. Ne pas « harmoniser ». L'ancien libellé
  > « Type de média » est abandonné.
- **Corbeille** : supprimer = déplacer en corbeille (`delete_raindrop`). Seul
  `empty_trash` (niveau 2 de la Revue) est irréversible.

## Analyse locale (nettoyage) — calculée par le sidecar, jamais par Raindrop

- **Snapshot** : copie paginée de la bibliothèque (50/requête,
  `collection_id: 0`, hors corbeille) sur laquelle tout est calculé.
- **Doublon exact** : même URL au caractère près.
- **Doublon normalisé** : même URL après normalisation (http→https, sans
  fragment ni slash final, paramètres de tracking retirés, paramètres restants
  triés).
- **Doublon flou (fuzzy)** : même domaine + titre égal à casse, accents et
  ponctuation près. Présenté séparément, jamais fusionné avec les deux autres
  catégories.
- **Lien mort (dead)** : 4xx/5xx, DNS inexistant, timeout, connexion refusée.
- **Redirection** : chaîne 3xx vers une URL finale 2xx. `redirectKind` :
  `permanent` (301/308) ou `temporary` (302/307). « Remplacer par l'URL
  finale » est l'action de correction — REST direct, car `update_raindrop`
  n'expose pas `url`.
- **Indéterminé** : 401/403/429 (anti-bot, rate-limit) → vérification
  manuelle ; jamais classé « mort ».
- **TTL** : fraîcheur d'un résultat de scan (30 j par défaut) ; les re-scans
  incrémentaux ne revérifient que le nouveau, le modifié ou l'expiré.
- **`library_audit` et filtres serveur `broken`/`duplicates` : interdits** —
  l'analyse est locale (exigence utilisateur, spec §5.1).

## Revue de l'action (confirmation des opérations en masse)

- **Niveau 1 — réversible** (corbeille, déplacer, retag, fusion de tags) :
  case « Je confirme l'action sur N items » obligatoire avant exécution.
- **Niveau 2 — irréversible** (vider la corbeille, supprimer des
  collections) : frappe obligatoire du mot « SUPPRIMER ».
- L'aperçu **est** l'annulation : Raindrop n'offre pas d'undo API pour les
  déplacements/tags ; la liste complète désélectionnable item par item est la
  seule protection.
