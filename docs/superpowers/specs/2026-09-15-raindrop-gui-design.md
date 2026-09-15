# Raindrop GUI — Spécification de conception

**Date** : 2026-09-15
**Statut** : Validée en brainstorming, en attente de plan d'implémentation
**Périmètre** : Phase 1 — Bibliothèque + Nettoyage

---

## 1. Contexte et objectifs

Raindrop.io est un gestionnaire de bookmarks en ligne (compte Pro de l'utilisateur, bibliothèque de **plus de 5 000 bookmarks**). L'application web native ne satisfait pas pour deux usages :

1. **Navigation/consultation enrichie** : une interface locale, en français, plus agréable pour sauvegarder, chercher et organiser.
2. **Nettoyage de bibliothèque** : liens cassés, doublons, bookmarks non-taggés, collections vides, corbeille — avec vues dédiées et actions en masse sûres.

La GUI pilote Raindrop.io **via le serveur MCP `@kud/mcp-raindrop-io`** (exigence explicite), qui expose 22 tools couvrant l'API Raindrop : bookmarks (6), collections (7), tags (2), highlights (2), user/import (3), utilitaires (2 : `library_audit`, `empty_trash`).

### Décisions structurantes (validées avec l'utilisateur)

| Sujet | Décision |
|---|---|
| Forme | **App desktop Tauri 2** (macOS) |
| Pont MCP | **Sidecar Node/TypeScript** : client MCP + API HTTP locale exposée au webview |
| Front | React 18 + TypeScript + Vite + Tailwind, TanStack Query + TanStack Virtual |
| Layout bibliothèque | **Trois panneaux** (navigation \| liste \| détail permanent) + palette ⌘K en complément |
| Organisation nettoyage | **Hybride** : dashboard d'audit comme point d'entrée, vues standard pré-filtrées ensuite |
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
3. **Abstraction de secours** : le front ne dépend que de l'API REST locale ; chaque tool est isolé derrière une fonction typée avec **timeout par appel**. Si le package MCP devient un blocage, chaque endpoint peut être rebranché sur des appels REST directs à Raindrop **sans toucher au front**.
4. **Gros volumes** : UX recherche-d'abord. Pas de full scan côté front. Vue par défaut = page courante + infinite scroll (50 items/requête, maximum de l'API Raindrop). `library_audit` ne renvoie que des **compteurs** ; les listes des vues de nettoyage viennent des filtres serveur de `search_raindrops` (`broken`, `duplicates`, `untagged`).
5. **Bulk** : privilégier `bulk_raindrops` (1 appel = N bookmarks) plutôt que N appels unitaires ; les boucles nécessaires passent par des jobs SSE avec progression, jamais bloquants pour l'UI.
6. **Cycle de vie sidecar** : le sidecar bind le port 0, écrit `{port, token, pid}` dans un **lockfile** du dossier app-data (`~/Library/Application Support/Raindrop-GUI/`). Tauri génère le token local et le transmet au sidecar par variable d'environnement au spawn, et au webview par commande Tauri. PID actif = réutilisation (pas de doublon lors des reloads webview/HMR). Crash = notification + bouton « Redémarrer la connexion ».
7. **Superficie HTTP locale** : token Bearer éphémère généré par Tauri au lancement et transmis au webview via commande Tauri (jamais écrit en clair sur disque), vérification de l'`Origin: tauri://localhost` (et `http://localhost:*` en dev), CORS minimal. Résiduel assumé : un process du même utilisateur macOS peut lire l'env du subprocess — négligeable en mono-utilisateur.
8. **Rate limiting** : file d'attente côté sidecar, sérialisation des appels MCP (stdio), back-off exponentiel sur 429, statut visible dans la barre de progression des jobs.

---

## 4. Interface

### 4.1 Vue Bibliothèque (écran principal) — trois panneaux

- **Panneau gauche (navigation)** : collections en arborescence (root + children), liste des tags (avec compteurs), vues fixes : Tous, Favoris, Non-lus, Corbeille. Section repliable.
- **Panneau central (liste)** : bookmarks virtualisés — titre, domaine, extrait, tags, date. Tri (création, titre, domaine). Recherche serveur en entête avec filtres avancés (domaine, type de média, plage de dates, non-taggés, favoris…). Infinite scroll, 50/requête. Multi-sélection par cases à cocher → **barre d'actions en masse** en pied de liste (Corbeille, Déplacer, Tagger).
- **Panneau droit (détail, permanent)** : suit la sélection (clic ou flèches clavier). Aperçu, édition inline (titre, extrait, note, tags, collection), lecture des highlights. Actions : favori, ouvrir l'URL, supprimer (→ corbeille).
- **Palette ⌘K** : recherche universelle (bookmarks, collections, tags, commandes), navigation clavier complète (flèches, Entrée, Échap).

