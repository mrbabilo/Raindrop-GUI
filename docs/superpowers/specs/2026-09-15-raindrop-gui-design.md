# Raindrop GUI — Spécification de conception

**Date** : 2026-09-15
**Statut** : Validée en brainstorming, en attente de plan d'implémentation
**Périmètre** : Phase 1 — Bibliothèque + Nettoyage

---

## 1. Contexte et objectifs

Raindrop.io est un gestionnaire de bookmarks en ligne (compte Pro de l'utilisateur, bibliothèque de **plus de 5 000 bookmarks**). L'application web native ne satisfait pas pour deux usages :

1. **Navigation/consultation enrichie** : une interface locale, en français, plus agréable pour sauvegarder, chercher et organiser.
2. **Nettoyage de bibliothèque** : liens cassés, doublons, bookmarks non-taggés, collections vides, corbeille — avec vues dédiées et actions en masse sûres.

La GUI pilote Raindrop.io **via le serveur MCP `@kud/mcp-raindrop-io`** (exigence explicite), qui expose 23 tools couvrant l'API Raindrop : bookmarks (7), collections (7), tags (2), highlights (2), user/import (3), utilitaires (2 : `library_audit`, `empty_trash`).

### Décisions structurantes (validées avec l'utilisateur)

| Sujet | Décision |
|---|---|
| Forme | **App desktop Tauri 2** (macOS) |
| Pont MCP | **Sidecar Node/TypeScript** : client MCP + API HTTP locale exposée au webview |
| Front | React 18 + TypeScript + Vite + Tailwind, TanStack Query + TanStack Virtual |
| Layout bibliothèque | **Trois panneaux** (navigation \| liste \| détail permanent) + palette ⌘K en complément |
| Organisation nettoyage | **Hybride** : dashboard d'audit comme point d'entrée, vues standard pré-filtrées ensuite |
| Analyse nettoyage | **Locale à l'app** : doublons, liens morts et redirections calculés par le sidecar — pas via Raindrop (exigence utilisateur) |
| Actions destructrices | **Page dédiée « Revue de l'action »**, deux niveaux de gravité, corbeille par défaut |
| Déploiement | Local uniquement (127.0.0.1) |
| IA | **Phase 2** (hors de cette spec, voir §12) |

---

## 2. Architecture générale

```
┌──────────────────────────────────────────────────────┐
│  App Tauri 2 (macOS)                                 │
│                                                      │
│  ┌────────────────┐         ┌─────────────────────┐  │
│  │ Webview        │  HTTP   │ Sidecar Node        │  │
│  │ React + TS     │◄───────►│  ├─ Client MCP     │  │
│  │ Vite + Tailwind│ :port   │  │  (@mcp/sdk)     │  │
│  │ TanStack Query │         │  └─ Serveur API     │  │
│  │ TanStack Virtual│        │     REST + SSE      │  │
│  └────────────────┘         └──────────┬──────────┘  │
│                                        │ stdio       │
│                             ┌──────────▼──────────┐  │
│                             │ @kud/mcp-raindrop-io│  │
│                             │ (subprocess Node)   │  │
│                             └──────────┬──────────┘  │
└────────────────────────────────────────┼─────────────┘
                                         │ HTTPS
                              ┌──────────▼──────────┐
                              │ api.raindrop.io     │
                              └─────────────────────┘
```

### Composants et responsabilités

1. **Webview (front)** — React 18 + TypeScript + Vite + Tailwind.
   - TanStack Query : cache, invalidation, états de chargement.
   - TanStack Virtual : listes virtualisées (milliers d'items à 60 fps).
   - Ne connaît **que** l'API HTTP locale ; aucun code MCP côté front.

2. **Sidecar Node** (TypeScript, spawné par Tauri au lancement) :
   - **Client MCP** (`@modelcontextprotocol/sdk`) connecté en stdio au serveur raindrop.
   - **Serveur HTTP** (Hono) : les 22 tools exposés en endpoints REST typés + SSE pour les opérations longues.
   - Cycle de vie du subprocess MCP : démarrage, health-check, redémarrage sur crash (retry ×3, back-off exponentiel).
   - **File d'attente avec throttle** pour respecter la limite Raindrop (120 req/min), back-off sur 429.
   - **Moteur d'analyse local** (§5.1) : link checker HTTP (liens morts, redirections) + dédoublonnage, avec cache de résultats horodaté.
   - Bind **127.0.0.1 uniquement**, port attribué par l'OS (bind port 0).

3. **Serveur MCP** — `@kud/mcp-raindrop-io` **épinglé comme dépendance npm du sidecar** (pas de `npx @latest` au runtime), lancé par : `node node_modules/@kud/mcp-raindrop-io/dist/index.js` avec `MCP_RAINDROPIO_TOKEN` en variable d'environnement.

4. **Shell Tauri (Rust minimal)** — fenêtre, spawn/arrêt du sidecar, transmission du port+token local au webview, accès au trousseau macOS.

### Structure du dépôt

```
Raindrop-GUI/
├── src-tauri/          # shell Tauri 2 (Rust minimal)
├── src/                # front React
├── sidecar/            # pont MCP (Node, TypeScript)
├── docs/superpowers/   # specs et plans
├── .gitignore
└── package.json        # orchestration (dev, build, test)
```

Un seul `package.json` (pas de workspaces) ; TypeScript partagé front/sidecar via chemins TS classiques.

---

## 3. Corrections issues de la relecture critique

Ces points sont **contraignants** pour l'implémentation :

1. **MCP épinglé** : `@kud/mcp-raindrop-io` est une dépendance versionnée (`1.3.1`), spawn direct du JS. Pas de réseau requis au lancement, pas de dérive de version.
2. **Prérequis Node** : le sidecar et le serveur MCP nécessitent **Node ≥ 20** présent dans le PATH. L'app vérifie sa présence au démarrage et affiche une erreur claire le cas échéant. (La compilation du sidecar en binaire autonome — Node SEA ou Bun — est repoussée en Phase 2.)
   - **Amendement du 2026-09-17 (décision utilisateur)** : au premier lancement, si Node est absent ou trop vieux, l'app **propose d'installer un runtime Node géré** — tarball officiel nodejs.org, version épinglée, somme SHASUMS256 vérifiée, installé dans le dossier de données de l'app (aucun droit administrateur). Le runtime géré, une fois présent, est préféré au PATH. Les instructions manuelles restent le repli (hors-ligne, refus de l'installation).
3. **Abstraction de secours** : le front ne dépend que de l'API REST locale ; chaque tool est isolé derrière une fonction typée avec **timeout par appel**. Si le package MCP devient un blocage, chaque endpoint peut être rebranché sur des appels REST directs à Raindrop **sans toucher au front**.
4. **Gros volumes** : UX recherche-d'abord. Pas de full scan côté front. Vue par défaut = page courante + infinite scroll (50 items/requête, maximum de l'API Raindrop). L'analyse de nettoyage (doublons, liens morts, redirections) est **calculée localement par l'app** (voir §5.1), pas par Raindrop ; seul le filtre trivial `untagged` passe par `search_raindrops`.
5. **Bulk** : privilégier `bulk_raindrops` (1 appel = N bookmarks) plutôt que N appels unitaires ; les boucles nécessaires passent par des jobs SSE avec progression, jamais bloquants pour l'UI.
6. **Cycle de vie sidecar** : le sidecar bind le port 0, écrit `{port, pid}` dans un **lockfile** du dossier app-data (`~/Library/Application Support/Raindrop-GUI/`) — **sans le token** (§3.7 : rien de secret en clair sur disque ; Tauri connaît le token qu'il a généré). `port: 0` = binding en cours (Tauri poll jusqu'à `port > 0`). Tauri génère le token local et le transmet au sidecar par variable d'environnement au spawn, et au webview par commande Tauri. PID actif = réutilisation (pas de doublon lors des reloads webview/HMR). Crash = notification + bouton « Redémarrer la connexion ».
7. **Superficie HTTP locale** : token Bearer éphémère généré par Tauri au lancement et transmis au webview via commande Tauri (jamais écrit en clair sur disque), vérification de l'`Origin: tauri://localhost` (et `http://localhost:*` en dev), CORS minimal. Résiduel assumé : un process du même utilisateur macOS peut lire l'env du subprocess — négligeable en mono-utilisateur.
8. **Rate limiting** : file d'attente côté sidecar, sérialisation des appels MCP (stdio), back-off exponentiel sur 429, statut visible dans la barre de progression des jobs.

