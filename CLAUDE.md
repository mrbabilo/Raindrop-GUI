# CLAUDE.md — Raindrop-GUI

Conventions partagées pour ce dépôt. Les *procédures* détaillées vivent dans la
spec et les plans (`docs/superpowers/`) ; ce fichier n'en est que la carte.

## Projet

- **Raindrop-GUI** — GUI desktop macOS pour un compte Raindrop.io Pro
  (> 5 000 bookmarks) : navigation enrichie + nettoyage de bibliothèque
  (liens morts, doublons, redirections, non-taggés).
- **Tauri 2** (shell minimal) + **sidecar Node/TypeScript** qui pilote
  Raindrop.io via le serveur MCP `@kud/mcp-raindrop-io` épinglé, exposé au
  webview en API REST locale (127.0.0.1, auth Bearer éphémère).
- **Périmètre verrouillé Phase 1** : pas d'IA (Stella/LLM → Phase 2, spec §12),
  highlights en lecture seule, Raindrop reste la seule source de vérité.
- Interface **en français**, textes externalisés (pas d'i18n, un seul fichier).

**Avant de toucher au nettoyage, aux vues ou à l'API locale : lire
`docs/DOMAINE.md`** (vocabulaire métier), **`docs/DESIGN.md`** (apparence) et la **spec**
(`docs/superpowers/specs/2026-09-15-raindrop-gui-design.md`), qui fait foi sur
les décisions structurantes.

## Sources à consulter

- `docs/superpowers/specs/2026-09-15-raindrop-gui-design.md` — la spec. Les
  corrections contraignantes (§3) l'emportent sur toute implémentation.
- `docs/superpowers/plans/` — plans d'implémentation (3 plans séquentiels :
  sidecar → front React → shell Tauri). Chaque plan est autosuffisant.
- `docs/DOMAINE.md` — vocabulaire métier Raindrop + catégories d'analyse.
- `docs/DESIGN.md` — **la direction visuelle : fait foi sur l'apparence.** À
  lire avant de dessiner le moindre composant du front (symbolique des
  couleurs, signalétique de collection, états, densités, règles).
- `docs/SOURCES.md` — la carte de tout ce qui vit **hors** du dépôt (MCP kud
  épinglé — **archivé upstream**, son candidat de reprise évalué spec §10.1,
  API Raindrop, SDK/hono/zod). Registre des sources :
  `tools/sources_registry.py` (données) ; veille par
  `python3 tools/check_sources.py` (`--report` / `--update` / `--offline`,
  baseline `.sources-baseline.json`) — changelogs et bugs corrigés en amont.
- `docs/ROADMAP.md` — ce qu'il reste à faire. ⚠️ Vérifier `git log` avant de
  croire une case « à faire ».

## Build & test

- **Node ≥ 20 requis** (vérifié par le sidecar au démarrage).
- **Tests** : `npm test` (Vitest ; fake MCP in-process, réseau local simulé
  uniquement). Intégration réelle, opt-in : `RAINDROP_TEST_TOKEN=<token> npm test`.
- **Typecheck** : `npm run typecheck`. **Build sidecar** : `npm run build:sidecar`.
- **Dev sidecar** : `./scripts/dev-sidecar.sh` — lit le token Raindrop du
  **trousseau macOS** (service `raindrop-api-token`), jamais en clair.
  Enregistrement (une fois) :
  `security add-generic-password -s "raindrop-api-token" -a "$USER" -U -w`
