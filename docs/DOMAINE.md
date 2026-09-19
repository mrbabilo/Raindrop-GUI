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
  catégories. **Un titre d'interstitiel ne groupe jamais** (règle du
  2026-09-19) : « Weiterleitungshinweis », « Redirect Notice », « Just a
  moment »… sont des titres de redirection forcée, pas des titres de page —
  mesuré ce jour, 163 des 551 signets flous réels étaient groupés par ce seul
  mot à travers des pages sans rapport. La règle vit à la fois dans
  `findDuplicates` (scans futurs) et dans le filtre de lecture de la route
  (caches anciens, sans re-scan).
- **Lien mort (dead)** : 4xx/5xx, DNS inexistant, timeout, connexion refusée.
- **Redirection** : chaîne 3xx vers une URL finale 2xx. `redirectKind` :
  `permanent` (301/308) ou `temporary` (302/307). « Remplacer par l'URL
  finale » est l'action de correction — REST direct, car `update_raindrop`
  n'expose pas `url`.
- **Indéterminé** : 401/403/429 (anti-bot, rate-limit) → vérification
  manuelle ; jamais classé « mort ». **A son compteur et sa vue** (« À vérifier
  à la main ») depuis le 2026-09-19 : la catégorie existait dans le code et
  dans ce document, mais rien à l'écran ne la montrait — ces liens étaient donc
  invisibles, ni morts ni sains.
- **Un diagnostic appartient à un SIGNET, pas à une URL.** Le cache de
  vérification, lui, est bien indexé par URL — une URL ne se vérifie qu'une
  fois, et c'est ce qui rend l'analyse tenable. Mais la lecture doit
  redistribuer ce verdict à **tous** les signets qui portent cette adresse.
  Mesuré le 2026-09-19 sur la bibliothèque réelle : **430 signets partagent une
  URL au caractère près**, soit jusqu'à **242 signets morts invisibles** —
  l'utilisateur réparait celui qu'on lui montrait, les autres restaient morts
  sans que rien ne le signale jamais.
- **« Jamais analysé » n'est pas « rien à nettoyer ».** Un compteur dont
  l'analyse n'a pas tourné ne vaut pas zéro : il ne vaut rien. « 0 lien mort »
  se lit « bibliothèque saine » alors que personne n'a regardé — et une vue
  vide disait « Rien ici », c'est-à-dire « il n'y a plus rien à réparer ». Les
  compteurs qui dépendent d'une analyse affichent « jamais analysé », et les
  vues portent l'action qui corrige le manque.
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
