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
- **`repertoireTemporaire` rend une `string`, pas une fabrique.** Le patron du
  dépôt est `const dir = () => repertoireTemporaire("prefixe-")`
  (`sidecar/lockfile.test.ts`, `logger.test.ts`) — un répertoire neuf par
  appel, qui isole les tests.
- **`npm run typecheck` est AVEUGLE sur les tests et sur `sidecar/testing/`**
  (exclus par `tsconfig.json`). Toute retouche à `apiServer.ts` ou à un
  `*.test.ts` exige un `npx tsc --noEmit` **explicite** sur les fichiers
  touchés.

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
- **Quatre tests sont SENSIBLES À LA CHARGE**, pas instables :
  `linkchecker.test.ts` (« 200 → ok », « 301 → redirect ») et
  `lifecycle.test.ts` (« redémarre après un crash », « restart() répare »).
  Ils échouent quand `npm test` tourne **en même temps** qu'un `cargo test` —
  la suite passe de 20 s à 191 s et les délais de 15-20 s expirent. Seule,
  elle rend 663/0. **Ne pas lancer les deux suites concurremment.**
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