- Aucun test n'appelle l'API Raindrop hors des tests d'intégration explicites
  (gardés par variable d'environnement, skippés sinon).

## Conventions de code

- **Taille des fichiers : lisibles et testables.** Cible **≤ 300 lignes** par
  fichier de code (tests compris), plafond dur **400** — comme le cliquet de
  StarHubTH. Un fichier qui déborde se découpe selon ses frontières
  naturelles (une responsabilité par fichier) ou se signale, il ne grossit
  pas « en attendant ».
- Une responsabilité par fichier ; les tests cohabitent avec le code qu'ils
  couvrent (`*.test.ts` voisin), un fichier de test par unité testée.

## Contraintes architecturales (non négociables, spec §3)

- `@kud/mcp-raindrop-io` **épinglé à 1.3.1** dans `package.json` — jamais de
  `npx @latest` au runtime ; spawn direct de
  `node_modules/@kud/mcp-raindrop-io/dist/index.js`.
- Le front ne connaît **que** l'API REST locale du sidecar ; aucun code MCP
  côté front. Tout tool est isolé derrière une fonction typée avec timeout par
  appel (le rebranchement direct sur l'API Raindrop ne touche pas le front).
- Analyse de nettoyage **locale au sidecar** : le tool `library_audit` et les
  filtres serveur `broken`/`duplicates` **ne sont pas utilisés** (spec §5.1).
- Sidecar bindé **127.0.0.1 uniquement**, port 0 ; token Bearer local généré
  par Tauri, jamais écrit en clair sur disque ; le token Raindrop ne transite
  jamais par HTTP ni n'apparaît dans le front.
- Toute suppression passe par la **corbeille Raindrop** ; seul le vidage de la
  corbeille est définitif (page Revue de l'action, frappe « SUPPRIMER » —
  front, plan 2).

## Traps — pièges déjà établis

- **`update_raindrop` n'expose pas `url`** (v1.3.1, vérifié dans le code
  compilé) : la correction d'URL des redirections passe par un appel REST
  direct (`sidecar/direct/raindropRest.ts`).
- **Le 429 est indétectable via MCP** : `raindropFetch` aplatit toute erreur
  HTTP en `Error: failed to …`. Rate limiting **proactif** uniquement — file
  séquentielle espacée de 550 ms (≈ 109 req/min < 120), retry réseau sur les
  lectures seulement, jamais sur les écritures. **Borne (relu 2026-09-16)** :
  l'API *expose* `X-RateLimit-Limit/Remaining/Reset` — lisibles seulement par
  `sidecar/direct/raindropRest.ts`, jamais à travers le MCP. Ne pas s'en servir
  pour desserrer la file : elle est partagée avec les appels MCP, qui restent
  aveugles. (La doc s'auto-contredit : tableau `RateLimit-Remaining`, exemple
  429 `X-RateLimit-Remaining` — lire les deux.)
- **Une erreur tool MCP est un TEXTE préfixé `Error: `**, pas un flag
  `isError` — parser le premier bloc de contenu, ne jamais se fier au statut.
- **Pagination : 50 items max par requête** (création en masse : **100**
  objets max) ; corbeille = collection `-99`, Tous = `0`, non classés = `-1`.
- **Imports relatifs avec extension `.js`** (moduleResolution nodenext) —
  sinon le build `tsc` est cassé au runtime.
- **Tags au format brut** : l'API renvoie `{_id, count}` → normaliser en
  `{name, count}` côté sidecar ; le front ne voit jamais le format brut.
- **`POST /raindrops/unrestore` N'EXISTE PAS** — 404 vérifié en réel le
  2026-09-16 (contrôle négatif : une route inventée répond pareil, les routes
  documentées répondent 200). `sidecar/direct/raindropRest.ts` l'appelle
  pourtant : **ce code ne peut pas marcher en production**, son test ne vérifie
  que l'URL sur un `fetch` mocké. Seule voie :
  `PUT /raindrops/-99 {ids, collection:{"$id": N}}` — **une destination est
  obligatoire**. Et la corbeille **ne garde pas l'origine** (vérifié : à la mise
  en corbeille `collectionId` → `-99`, `removed` → `true`, rien d'autre) :
  restaurer « à l'origine » suppose que **nous** ayons noté la collection
  d'avant (spec §4.2).
- **Le paramètre `domain` du MCP ne filtre RIEN** — ne jamais le lui passer
  (vérifié en réel le 2026-09-17) : `searchRaindrops` l'envoie en paramètre
  d'URL (`/raindrops/0?domain=…`), or l'API Raindrop n'a pas ce paramètre,
  elle l'ignore. Sonde : 12 210 items avec comme sans. Le filtrage par
  domaine n'existe que dans la **recherche**, et l'opérateur **ne pardonne
  rien** : `domain:youtube.com` → 64, mais `domain:youtube` → 0,
  `domain:YouTube.com` → 0 (casse), `domain:"www.youtube.com"` → 0 — zéro
  **sans erreur**, soit un écran vide inexplicable. Les guillemets sont
  sans effet (64 avec comme sans) et protègent des espaces. Les termes
  s'**intersectent** : `#webdesign` 1713 + `domain:youtube.com` 64 → 1.
  `link:` (76) est plus large — il lit l'URL entière ; `site:` n'existe pas
  (0). **Corrigé** dans `sidecar/api/recherche.ts` (normalisation de la
  saisie puis composition dans `search`) ; le paramètre mort est retiré des
  arguments du tool.
- **`cache` et `broken` arrivent dans la réponse de liste** (vérifié le
  2026-09-16) : la copie permanente Pro (`cache.status === "ready"`) et le
  verdict serveur sont **gratuits** dans le snapshot, sans requête par item.
- **Ne jamais commiter** : `MCP_RAINDROPIO_TOKEN`, `RAINDROP_TEST_TOKEN`,
  lockfile `sidecar.json`, `analysis.json` — tout vit dans app-data ou le
  trousseau, hors du dépôt.

## Traps Tauri — plan 3 (2026-09-17)

- **Une commande Tauri `pub fn` (non `async`) tourne sur le thread
  principal** — prouvé dans les sources : `tauri-macros` (`body_blocking`)
  l'appelle en ligne, et le délégué wry est invoqué par WebKit sur le main
  thread, sans relais. Un appel bloquant gèle la fenêtre. Toujours
  `async fn` + `tauri::async_runtime::spawn_blocking`, et `State<'_, T>`
  n'étant pas `Send`, récupérer l'état via `AppHandle` **dans** la closure.
- **`resource_dir()` rend `UnknownPath` hors LaunchServices** (lancement
  direct du binaire depuis un Terminal) : repli sur la dérivation depuis
  `std::env::current_exe()` (`Contents/MacOS/<bin>` →
  `Contents/Resources/<r>`), jamais de `.expect()`.
- **SIGTERM ne passe pas par `RunEvent::Exit`** — tao ne pose pas de
  handler : le processus meurt sans exécuter l'arrêt (sidecar orphelin).
  Handler `libc::signal` réduit à un store atomique (NI verrou NI
  allocation NI panique dedans), fil observateur qui rejoue le même arrêt
  que ⌘Q. ⌘Q, lui, passe bien par `RunEvent::Exit`.
- **`std::process::Child` n'a pas de `Drop`** : remplacer un enfant sans
  `arreter()` + `wait()` fabrique un zombie que `kill -0` voit vivant.
- **Le webview `tauri://localhost` PEUT joindre `http://127.0.0.1:<port>`**
  (mesuré, 200) — mais un `tauri dev` ordinaire n'exerce JAMAIS ce chemin :
  il sert le front depuis Vite (`http://localhost:5173`). Pour l'origine
  réelle en dev : retirer `devUrl` du conf **ET** `--no-dev-server` — les
  deux, l'un sans l'autre ne suffit pas.
- **Une app lancée du Finder/launchd n'a pas `node` dans son PATH** (mesuré :
  `/usr/gnu/bin:/usr/local/bin:/bin:/usr/bin:.` contre
  `/opt/homebrew/bin/node`) — sonder le PATH hérité puis les candidats
  connus. Et `USER` peut être absent → repli sur le nom du dossier HOME.