---

## 4. Interface

### 4.1 Vue Bibliothèque (écran principal) — trois panneaux

- **Panneau gauche (navigation)** : collections en arborescence (root + children), liste des tags (avec compteurs), vues fixes : Tous, Favoris, Non-lus, Corbeille. Section repliable.
- **Panneau central (liste)** : bookmarks virtualisés — titre, domaine, extrait, tags, date. Tri (création, titre, domaine). Recherche serveur en entête avec filtres avancés (domaine, type de média, plage de dates, non-taggés, favoris…). Infinite scroll, 50/requête. Multi-sélection par cases à cocher → **barre d'actions en masse** en pied de liste (Corbeille, Déplacer, Tagger). *(« Déplacer », retiré un temps au profit du seul glisser-déposer, est rétabli le 2026-09-24 : sans lui, déplacer plusieurs signets était impossible au clavier.)*
- **Panneau droit (détail, permanent)** : suit la sélection (clic ou flèches clavier). Aperçu, édition inline (titre, extrait, note, tags, collection), lecture des highlights. Actions : favori, ouvrir l'URL, supprimer (→ corbeille).
- **Palette ⌘K** : recherche universelle (bookmarks, collections, tags, commandes, **accès direct aux vues de nettoyage**), navigation clavier complète (flèches, Entrée, Échap).

