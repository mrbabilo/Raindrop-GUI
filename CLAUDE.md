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
`docs/DOMAINE.md`** (vocabulaire métier) et la **spec**
(`docs/superpowers/specs/2026-09-15-raindrop-gui-design.md`), qui fait foi sur
les décisions structurantes.

## Sources à consulter

- `docs/superpowers/specs/2026-09-15-raindrop-gui-design.md` — la spec. Les
  corrections contraignantes (§3) l'emportent sur toute implémentation.
- `docs/superpowers/plans/` — plans d'implémentation (3 plans séquentiels :
  sidecar → front React → shell Tauri). Chaque plan est autosuffisant.
- `docs/DOMAINE.md` — vocabulaire métier Raindrop + catégories d'analyse.
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
  obligatoire**, restaurer « à l'origine » n'existe pas côté API (spec §4.2).
- **`cache` et `broken` arrivent dans la réponse de liste** (vérifié le
  2026-09-16) : la copie permanente Pro (`cache.status === "ready"`) et le
  verdict serveur sont **gratuits** dans le snapshot, sans requête par item.
- **Ne jamais commiter** : `MCP_RAINDROPIO_TOKEN`, `RAINDROP_TEST_TOKEN`,
  lockfile `sidecar.json`, `analysis.json` — tout vit dans app-data ou le
  trousseau, hors du dépôt.

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