- **`window.__TAURI__` n'existe pas par défaut** (Tauri 2 :
  `withGlobalTauri: false`) — soit l'activer temporairement pour une sonde,
  soit importer de `@tauri-apps/api`.
- **`beforeDevCommand` voit `TAURI_ENV_PLATFORM`** : couper le proxy Vite
  sous cette variable (`vite.config.ts`), sinon `tauri dev` se bloque 10 s
  sur un lockfile que le shell Rust n'a pas encore écrit.
- **Tarballs nodejs.org : le préfixe des membres INCLUT la plateforme**
  (`node-v22.23.0-darwin-arm64/bin/node`, pas `node-v22.23.0/…`) et bsdtar
  exige **`-C <dir>` AVANT le membre** — après, il lit `-C` comme un nom de
  membre. Vérifier SHASUMS256 **avant** extraction (`sha2`, pas `shasum`
  qui dépend du CLT).
- **Cycle de vie sidecar sous Tauri** : un sidecar survivant est TERMINÉ,
  pas réutilisé (le token local régénéré le ferait répondre 401 partout) ;
  effacer le lockfile avant `attendre_port` (sinon le port du mort est lu
  comme neuf) ; attendre `mcp: "connected"` (sonde `/api/health`, curl
  système, token en header — jamais en URL/argv de log) avant de rendre
  « prêt » au webview.
- **Le binaire du bundle porte le nom du crate** (`raindrop-gui`), pas le
  `productName` ; les ressources atterrissent sous
  `Contents/Resources/ressources/` (conf : `bundle.resources:
  ["ressources/**/*"]`, assemblées par `scripts/preparer-ressources.sh`).
- **Signature ad-hoc** : Gatekeeper met en quarantaine au premier lancement
  (`xattr -dr com.apple.quarantine`), et macOS redemande l'accès trousseau
  à CHAQUE rebuild (nouvelle signature) — le dialogue peut surgir derrière
  la fenêtre. Un test réel du trousseau doit sauver le token en mémoire
  avec restauration par `trap`, et l'absence de token rend `Ok(None)`
  (état normal du premier lancement), jamais une erreur.
- **Cliquets et écrans** : le cliquet de `scripts/build_app.py` exclut les
  tests front du compte (dette : `raindrops.test.ts` 430 lignes, à
  découper — entrée ROADMAP) ; tout écran d'amorçage doit avoir une ISSUE
  (« Réessayer » passe par une commande qui REJOUE la séquence — relire
  l'état mémorisé rendrait la même panne à jamais ; « Saisir un autre
  jeton » sinon un jeton refusé enferme, il est déjà au trousseau).

## Traps sauvegarde — lot 2026-09-18

- **Le tri `created` ascendant ne protège que des CRÉATIONS.** Une création
  porte `created = maintenant` et se range en fin : elle ne décale rien. Une
  **suppression** en amont décale la suite vers l'arrière et **saute** un
  élément — que l'incrémental par `-lastUpdate` ne rattrapera jamais, un
  élément sauté n'ayant aucune date nouvelle.
- **Réconcilier par CARDINALITÉ est aveugle à ce saut** (démontré, pas
  supposé) : 120 items, perpage 50, suppression de l'index 0 après la page 0 →
  la page 1 saute l'ancien indice 50, et l'on obtient **119 identifiants pour
  119 annoncés**. Égalité, verdict « complet », élément perdu en silence. Seule
  la **décroissance du `count`** au fil des pages le trahit — et le `count`
  arrive dans *chaque* réponse de page, donc ce contrôle ne coûte rien.
- **Sous pagination par OFFSET, `lignes` suit la taille de la collection**,
  donc `lignes !== ids.size` implique `ids.size !== countFinal` : la troisième
  clause de cohérence ne peut **jamais** se déclencher seule. Elle est gardée
  comme **fil-piège** — si elle tire un jour, c'est que le modèle de pagination
  a changé sous nos pieds.
- **Une restauration depuis la corbeille décale vers l'AVANT** : elle réinsère
  un signet avec son `created` **d'origine**, qui peut tomber n'importe où dans
  l'ordre, et la page suivante **relit** un élément déjà lu. C'est un scénario
  réel de cette application, qui restaure elle-même.
- **`/collections` ne rend que les RACINES.** L'arborescence complète exige
  aussi `/collections/childrens` (§5.1 compte bien deux requêtes) ; s'en tenir
  à la première perd en silence l'essentiel de la hiérarchie.