**Ajout de bookmark** : formulaire d'ajout utilisant `parse_url` pour préremplir titre/description et `check_urls_exist` pour alerter si l'URL est déjà sauvegardée (avec lien vers l'existant).

### 4.2 Vue Nettoyage — hybride

- **Dashboard (point d'entrée)** : compteurs issus de `library_audit` (liens cassés, doublons, non-taggés) + collections vides (`get_collections`/`get_child_collections` filtrage côté front) + corbeille. Bouton « Lancer/rafraîchir l'audit » (job SSE si long).
- **Vues de traitement** : cliquer un compteur ouvre la **vue standard à trois panneaux pré-filtrée** (chip « Liens cassés (23) » en entête, filtre serveur actif). Même mécanique de sélection et de barre d'actions que la bibliothèque.
- **Tags** : vue dédiée (liste avec compteurs) — renommer, fusionner, supprimer (`manage_tags`). Fusion = cas d'usage nettoyage majeur.
- **Collections vides** : liste + suppression (`cleanup_collections`, mapping du `confirm: true` MCP sur le niveau de gravité 2 — voir §4.3).
- **Corbeille** : liste consultable, restauration individuelle, « Vider la corbeille » (niveau 2, `empty_trash` avec `confirm: true`).

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

---

## 5. Couche sidecar — API locale

### Surface REST (esprit : 1 endpoint ≈ 1 tool MCP)

| Groupe | Endpoints (indicatifs) |
|---|---|
| Bookmarks | `GET /api/raindrops` (recherche + filtres + pagination), `GET /api/raindrops/:id`, `POST /api/raindrops`, `PATCH /api/raindrops/:id`, `DELETE /api/raindrops/:id`, `POST /api/raindrops/bulk` |
| Collections | `GET /api/collections`, `GET /api/collections/children`, `GET/POST/PATCH/DELETE /api/collections/:id`, `POST /api/collections/cleanup` |
| Tags | `GET /api/tags`, `POST /api/tags/manage` (rename/merge/delete) |
| Highlights | `GET /api/raindrops/:id/highlights`, `POST/PATCH/DELETE` sur `/highlights/:hid` |
| User & import | `GET /api/user`, `POST /api/parse-url`, `POST /api/check-urls` |
| Utilitaires | `POST /api/library-audit`, `POST /api/empty-trash` |
| Jobs | `GET /api/jobs/:id` (statut), `GET /api/jobs/:id/events` (SSE progression) |
| Santé | `GET /api/health` (état MCP, version du serveur) |

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
| Node absent du PATH | Écran de diagnostic au lancement avec instructions |
| Port/lockfile corrompu | Suppression du lockfile, nouveau bind, log d'incident |

Logs structurés (JSON) dans `~/Library/Application Support/Raindrop-GUI/logs/`, rotation simple (7 jours).

---

## 8. Tests

- **Sidecar** : tests unitaires du pont contre un **fake MCP server in-process** — typage des 22 endpoints, timeout, throttle 429, gestion du lockfile, cycle de vie subprocess. Tests d'intégration réels (vrai serveur MCP + vraie API) activés uniquement si `RAINDROP_TEST_TOKEN` est présent, sinon skippés.
- **Front** : Vitest + Testing Library sur les pièces critiques — page Revue de l'action (compteur exact, désélection, case bloquante niveau 1, frappe « SUPPRIMER » niveau 2, export CSV), recherche avec filtres, multi-sélection, barre d'actions.
- **Pas d'E2E Tauri en Phase 1** ; le webview tourne en pur navigateur en dev (Playwright possible en Phase 2).

---

## 9. Critères de succès

1. Scroll fluide (virtualisé) sur 5 000+ bookmarks.
2. Session de nettoyage typique — audit → vue doublons → sélection → revue → corbeille — en moins de 2 minutes.
3. Zéro action irréversible exécutable sans frappe « SUPPRIMER » ; toute suppression passe par la corbeille Raindrop — seul le vidage de la corbeille (vue Corbeille) est définitif.
4. Bibliothèque visible en moins de 5 s après le lancement de l'app (sidecar + MCP warm).
5. Un crash du subprocess MCP se répare en un clic, sans perte de l'état de navigation.

---

## 10. Risques et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| `@kud/mcp-raindrop-io` peu maintenu (v1.3.1, un seul fichier source, adoption faible) | Bugs non corrigés, blocages | Dépendance épinglée, abstraction tool-par-tool permettant un rebranchement direct sur l'API Raindrop sans toucher au front |
| Limites API Raindrop (120 req/min, 50/page) | Lenteur perçue sur gros volumes | Recherche-d'abord, `bulk_raindrops`, jobs SSE, throttle |
| stdio sérialise les appels MCP | Opérations en masse lentes | Jobs asynchrones + progression ; bulk côté serveur Raindrop |
| Endpoint interne Stella indisponible | — | Hors Phase 1 (voir §12) |

---

## 11. Hors périmètre (Phase 1)

Multi-utilisateur, auto-hébergement, réplication/sync locale des données (Raindrop reste la seule source de vérité), écriture des highlights (lecture seule en Phase 1), import/export autre que le CSV de revue.

---

## 12. Phase 2 (aperçu, spec séparée à venir)

- **Agent IA** : chat + multi-opérations (« range tout ce qui parle d'IA dans une collection dédiée ») avec **plan validé via la page Revue de l'action** avant exécution ; enrichissement (résumés, suggestions de tags). Usage validé avec l'utilisateur : les quatre cas (chat, nettoyage assisté, enrichissement, agent multi-opérations) sont souhaités.
- Choix LLM à trancher en Phase 2 : Claude API et/ou modèles locaux (Ollama/LM Studio).
- **Spike Stella** optionnel : rétro-ingénierie de l'endpoint interne de l'app web (aucune API publique au 2026-09-15) pour la recherche sémantique ; réutilisation de l'abonnement Pro. Fragilité assumée.
- Packaging du sidecar en binaire autonome, E2E (Playwright), écriture des highlights.

---

## 13. Références

- Serveur MCP : `@kud/mcp-raindrop-io` (https://github.com/kud/mcp-raindrop-io) — 22 tools, transport stdio, auth `MCP_RAINDROPIO_TOKEN`.
- API Raindrop.io : https://developer.raindrop.io (120 req/min, pagination 50, aucune API IA/Stella au 2026-09-15).
- SDK MCP : `@modelcontextprotocol/sdk` (client), transport stdio.