**Composer d'ajout permanent** (inspiration karakeep) : champ d'ajout toujours visible en tête de liste (raccourci ⌘+E) — collage d'URL, préremplissage via `parse_url` (titre/description) et alerte si l'URL est déjà sauvegardée via `check_urls_exist` (avec lien vers l'existant).

**Affichages** : bascule **liste compacte ↔ mosaïque** avec vignettes (covers fournies par Raindrop). Les **tags sont cliquables** dans les items et lancent le filtre serveur correspondant.

### 4.2 Vue Nettoyage — hybride

- **Dashboard (point d'entrée)** : compteurs issus du **moteur d'analyse local** (§5.1) — liens morts, redirections, doublons — plus non-taggés (filtre serveur `untagged`), collections vides (filtrage côté front) et corbeille. Chaque compteur affiche la **fraîcheur de l'analyse** (date du dernier scan). L'analyse est un **job visible avec progression, annulable** (SSE), à la manière du scan de Bookmarks Organizer ; boutons « Lancer/relancer » par catégorie ou global.
- **Vues de traitement** : cliquer un compteur ouvre la **vue standard à trois panneaux pré-filtrée** (chip « Liens cassés (23) » en entête ; résultats de l'analyse locale ou filtre serveur selon la catégorie). Même mécanique de sélection et de barre d'actions que la bibliothèque.
- **Vue Redirections** : chaque item affiche l'URL sauvegardée → l'URL finale détectée ; action « **Remplacer par l'URL finale** » (individuelle ou en masse via la page Revue, niveau 1).
- **Tags** : vue dédiée (liste avec compteurs) — renommer, fusionner, supprimer (`manage_tags`). Fusion = cas d'usage nettoyage majeur.
- **Collections vides** : liste + suppression (`cleanup_collections`, mapping du `confirm: true` MCP sur le niveau de gravité 2 — voir §4.3). **Amendé (2026-09-20, route retirée le 2026-09-23)** : la suppression passe id par id (`DELETE /api/collections/:id`, ordre feuilles → racine), en Revue niveau 2 — jamais le nettoyage GLOBAL de Raindrop, dont la définition du « vide » n'est pas la nôtre.
- **Corbeille** : liste consultable, restauration individuelle, « Vider la corbeille » (niveau 2, `empty_trash` avec `confirm: true`).

> ⛔ **Restauration — l'endpoint utilisé n'existe pas (vérifié en réel le 2026-09-16).** `POST /raindrops/unrestore`, appelé par `sidecar/direct/raindropRest.ts`, répond **404** sur le compte de test, exactement comme une route inventée (contrôle négatif effectué ; les routes documentées répondent 200 au même instant). `PUT` et `/raindrop/unrestore` : 404 également. **Le code livré en Task 0 ne peut donc pas fonctionner en production** — son test ne vérifiait que l'URL construite sur un `fetch` mocké.
>
> La seule voie est `PUT /raindrops/-99 {ids, collection:{"$id": N}}`, qui **impose une collection de destination**.
>
> **Et l'API ne conserve pas l'origine** — vérifié le 2026-09-16 par une sonde jetable (collection temporaire, bookmark créé puis mis à la corbeille, compte remis dans son état initial) : une fois à la corbeille, `collectionId` vaut `-99`, `collection.$id` vaut `-99`, `removed` passe à `true`, et **aucun champ ne porte la collection d'avant**. Restaurer « à l'origine » est donc impossible à partir des seules données de l'API : l'information doit venir de nous, ou être demandée à l'utilisateur.
>
> **Décision (2026-09-16) — restauration hybride.** Quand c'est **l'app** qui met à la corbeille, elle **note la collection d'avant** : la restauration se fait alors en un clic, comme dans Raindrop officiel. Pour un élément dont l'origine est inconnue — mis à la corbeille depuis le web, le mobile, ou avant l'installation — l'interface **demande la destination**. Conséquences de contrat :
>
> - `DELETE /api/raindrops/:id?from=<collectionId>` — le front passe la collection courante, le sidecar la mémorise. Sans `from`, la suppression fonctionne mais l'origine sera inconnue à la restauration.
> - `POST /api/raindrops/unrestore {ids, toCollectionId?}` — avec `toCollectionId`, tout est restauré là ; sans, le sidecar regroupe par origine mémorisée et renvoie `{restored, unknown: number[]}`, les `unknown` n'étant **pas** restaurés. Le front demande alors une destination pour ceux-là et rappelle avec `toCollectionId`.
> - Mémoire des origines : petit état local en app-data, à côté du cache d'analyse (artefact recalculable, jamais une source de vérité — §11). Purge des entrées dont l'élément n'est plus en corbeille.

### 4.3 Page « Revue de l'action » (aperçu destructeur)

Toute action en masse ouvre une **page dédiée** remplaçant la liste :

- Rappel de l'action et **compteur exact** d'items affectés + origine (filtre actif, sélection manuelle, ou les deux).
- **Liste complète scrollable** (virtualisée) avec recherche/filtre **dans l'aperçu** et **désélection item par item** (le compteur se met à jour).
- **Export CSV** de la sélection courante.
- Deux niveaux de gravité :
  - **Niveau 1 — réversible** (→ corbeille, déplacer, retag, fusion de tags) : case à cocher « Je confirme l'action sur N items » obligatoire, bouton d'exécution inactif avant cochage.
  - **Niveau 2 — irréversible** (vider la corbeille, supprimer des collections) : **frappe obligatoire du mot « SUPPRIMER »**.
- Corbeille par défaut : toute suppression passe par la corbeille Raindrop ; seul le vidage de corbeille est définitif.
- Note assumée : Raindrop n'offre pas d'undo API pour déplacements/tags — **l'aperçu est l'annulation**.
- **Amendé (2026-09-24, audit d'ergonomie — décision de l'utilisateur)** : depuis la **barre de sélection**, la **mise à la corbeille** et le **déplacement** s'exécutent **sans Revue**, suivis d'un avis qui offre « Annuler » — les mêmes verbes, routes et avis que le glisser-déposer, qui s'en passait déjà. Ils sont défaisables par nous : la corbeille par la restauration à l'origine mémorisée (§4.2), le déplacement en renvoyant chaque signet dans la collection d'où la liste l'a vu venir. « Annuler » n'est offert que s'il ne défait **que** le geste (aucun signet déjà en corbeille ; toutes les origines connues ; pas de sortie de la corbeille). Restent en Revue : l'**étiquetage** (on ne sait pas qui portait déjà l'étiquette — aucun retour arrière sûr), l'archivage, les actions de nettoyage (liens morts, redirections, doublons) et tout le niveau 2.

### 4.4 Apparence

Mode **clair/sombre suivant le système** (tokens Tailwind), choix manuel possible dans les réglages. Interface en **français** (l'app est mono-utilisateur — pas d'infrastructure i18n, mais les textes sont externalisés dans un fichier unique pour faciliter une future traduction).

---

## 5. Couche sidecar — API locale

### 5.1 Moteur d'analyse local (nettoyage)

L'analyse des doublons, liens morts et redirections est effectuée **par l'app** (sidecar), pas par Raindrop — exigence utilisateur. Le tool MCP `library_audit` n'est **pas utilisé** ; les filtres serveur `broken`/`duplicates` non plus.

> **Ce rejet ne dépend pas du pont utilisé.** Le candidat de reprise §10.1 expose lui aussi `library_audit`, `find_duplicates`, `remove_duplicates` et `organize_by_topic` : ils restent écartés pour la même raison, et `remove_duplicates` en ajoute une — c'est une suppression en masse **sans prévisualisation**, incompatible avec la page Revue de l'action (§4.3), par laquelle toute action de masse doit passer. Une migration du pont ne rouvre pas ce choix.

- **Récupération** : snapshot paginé de la bibliothèque via `search_raindrops` (50/requête, throttle), servi depuis le cache local une fois frais.
- **Doublons** (calcul pur, instantané) : groupes par URL exacte, puis par URL **normalisée** (schéma http/https unifié, slash final, paramètres de tracking `utm_*` retirés) ; détection optionnelle « douce » (même domaine + titre identique) présentée séparément.
- **Liens morts + redirections** (scan réseau) : requêtes HTTP depuis le sidecar — **concurrence 6, timeout 10 s, HEAD puis GET si 405/ambigu, 1 retry réseau** avant classification. Catégories : `ok` / `redirection` (permanente 301/308 ou temporaire, avec chaîne et URL finale) / `mort` (4xx/410, 5xx, DNS, timeout) / `indéterminé` (403 anti-bot, captcha → vérification manuelle).
- **Résultats stockés localement** (`~/Library/Application Support/Raindrop-GUI/analysis.json`) avec horodatage par URL : les vues se consultent sans re-scanner ; les scans **incrémentaux** ne revérifient que les items nouveaux/modifiés ou expirés (TTL configurable, 30 j par défaut).
- **Jobs SSE** : progression par URL, annulables, résultats partiels consultables pendant le scan.
- **Endpoints** : `POST /api/analysis/scan {type: "links"|"duplicates"|"all"}`, `GET /api/analysis/results/:type` (paginé), `GET /api/analysis/status`.
- **Correction des redirections** : « remplacer par l'URL finale » via `update_raindrop` — **à vérifier à l'implémentation** que l'outil MCP expose le champ `url` ; sinon, rebranchement direct sur l'API Raindrop via l'abstraction de secours (§3, point 3). Action de niveau 1, passe par la page Revue en masse.

### Surface REST (esprit : 1 endpoint ≈ 1 tool MCP)

| Groupe | Endpoints (indicatifs) |
|---|---|
| Bookmarks | `GET /api/raindrops` (recherche + filtres + pagination), `GET /api/raindrops/:id`, `POST /api/raindrops`, `PATCH /api/raindrops/:id`, `DELETE /api/raindrops/:id`, `POST /api/raindrops/bulk` |
| Collections | `GET /api/collections`, `GET /api/collections/children`, `GET/POST/PATCH/DELETE /api/collections/:id`, `POST /api/collections/cleanup` |
| Tags | `GET /api/tags`, `POST /api/tags/manage` (rename/merge/delete) |
| Highlights | `GET /api/raindrops/:id/highlights`, `POST/PATCH/DELETE` sur `/highlights/:hid` |
| User & import | `GET /api/user`, `POST /api/parse-url`, `POST /api/check-urls` |
| Utilitaires | `POST /api/empty-trash` |
| Jobs | `GET /api/jobs/:id` (statut), `GET /api/jobs/:id/events` (SSE progression) |
| Santé | `GET /api/health` (état MCP, version du serveur) |

Note : `PATCH /api/raindrops/:id {url}` → REST direct (`update_raindrop` v1.3.1 n'expose pas `url`).

### Contrats

- **Auth locale** : header `Authorization: Bearer <token-éphémère>` sur toutes les routes.
- **Erreurs uniformes** : `{ "error": { "code", "message", "tool?" } }` — codes : `MCP_TIMEOUT`, `MCP_CRASHED`, `RATE_LIMITED`, `RAINDROP_API`, `INVALID_INPUT`.
- **Validation** : schémas zod côté sidecar ; types TypeScript partagés avec le front.
- **Jobs SSE** : toute opération longue (audit, boucles bulk nécessaires, vidage corbeille) crée un job ; progression publiée en SSE ; l'UI affiche une barre de progression avec possibilité d'annuler (annulation = arrêt de la boucle côté sidecar, pas de rollback).
- **Timeout** : par appel tool (30 s par défaut, configurable) ; dépassement → `MCP_TIMEOUT` sans tuer le subprocess.

---

## 6. Token & configuration

- **Stockage** : trousseau macOS via plugin Tauri (Keychain). Fallback documenté : fichier `config.json` chmod 600 dans app-data si Keychain indisponible.
- **Premier lancement** : écran de configuration — saisie du token, validation immédiate via `get_user` (affiche le compte détecté), puis démarrage du sidecar.
- **Transmission** : le sidecar reçoit `MCP_RAINDROPIO_TOKEN` en variable d'environnement au spawn. Le token ne transite **jamais** par HTTP ni n'apparaît dans le front.
- **Réglages** : remplacer le token, état de la connexion MCP, préférences d'affichage.

---

## 7. États dégradés

| Situation | Comportement |
|---|---|
| Crash subprocess MCP | Bannière + « Redémarrer la connexion » ; retry auto ×3 back-off exponentiel ; erreurs `MCP_CRASHED` |
| Rate limit (429) | File d'attente + throttle sidecar, back-off, progression visible |
| Hors-ligne | Bannière ; lecture du cache TanStack Query maintenue ; écritures refusées proprement |
| Node absent du PATH | Écran d'installation : bouton principal « Installer Node » (runtime géré, progression visible), instructions manuelles en repli — amendé le 2026-09-17 |
| Port/lockfile corrompu | Suppression du lockfile, nouveau bind, log d'incident |

Logs structurés (JSON) dans `~/Library/Application Support/Raindrop-GUI/logs/`, rotation simple (7 jours).

---

## 8. Tests

- **Sidecar** : tests unitaires du pont contre un **fake MCP server in-process** — typage des 22 endpoints, timeout, throttle 429, gestion du lockfile, cycle de vie subprocess. **Moteur d'analyse** testé contre un **serveur HTTP local de simulation** (200, 301→nouvelle URL, 404, 405, 403 anti-bot, timeout, DNS invalide) : classification, retry, normalisation d'URL pour les doublons. Tests d'intégration réels (vrai serveur MCP + vraie API) activés uniquement si `RAINDROP_TEST_TOKEN` est présent, sinon skippés.
- **Front** : Vitest + Testing Library sur les pièces critiques — page Revue de l'action (compteur exact, désélection, case bloquante niveau 1, frappe « SUPPRIMER » niveau 2, export CSV), recherche avec filtres, multi-sélection, barre d'actions.
- **Pas d'E2E Tauri en Phase 1** ; le webview tourne en pur navigateur en dev (Playwright possible en Phase 2).

---

## 9. Critères de succès

1. Scroll fluide (virtualisé) sur 5 000+ bookmarks.
2. Session de nettoyage typique — audit → vue doublons → sélection → revue → corbeille — en moins de 2 minutes.
3. Zéro action irréversible exécutable sans frappe « SUPPRIMER » ; toute suppression passe par la corbeille Raindrop — seul le vidage de la corbeille (vue Corbeille) est définitif.
4. Bibliothèque visible en moins de 5 s après le lancement de l'app (sidecar + MCP warm).
5. Un crash du subprocess MCP se répare en un clic, sans perte de l'état de navigation.
6. Un scan complet des liens (5 000+ URLs) affiche une progression en temps réel, est annulable, et ses résultats partiels sont consultables pendant le scan ; les re-scans incrémentaux ne revérifient que le nécessaire.

---

## 10. Risques et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| `@kud/mcp-raindrop-io` peu maintenu (v1.3.1, un seul fichier source, adoption faible) — **confirmé le 2026-09-16 : repo archivé upstream** (README redirige vers un serveur MCP officiel Raindrop, OAuth 2.1) | Bugs non corrigés, blocages | Dépendance épinglée + abstraction tool-par-tool (rebranchement REST direct sans toucher au front) — la mitigation prévue s'applique ; migration = option Phase 2, candidat identifié et évalué en **§10.1** (cf. `check_sources.py`, source `mcp/adeze`) |
| Limites API Raindrop (120 req/min, 50/page) | Lenteur perçue sur gros volumes | Recherche-d'abord, `bulk_raindrops`, jobs SSE, throttle |
| stdio sérialise les appels MCP | Opérations en masse lentes | Jobs asynchrones + progression ; bulk côté serveur Raindrop |
| Scan de liens externes (sites lents, anti-bot, réseau local) | Faux positifs, durée du scan | Catégorie `indéterminé` (vérification manuelle), retry + timeout, cache horodaté, scans incrémentaux, concurrence limitée |
| Endpoint interne Stella indisponible | — | Hors Phase 1 (voir §12) |


### 10.1 Reprise du pont MCP — candidat évalué (2026-09-16)

Le pont épinglé étant archivé, l'écosystème a été passé en revue. Un seul
serveur MCP Raindrop est encore vivant : **`adeze/raindrop-mcp` v2.4.5**
(MIT, TypeScript, dernier push 2026-07 — v2.4.5 publiée en 2026-03). Constats établis **en
lisant le JS publié** (`npm pack`), pas sa documentation :

| Ce qu'il apporterait | Ce qu'il coûterait |
|---|---|
| `bookmark_manage` pose `link` dans la charge de mise à jour : **l'URL est modifiable** → supprime le trap n°1 et l'appel REST direct de correction des redirections (`sidecar/direct/raindropRest.ts`) | **Ses vingt tools portent des noms entièrement différents** de kud : réécriture de la couche d'appel MCP, du serveur MCP factice et des tests qui en dépendent |
| Rate limiting réel embarqué (`rate-limiter-flexible`) là où le 429 nous est **invisible** à travers kud (trap n°2) | Tire **`openai`** (SDK LLM, dans une phase dont le périmètre exclut l'IA) et **`express`** (second serveur HTTP à côté de Hono) dans l'arbre de dépendances du sidecar |
| Cache (`keyv`) et OAuth2 (`RAINDROP_CLIENT_ID/SECRET/REDIRECT_URI`) — cf. §12 | **Aucun tool `unrestore`** en 2.4.5 : l'appel REST direct reste nécessaire de toute façon |
| Transport **stdio présent dans le binaire** (vérifié dans `build/index.js`, avec arrêt propre SIGINT/SIGTERM) : notre modèle de spawn (§2, §3.1) resterait valable | Un pont actif reste un pont tiers : le risque de §10 change de titulaire, il ne disparaît pas |

**Décision : on ne migre pas en Phase 1.** Le pont épinglé fonctionne, il est
couvert par des tests, et le seul manque qu'il nous impose (l'URL) est déjà
contourné par une abstraction prévue pour ça. Migrer en cours de route
casserait la couche testée pour un bénéfice que le contournement rend faible.

**Ce qui ferait basculer** : une panne réelle du pont épinglé (l'API Raindrop
change, un bug non corrigé), ou un besoin Phase 2 qui dépende de ce que kud
n'a pas. La sonde `mcp/adeze` surveille les deux signaux utiles — une majeure
(le coût de migration est dans les noms de tools) et l'apparition d'un
`unrestore`.

---

## 11. Hors périmètre (Phase 1)

Multi-utilisateur, auto-hébergement, réplication/sync locale des données (Raindrop reste la seule source de vérité — le cache d'analyse §5.1 est un artefact recalculable, pas une réplique), écriture des highlights (lecture seule en Phase 1), import/export autre que le CSV de revue.

---

## 12. Phase 2 (aperçu, spec séparée à venir)

- **Agent IA** : chat + multi-opérations (« range tout ce qui parle d'IA dans une collection dédiée ») avec **plan validé via la page Revue de l'action** avant exécution ; enrichissement (résumés, suggestions de tags). Usage validé avec l'utilisateur : les quatre cas (chat, nettoyage assisté, enrichissement, agent multi-opérations) sont souhaités.
- Choix LLM à trancher en Phase 2 : Claude API et/ou modèles locaux (Ollama/LM Studio) — karakeep et Linkwarden montrent les deux voies (API cloud et tagging local Ollama).
- **Liste d'exclusions d'audit** (pattern Bookmarks Organizer) : petit état local d'items/URLs à ignorer lors des scans. (La détection des liens morts et redirections est passée en Phase 1 via le moteur d'analyse local, §5.1.)
- **Moteur de règles** (inspiration karakeep/Linkwarden) : « si domaine X alors collection Y » appliqué en job.
- **Tag automatique des résultats d'analyse** (inspiration buku `--tag-error`/`--tag-redirect`, analysé le 2026-09-16) : taguer les bookmarks selon le verdict du scan (ex. `http:404`, `à-revoir`, `redirect`) — rend les résultats visibles dans Raindrop lui-même et depuis tout client ; complément de la liste d'exclusions d'audit. Toute écriture en masse passe par la page Revue.
- **Quick win « copie archivée »** sur les liens morts de la vue Liens cassés : d'abord la **copie permanente Raindrop** de l'utilisateur quand `cache.status === "ready"` (c'est son propre archivage Pro, cf. ci-dessous) ; à défaut seulement, repli sur Wayback Machine (`https://web.archive.org/web/*/<url>`, inspiration buku `--cached`, pas d'API, un simple lien web).
- **Correction de redirection : conserver l'ancienne URL** (inspiration buku, qui conserve l'ancienne URL en métadonnée) — option « noter l'ancienne URL » dans la note du bookmark lors du « Remplacer par l'URL finale ».
- **Spike Stella** optionnel : rétro-ingénierie de l'endpoint interne de l'app web (aucune API publique au 2026-09-15) pour la recherche sémantique ; réutilisation de l'abonnement Pro. Fragilité assumée.
- Archivage de pages (link rot) : capacité **Pro côté Raindrop**, non exposée par le MCP — mais **bien exposée par l'API REST** (relu le 2026-09-16, correction d'une affirmation antérieure) : `GET /raindrop/{id}/cache` pour la copie permanente, et le champ `cache.status` (`ready`, `retry`, `failed`, `invalid-origin`, `invalid-timeout`, `invalid-size`) parmi les champs d'un raindrop. Rien ne bloque techniquement : ce n'est plus une veille, c'est une décision. ✅ **Tranché en réel le 2026-09-16** : `cache` **figure dans la réponse de liste** (`{status, created, size}`) — le snapshot le porte donc **gratuitement**, sans une requête de plus par lien mort. Le champ serveur `broken` y figure aussi (point de comparaison gratuit avec notre verdict local, sans rien changer à §5.1). Alternative locale : un module type **ArchiveBox** piloté en job (piste relevée via gosuki).
- **OAuth2 à la place du token collé** (relevé le 2026-09-16 : supporté par `adeze/raindrop-mcp` via `RAINDROP_CLIENT_ID/SECRET/REDIRECT_URI`, et par `dedene/raindrop-cli` par redirect local) — supprimerait l'étape « coller un token » du premier lancement (**§6**). Dépend du pont : à trancher avec §10.1, pas avant.
- **Formats d'export élargis** — **l'API les fournit nativement** (relu le 2026-09-16) : `GET /raindrops/{collectionId}/export.{format}` en `csv`, `html` ou `zip`, `collectionId: 0` pour toute la bibliothèque, avec passage de `sort` et `search`. `dedene/raindrop-cli` n'en est qu'un consommateur — le coût est **un appel REST**, pas un moteur d'export. Reste un **changement de périmètre** : §11 exclut aujourd'hui tout import/export autre que le CSV de revue. À rouvrir explicitement.
- **Mode lecture sans distraction** (inspiration mymind, analysé le 2026-09-16) : lire l'article dans l'app plutôt que d'ouvrir le navigateur, sur **la copie permanente Pro déjà payée** (`cache.status === "ready"`). Forme retenue chez mymind : deux volets — le texte à gauche en serif sur ~66 caractères, un rail de métadonnées à droite. Chez nous le panneau détail tient déjà ce rôle ; le mode lecture est son extension pleine largeur. **Prérequis** : `cache` exposé par `toRaindropItem` (dette ROADMAP). Sans IA — le TLDR de mymind relève de l'agent §12. ✅ **Tranché le 2026-09-20, livré le 2026-09-21** (spec `2026-09-19-lecture-et-page-web-design.md`) ; la fenêtre webview de la page réelle y est ajoutée comme geste DISTINCT du navigateur système — fenêtre du shell, zéro capability. **Amendé le 2026-09-22 (spec inversion)** : la lecture n'est plus « l'extension pleine largeur » de la fiche — le clic de bibliothèque ouvre la lecture et la fiche l'accompagne en colonne ; le rail dessiné ici a cédé sa place à une ligne de tête (spec `2026-09-22-inversion-fiche-lecture-design.md`).
- **Tri « Garder / Oublier »** (inspiration mymind « Serendipity », analysé le 2026-09-16 — l'app présente des cartes tirées au hasard avec deux cibles, *Keep* et *Forget*). Recadré en outil de diagnostic : nos compteurs ne voient que ce qu'une analyse automatique détecte, et **un lien vivant devenu inutile n'est détectable par personne**. Sur 12 210 items, c'est probablement le gros du bruit. Mécanique : tirage aléatoire, décision item par item, « Oublier » = mise à la corbeille (niveau 1, réversible, §4.3). **Prérequis** : corbeille livrée (Tasks 8 + 0b).
- **Sélecteur de densité de mosaïque** (inspiration mymind) : trois densités, choisies par un pictogramme dont la propre densité est celle du résultat — 2, 3, 4 colonnes. Zéro libellé. À rapprocher de DESIGN.md §8, qui fige aujourd'hui une largeur de tuile unique.
- Packaging du sidecar en binaire autonome, E2E (Playwright), écriture des highlights.

---

## 13. Références

- Serveur MCP : `@kud/mcp-raindrop-io` (https://github.com/kud/mcp-raindrop-io) — 22 tools, transport stdio, auth `MCP_RAINDROPIO_TOKEN`.
- API Raindrop.io : https://developer.raindrop.io (120 req/min, pagination 50, aucune API IA/Stella au 2026-09-15).
- SDK MCP : `@modelcontextprotocol/sdk` (client), transport stdio.
- Inspirations UX (analysées le 2026-09-15) : [karakeep](https://github.com/karakeep-app/karakeep) (composer d'ajout permanent, tags cliquables, vues, mode bulk), [Linkwarden](https://github.com/linkwarden/linkwarden) (confirmation collections/bulk/sombre), [Bookmarks Organizer](https://addons.mozilla.org/fr/firefox/addon/bookmarks-organizer/) (catégories d'audit, scan progressif, exclusions, redirections).
- **Revue de l'écosystème Raindrop (2026-09-16)** : [`adeze/raindrop-mcp`](https://github.com/adeze/raindrop-mcp) — v2.4.5, actif, MIT : **seul serveur MCP Raindrop encore maintenu**, retenu comme candidat de reprise (§10.1) et mis sous surveillance (`docs/SOURCES.md` §2.2). [`dedene/raindrop-cli`](https://github.com/dedene/raindrop-cli) — Go, v0.1.1, 11 étoiles, sans push depuis 2026-02 : trop jeune pour être une dépendance et étranger à un sidecar Node, retenu pour ses **idées** d'export/import (§12). Écartés : `raindropio/extensions` (archivé 2020), `raindrop-io-py` (mainteneur désengagé), diverses CLI tierces invérifiables — aucune n'apporte quoi que ce soit à une GUI Tauri à sidecar Node.
- **[mymind](https://mymind.com) — analysé le 2026-09-16**, pages produit *et* application réelle (session authentifiée, captures dans `.playwright-mcp/`). **C'est l'inverse philosophique de cet outil** : « Remember everything. Organize nothing. », zéro dossier, rangement par IA, capture sans friction — pour quelqu'un qui n'a pas le problème d'une bibliothèque de 12 210 liens à réparer. L'essentiel de ses fonctionnalités est donc verrouillé par §3/§12 (IA, OCR, recherche sémantique, classement auto) ou contredit DESIGN.md §9 (« Pas de cartes pour une liste »). **Retenu, en Phase 1** : le rendu piloté par la nature du contenu (chez eux c'est littéralement `<mymind-card class="article|video|note">`, le type est le sélecteur CSS) et les puces de filtre révélées au focus de la recherche → DESIGN.md §2.1 et §11, plan 2 Tasks 6b/7b. **Renvoyé en §12** : mode lecture, tri Garder/Oublier, sélecteur de densité. **Écarté** : les Spaces (bulles en dégradé générées, deux espaces se ressemblent — notre signalétique §4 porte une information qu'elles n'ont pas), la capture (extension, share sheet, conversion PDF — §11 exclut l'import), les notes liées `[[` et le résumé auto (exigeraient notre propre store de contenu, contre l'invariant d'écriture). **Point de confirmation utile** : mymind sépare spontanément forme et couleur — glyphes de type monochromes, anneau coloré sur les étiquettes — alors qu'aucune contrainte ne l'y oblige. Et il ne colore **aucun** tag dans le produit (tous `#E3E7EE`/`#748297`), réservant sa seule teinte à l'action primaire : posture cohérente, exactement inverse de la nôtre (§6 : pas d'accent de marque, la couleur porte le sens).
- Autres sources analysées le 2026-09-16 : [buku](https://github.com/jarun/buku) (tags automatiques d'erreurs/redirections, conservation de l'ancienne URL à la correction, Wayback Machine, refresh multi-threadé — retenu partiellement, cf. §12), [GoSuki](https://gosuki.net) (agrégation multi-sources navigateurs/GitHub/Reddit, dossiers→tags, sync P2P — hors périmètre : Raindrop reste la source de vérité ; piste ArchiveBox pour l'archivage local).