- **Copies permanentes** : `GET /raindrop/{id}/cache` répond **303** (la doc
  annonce 307) vers une URL S3 signée ; la signature ne couvre que `GET`, donc
  un `HEAD` renvoie **403** — pas de sondage de taille. Suivre la redirection
  **à la main** (`redirect: "manual"`) : suivie automatiquement, l'en-tête
  `Authorization` est réémis vers une URL déjà signée (mesuré), que S3 rejette.
  **L'objet est stocké gzippé ET annoncé `Content-Encoding: gzip`** (mesuré le
  2026-09-18 : `206`, `Content-Range: bytes 0-0/3143395`) — donc `fetch`
  (undici) le **déplie tout seul** : « écrire tel quel » produit du HTML en
  clair sous un nom `.html.gz` que `gunzip` refuse, à 5,6 Mo là où l'objet
  stocké en fait 3,1. `archives.ts` recomprime quand la magie `1f 8b` manque.
  **Ce piège a survécu à son test** parce que le faux serveur servait les
  octets gzippés sans l'en-tête d'encodage : un faux infidèle sur un en-tête
  rend le test aveugle au seul comportement qu'il prétend couvrir.
- **`vi.spyOn` sur un export de `node:fs/promises` est impossible en ESM**
  (« Module namespace is not configurable ») — passer par `vi.mock` avec
  passthrough intégral, et vérifier la portée (`pool: "forks"` sans
  `isolate: false` = isolation par fichier).
- **`cache.size` est la taille STOCKÉE, pas décompressée** (mesuré le
  2026-09-19 : rapport 1,00 avec le `Content-Range` de S3 ; décompression
  réelle d'une copie **1,5×** ; une copie de 4 Ko stockée en clair, sans
  `Content-Encoding`). La distribution mesurée le 2026-09-18 (moyenne
  3,18 Mo, max 160,67) est donc des octets stockés — le budget d'archives,
  qui gère le disque, reste calibré juste ; toute lecture qui décompresse
  doit compter un multiple.
- **`repertoireTemporaire` rend une `string`, pas une fabrique.** Le patron du
  dépôt est `const dir = () => repertoireTemporaire("prefixe-")`
  (`sidecar/lockfile.test.ts`, `logger.test.ts`) — un répertoire neuf par
  appel, qui isole les tests.
- ~~**`npm run typecheck` est AVEUGLE sur les tests et sur `sidecar/testing/`**~~
  **GUERI le 2026-09-19** : `tsconfig.check.json` reprend le même périmètre
  sans les exclusions, et `npm run typecheck` chaîne les deux configs. La
  cécité venait de là : `tsconfig.json` sert AUSSI de config de build (il
  émettrait les tests dans `dist-sidecar`). Les **30 erreurs** qu'elle cachait
  étaient toutes réelles — 4 imports de `SidecarDeps` depuis `app.js` (qui ne
  l'exporte pas, tuant l'inférence de tous les params voisins), 3 chemins
  `shared/types` à un cran de trop, 3 helpers `req` annotés `Promise<Response>`
  sans être async, ~10 params implicitement `any`, des fixtures incomplètes, et
  **un type de production qui contredisait le runtime** : `acquireLock` refusait
  `pid` dans sa signature alors qu'il transmet l'objet tel quel et que le test
  du sidecar mort en dépend. Côté FRONT, rien ne change : `tsconfig.front.json`
  couvre déjà ses tests, et un `tsc` ad hoc y produit des faux positifs.

### La règle sortie de ce lot, sur les tests

> **Une assertion d'absence ne vaut que si l'on a montré que l'objet devait
> être là.**

Un test qui prouve qu'une archive a survécu doit d'abord prouver que son
identifiant était **hors** du jeu collecté — sinon il célèbre la survie d'un
objet que rien ne menaçait. Ce lot a produit une dizaine de tests creux, dont
trois attrapés uniquement par **sabotage** : réintroduire le défaut, vérifier
que le test échoue, revenir en arrière. Un test non sabordé n'est pas une
couverture, c'est une intention.

## Traps sélection du dossier — lot 2026-09-18

- **Sur `done`, le SSE sérialise le RÉSULTAT, pas l'événement**
  (`sidecar/api/sse.ts` : `"result" in evt ? evt.result : evt`). Côté front,
  `jobEvents` étale ce qui arrive : les champs du résultat sont donc **à plat**
  sur l'événement, `kind` mis à part. En revanche la **progression vit sous
  `progress`** — les deux formes diffèrent, et lire `evt.done` ne marche dans
  aucun des deux cas.
- **`tsconfig.front.json` inclut `src` en ENTIER, tests compris** :
  `npm run typecheck:front` les couvre. La cécité signalée plus haut ne vaut
  que pour le tsconfig **sidecar**, qui exclut `**/*.test.ts`. Corollaire : un
  `npx tsc` ad hoc sur un test front, privé des `types` du projet
  (`@testing-library/jest-dom`), produit des **faux positifs** — ne pas le
  faire, lancer le script.
- **Le dépôt n'a pas d'ESLint** : les imports morts ne sont signalés par rien.
  Après un découpage de fichier, passer
  `npx tsc -p tsconfig.front.json --noEmit --noUnusedLocals` — le typecheck
  ordinaire les laisse passer.
- **`tauri build` échoue au DMG si un volume DMG est resté monté** d'un build
  précédent interrompu (`bundle_dmg.sh` → « failed to run »). Le `.app`, lui,
  est déjà produit : ce n'est pas une régression du code. `hdiutil info`,
  puis `hdiutil detach /Volumes/dmg.XXXXXX -force`, et relancer.
- **Des tests SENSIBLES À LA CHARGE, pas instables — et ce n'est pas un jeu
  fixe.** Première occurrence : `linkchecker.test.ts` (« 200 → ok », « 301 →
  redirect ») et `lifecycle.test.ts` (« redémarre après un crash »,
  « restart() répare »), pendant qu'un `cargo test` tournait — la suite passe
  de 20 s à 191 s et les délais de 15-20 s expirent. Deuxième occurrence,
  **deux tests tout autres** (`CleanupDashboard`, `CollectionView`), cette
  fois sous un **scan antivirus à 51 % de CPU** (`com.avira.scanser`, plus
  CleanMyMac) : le montage d'environnement passe de 25 s à 614 s. Conclusion :
  **n'importe quel test à délai** tombe quand la machine sature. Avant de
  soupçonner le code, regarder `ps aux | sort -k3 -rn | head`. Seule et au
  calme, la suite rend 674/0. Ne pas lancer `npm test` et `cargo test`
  concurremment, et **ne pas contourner la garde** avec `--skip-tests` pour
  publier : le script annonce lui-même « ce build n'est pas livrable ».
- **`/user` ne porte AUCUN compte de signets** (vérifié en réel le
  2026-09-18 : ni `bookmarks_count` ni équivalent dans la réponse). Le
  `?? 0` qui tenait cette place fabriquait un zéro **silencieux**, affiché
  tel quel par le premier lancement (« — 0 signets ») et par le panneau de
  sauvegarde. Le compte se dérive d'une lecture d'un item de la collection 0,
  dont la réponse porte le total ; `bookmarksCount` est **optionnel** et
  ABSENT quand la dérivation échoue — un zéro inventé se lit comme un fait,
  l'absence se rattrape à l'écran. Et, une fois de plus, **le faux serveur
  était infidèle** : il rendait un `bookmarksCount` en camelCase que la route
  ne lisait même pas.
- **Chiffres en dur dans l'interface : jamais.** « 2 min 20, 245 requêtes »
  était la mesure faite sur UNE bibliothèque ; l'écrire dans un libellé la
  rendait fausse pour toute autre, et pour celle-là dès qu'elle change de
  taille. Ce qui nous appartient — 50 items par page, file à 550 ms — est une
  constante ; le reste se CALCULE sur `bookmarksCount` (`coutBalayage`).

## Traps interface — lot 2026-09-18 (soir)

- **Un en-tête pleine largeur ne se place PAS dans la grille.** L'en-tête de
  l'app était la cellule ligne 1 / colonne 1 — donc de la largeur de la barre
  latérale. Replier cette colonne à 0 repliait l'en-tête avec elle : le bouton
  de repli disparaissait (plus aucun moyen de rouvrir) et les icônes de
  réglages et de thème se déplaçaient. Ce qui appartient à l'APPLICATION vit
  **hors** de la grille ; la cellule laissée vacante devient un `<div>` vide,
  pour que `TopBar` reste en colonne 2.
- **Un panneau replié se DÉMONTE, il ne se réduit pas à zéro.** Une colonne de
  0 px laisse son contenu atteignable au clavier : des arrêts de tabulation
  dans un panneau qu'on ne voit pas. `{repliee ? <div aria-hidden /> : <Sidebar />}`.
- **`FantomeDrag` ne pose `user-select: none` qu'une fois le fantôme APPARU**,
  donc après le seuil de 5 px : les cinq premiers pixels d'un glissement
  démarraient une sélection de texte, ce qui faisait échouer le geste — y
  compris le déplacement d'une sélection multiple, qui fonctionnait pourtant.
  La ligne porte `select-none` ; le texte se copie depuis le détail.
- **Une route absente du mock ne ressemble pas à un mock absent.** `App.test`
  ne servait pas `/api/raindrops/:id` : `DetailPane` recevait la réponse de
  *health*, jetait sur `r.highlights.length`, et l'arbre se démontait — le
  panneau manquant passait pour un défaut du composant. J'ai perdu plusieurs
  essais à corriger du code sain. **Sonder avant de corriger.**
- **Un test de composant doit poser les MÊMES providers que `main.tsx`**
  (`AppStateProvider` ET `DragProvider`). Sans le premier, `useAppState` rend
  le contexte par défaut, dont `selectRaindrop` est un **no-op** : le clic ne
  fait rien, et le test accuse le composant.
- **Accord en nombre : la règle est FRANÇAISE.** `t()` choisit entre deux
  formes séparées par `|` sur la variable `n` — **le singulier vaut pour 0
  comme pour 1**, le pluriel à partir de 2. Sans ce mécanisme on écrivait
  « 1 instantanés conservés ». Une chaîne à deux comptes variables ne
  s'accorde pas ainsi : elle passe `n` pour celui qui porte l'accord et garde
  la forme `(s)` pour l'autre. Aucune valeur ne doit porter plus d'un `|` —
  un test du dictionnaire le refuse.
- **`scripts/release.py` ne sait PAS faire de pre-release** : il lit la version
  de `tauri.conf.json` (`0.1.0`), poserait donc le tag **`v0.1.0`**, appelle
  `gh release create` **sans `--prerelease`**, et son prompt est interactif
  (inutilisable depuis un agent). Les trois `v0.1.0-pre.N` ont été faites à la
  main. Republier : `git tag -f`, `git push -f origin <tag>`,
  `gh release upload --clobber`, **et le dire dans les notes** — remplacer des
  binaires en silence laisse une copie défectueuse circuler sous le même nom.

- **La sentinelle du défilement infini se réarme à chaque rendu.** Son
  observeur est recréé par le callback ref à chaque rendu — or
  `fetchNextPage()` en provoque un, et la sentinelle est TOUJOURS dans le
  champ : sans garde sur `isFetchingNextPage`, elle rappelle aussitôt.
  **Mesuré dans la fenêtre Tauri : cinq requêtes pour la même page sur un
  seul défilement.** Ce n'est pas qu'un gaspillage — la file du sidecar est
  séquentielle et espacée de 550 ms, donc ces doublons prennent la place des
  autres appels : une fiche reste en « Chargement… » pendant que la liste se
  rattrape.
- **`navigator.onLine` vaut `true` sous `tauri://localhost`** (mesuré le
  2026-09-19 par une sonde dans la vraie fenêtre). L'hypothèse séduisante —
  react-query met en pause ses requêtes quand il se croit hors ligne, ce qui
  produirait exactement un « pending » éternel — est donc FAUSSE ici. Le
  `networkMode: "always"` posé sur le QueryClient reste juste par principe
  (notre API est locale, `navigator.onLine` parle d'Internet), mais il ne
  corrige pas ce défaut-là : ne pas l'invoquer comme cause.
- **Pour reproduire la VRAIE origine `tauri://localhost`** : retirer `devUrl`
  ET `beforeDevCommand` du conf, puis `npx tauri dev --no-dev-server`. Sans
  console accessible, instrumenter `dist/index.html` d'une sonde qui `fetch`
  un petit serveur local — c'est le seul canal pour lire ce que voit le
  webview. L'amorçage prend 9 à 16 s en build debug : une sonde posée à 6 s
  ne trouve pas encore `<main>`.

### La règle sortie de ce lot, sur les bascules

> **Pour un contrôle qui bascule, l'aller ne prouve rien sans le retour.**

Mon test du repli de la barre latérale vérifiait que le bouton basculait son
`aria-pressed`. Il passait au vert sur un panneau **qu'on ne pouvait plus
rouvrir**. Tester l'état, c'est tester la moitié du contrat ; un interrupteur
se teste dans les deux sens, et l'on vérifie que la chose commandée a
réellement disparu — pas seulement que le bouton a changé d'avis.

## Traps filtre multi-étiquettes — lot 2026-09-19

- **L'opérateur `#` ne se comporte PAS comme `domain:`** (mesuré en réel le
  2026-09-19, lecture seule, 12 210 signets) : il est **insensible à la
  casse** (`#WEBDESIGN` → 1713 comme `#webdesign`) et les **guillemets sont
  transparents** (`#"webdesign"` → 1713, `#"webdesign" #"code"` → 113). On
  peut donc quoter systématiquement, ce qui protège l'étiquette qui porterait
  un espace — aucune n'en porte aujourd'hui, un renommage en fabrique une.
  Ce qui reste impitoyable : **pas de préfixe** (`#webdes` → 0) et **`tag:`
  n'existe pas** (→ 0).
- **Il n'y a PAS d'union.** `#webdesign OR #code` → **60**, soit moins que
  chacun : « OR » est lu comme un mot du texte libre et s'intersecte avec le
  reste. L'intersection (`#a #b` → 113 pour 1713 ∩ 886) est la seule
  sémantique offerte — ne pas dessiner d'interrupteur ET/OU, il n'y a rien
  derrière.
- **`Object.fromEntries(new URL(req.url).searchParams)` ne garde que la
  DERNIÈRE valeur d'une clé répétée.** `?tags=a&tags=b` s'y réduit à `b`,
  sans erreur : un filtre sur deux étiquettes qui n'en applique qu'une, et une
  liste trop large que rien n'explique. Les valeurs répétées se relisent par
  `getAll` APRÈS l'aplatissement. **Un test à UNE étiquette passe au vert sur
  cette route cassée** — le piège ne s'attrape qu'à deux.
- **`String(["a","b"])` rend `"a,b"`.** Un `qs()` qui fait `p.set(k, String(v))`
  sérialise donc un tableau en une valeur unique, silencieusement. Répéter le
  paramètre (`p.append`), jamais joindre : un séparateur suppose une étiquette
  qui ne le contient pas, et rien ne le garantit.
- **Une liste VIDE ne hache pas comme `undefined`.** La clé de cache de
  `useRaindrops` est l'objet de requête entier : `{tags: []}` et `{}` sont
  deux entrées distinctes, donc retirer la dernière étiquette rouvrirait une
  seconde entrée pour la liste non filtrée déjà chargée. `listQueryArgs`
  ramène le vide à `undefined`, que `JSON.stringify` efface. Même raison pour
  **trier** la liste : `["a","b"]` et `["b","a"]` sont le même filtre et
  doivent produire la même clé.
- **Un filtre à bascule doit se voir là où on le clique.** Une pilule déjà
  retenue, rendue comme les autres, invite à refaire ce qui est fait — et son
  clic surprend en défaisant. `aria-pressed` + inversion des teintes (la
  TEINTE ne bouge pas : c'est le rôle qui change, pas l'identité).
- **Le cliquet de `scripts/build_app.py` EXCLUT les tests**, mais pas
  CLAUDE.md (« tests compris »). `sidecar/api/routes/raindrops.test.ts` vivait
  à 430 lignes sans que rien ne le signale ; il est découpé (lecture /
  écriture). Corollaire : **soldé le même jour** — les erreurs étaient
  réelles, toutes corrigées, et le typecheck couvre désormais les tests en
  permanence (`tsconfig.check.json`, trap sauvegarde).

## Traps garde de sélection — lot 2026-09-20

- **Un `disabled` n'est pas une garde structurelle.** La garde « un groupe
  garde toujours un représentant » vivait dans un `verrouille` calculé par
  `items.length - cochees.size === 1` — or `cochees` (state local) survit aux
  données : un refetch de scan (l'invalidation `["analysis"]` passe outre
  `staleTime: Infinity`, et la promesse d'`useStartScan` survit au démontage
  du composant qui l'a lancé) change les items d'un groupe à clé inchangée
  PENDANT que la vue est montée. Cochés fantômes → le verrou s'ouvre ;
  gardé disparu → `find(...)!` rend `undefined` et le `!` crashe le rendu.
  **Lire toujours l'intersection cochés ∩ vivant** (`cocheesDe`), et jamais
  de `!` sur un `find` de rendu.
- **Cette app n'a PAS d'ErrorBoundary** : un TypeError au rendu est un
  écran blanc, pas un panneau. Tout garde « ça ne peut pas arriver » doit
  alors se payer un `if (!x) return` — la branche impossible est celle qui
  arrive au refetch suivant.
- **Un keydown « englobant » doit se taire quand le geste naît dans un
  contrôle interne.** `LigneActivable.Ligne` « entrait » à chaque Enter —
  y compris quand la ligne était déjà active et le focus sur son bouton :
  le focus sautait au premier contrôle et le click d'Entrée partait de la
  CASE au lieu du bouton visé. Règle : `if (e.target !== e.currentTarget)
  return` — trouvé en écrivant le test (deux items pour que l'assert final
  distingue), pas en relisant le code.
- **Migrer des tests entre fichiers par découpage de chaînes python :
  vérifier les positions relatives des bornes AVANT d'écrire.** Un
  `s.index(A)`/`s.index(B)` où B précède A découpe à l'envers et duplique
  des blocs — le fichier corrompu passait encore ses tests (doublons),
  seul `wc -l` a trahi. Reconstituer au `Write` intégral plutôt que
  rafistoler.

## Traps reprise en vol — lot 2026-09-19

- **Une pause de reprise DANS le créneau de file gèle l'interface.** La file
  est séquentielle : attendre 4 s sans rendre le créneau bloque le rang
  « interactif » derrière soi, tout ce que les deux rangs existent pour
  empêcher. Le retry s'enroule donc **autour** de `file.run`, une tentative =
  un créneau. Testable sans mesurer un temps : une file espionne qui
  journalise entrée/sortie doit rendre `entrée, sortie, pause, entrée, sortie`.
- **Un décorateur par job, pas une option de `makeLecture`.** L'instance de
  lecture naît au démarrage du sidecar, bien avant tout job ; or la reprise
  doit être interruptible par l'annulation de CE job. Poser le crochet à la
  construction imposerait un état mutable partagé entre jobs.
- **Une pause indivisible est une latence d'annulation.** 16 s d'attente
  d'un bloc, c'est 16 s sans réponse après un clic sur « annuler ». Dormir par
  tranches de 250 ms, en relisant `annule()` entre chacune.
- **Ne jamais retenter un 401/403/404.** Trois rejeux espacés transforment une
  erreur claire — jeton révoqué, collection disparue — en panne lente et
  inexplicable. Se retentent : 429, 5xx, et tout ce qui n'est pas un statut
  HTTP (coupure, `AbortError` du timeout, corps tronqué).
- **L'annulation peut arriver AILLEURS que dans la boucle qu'on a protégée.**
  Trouvé en écrivant le test, pas en relisant le code : le 429 tombait sur
  `releverWatermark`, qui PRÉCÈDE le balayage — hors du `catch` de `passer()`.
  Une erreur postérieure à une annulation doit se relire comme une annulation
  **à chaque niveau** où elle peut naître, sinon celui qui annule lit
  « http 429 ».
- **`npm test 2>&1 | tail -4 && git commit` COMMITTE SUR UN ÉCHEC** : le code
  de sortie d'un pipeline est celui de `tail`, pas de `npm test`. Pour toute
  exécution qui décide d'un commit : `npm test > log 2>&1; rc=$?`, puis tester
  `$rc`.

## Traps Nettoyage — lot 2026-09-19

- **Un résultat de scan indexé par URL n'est pas un résultat par SIGNET.**
  `allResults()` rendait `Object.values(results)`, donc une ligne par adresse ;
  430 signets de la bibliothèque réelle partagent une URL au caractère près,
  soit jusqu'à **242 signets morts invisibles**. Le `raindropId` stocké dans le
  résultat est celui du DERNIER vérifié — un hasard d'ordonnancement, pas une
  désignation : il se recalcule depuis l'index. Le stockage par URL reste
  juste (une URL ne se vérifie qu'une fois) ; c'est la LECTURE qui doit
  redistribuer.
- **Un index jamais élagué devient dangereux dès qu'il DÉCIDE.**
  `setItemsIndex` fusionnait : anodin tant qu'il ne servait qu'à décorer une
  ligne d'un titre, fatal depuis qu'il décide quelles lignes exister — un
  signet supprimé ressusciterait dans les liens morts, avec une action qui ne
  peut plus aboutir. Il REMPLACE désormais ; c'est sûr parce que l'appelant ne
  le nourrit que d'instantanés complets (le cas annulé est traité avant).
- **Le scan vérifiait la même URL une fois par signet.** `checkAll` ne
  dédoublonnait pas ses cibles : mesuré, **11 968 URL distinctes pour
  12 210 signets**, soit 242 requêtes de 10 s pour un verdict identique. Le
  test existant affirmait `27` avec le commentaire « 25 + 2 doublons
  fixture » — il **verrouillait le gaspillage**.
- **« 0 » sur un cache vierge est un mensonge d'écran, pas de sidecar.** La
  route rend honnêtement `total: 0` ; c'est l'interface qui l'affichait comme
  un résultat. Un compteur dont l'analyse dépend d'un scan jamais lancé doit
  dire « jamais analysé ». Même faute que le `bookmarksCount` à zéro.
- **Un composant qui possède l'état d'un job le perd au démontage.**
  `BlocScan` gardait `{jobId, controller}` en state local : quitter le
  Nettoyage pendant une analyse de 12 210 liens rendait le scan insuivable ET
  **inannulable**, alors que `GET /api/jobs` porte tout (mesuré : `300/12210`
  avec son libellé). Le patron d'adoption existait déjà pour la sauvegarde
  (`suiviSauvegarde.ts`) — il n'avait simplement pas été appliqué ici.
- **Une route absente du mock rend `{}`, et `{}.find` jette.** Le mock de
  `CleanupDashboard.test` ne servait pas `/api/jobs` : l'arbre entier se
  démontait et le compteur manquant passait pour un défaut du composant.
  Deuxième occurrence de ce piège, après `/api/raindrops/:id` dans `App.test`.
- **Un compteur de GROUPES ne se lit pas comme un compteur d'objets.**
  « Doublons 414 » se lisait « 414 signets en double » ; la mesure réelle donne
  **414 groupes pour 1 032 signets, dont 618 copies retirables**. Le nombre qui
  dit ce qu'on gagne à nettoyer n'apparaissait nulle part.
- **La reprise d'un scan de liens EXISTAIT sans se voir.** Les résultats sont
  persistés tous les 20 et `staleUrls` exclut ce qui est frais : relancer ne
  refait que le reste. Mais `lastScan` ne se pose qu'à l'achèvement, donc
  l'écran annonçait « jamais » au-dessus de milliers de liens vérifiés, puis
  une progression repartant de zéro sur un total mystérieusement réduit.
  `avancementLiens()` le lit dans le cache, sans une requête.

## Traps signalétique et clavier — lot 2026-09-19

- **Une case « à faire » de la ROADMAP peut mentir depuis des jours, même
  écrite par soi.** Sur les sept points du lot a11y, **cinq étaient déjà
  faits** — vérifiés un par un avant d'écrire quoi que ce soit. La consigne
  existante (« vérifier `git log` avant de croire une case à faire ») vaut
  aussi pour ses propres notes ; ce qui restait n'était même pas en tête de
  liste.
- **`Record<string, unknown>` sur les props d'un composant rend `any` chaque
  paramètre de gestionnaire** — un `onChange(e)` sans type, dans un fichier
  que le typecheck couvre pourtant. Typer sur la balise
  (`ComponentPropsWithoutRef<T>`) rend le contrôle au compilateur.
- **Une comparaison `>=` contre `Date.now()` fait un test dépendant de
  l'horloge.** `avancementLiens(0)` compare à l'instant même : un résultat
  écrit dans la même milliseconde tombe pile sur la coupure et passe pour
  frais. Le test a fini par le démontrer en échouant. Ne PAS corriger la
  comparaison — `staleUrls` emploie la même, et les faire diverger ferait
  compter « frais » ici ce que le scan irait refaire là. C'est le TEST qui
  doit vieillir sa donnée plutôt que raboter le seuil.
- **La route `/etats` doit appeler `resultatsParSignet()`, jamais
  `allResults()`** : ce dernier rend une ligne par URL, et la liste ne
  marquerait qu'un seul de trois signets partageant une adresse morte — le
  défaut corrigé le matin même, rouvert ailleurs le soir.
- **L'absence d'une marque n'est pas une information neutre.** Dès que
  certaines lignes portent un filet, les autres se lisent comme vérifiées :
  l'inférence naît de la PRÉSENCE des marques, pas d'un texte. Or « pas de
  marque » recouvre vérifié sain, jamais vérifié, et périmé au sens du TTL.
  La limite est tablée dans DESIGN.md §5 plutôt que laissée tacite.

## Git

Travailler sur `main`. **Pousser uniquement quand l'utilisateur le demande.**

Terminer les messages de commit par un trailer nommant le **modèle qui a
réellement écrit le commit** — jamais un nom figé :

- Claude : `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  (ou `Claude Sonnet 5`, `Claude Haiku 4.5`… selon le modèle actif).
- GLM : `Co-Authored-By: GLM 5.3 <noreply@z.ai>`.

⚠️ Ce dépôt est travaillé avec **plusieurs modèles**, dont GLM via `glm.sh`
(route Claude Code vers l'API z.ai : le modèle *actif* est GLM, quel que soit
l'alias `sonnet`/`opus` affiché). Vérifier quel modèle tourne avant de signer.
