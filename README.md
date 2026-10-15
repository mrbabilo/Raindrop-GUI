# Raindrop-GUI

Application macOS pour consulter, organiser et nettoyer une bibliothèque
Raindrop.io. Shell Tauri, interface React et sidecar Node avec API REST locale
et pont MCP épinglé. Interface en français.

**Préversion publiée : [v0.1.0-pre.23](https://github.com/mrbabilo/Raindrop-GUI/releases/tag/v0.1.0-pre.23)**
— 15 octobre 2026, macOS Apple Silicon (arm64).

## Installer la préversion

Télécharger le **DMG** ou le **ZIP** depuis la page de release, puis copier
`Raindrop GUI.app` dans Applications. Le fichier `SHA256SUMS-pre.23.txt`
permet de vérifier les archives téléchargées.

La signature est **ad-hoc**, sans Developer ID ni notarisation Apple : macOS
peut bloquer le premier lancement. Le premier démarrage demande un jeton API
Raindrop, le vérifie et le conserve dans le **trousseau macOS**.

[Notes de version](docs/releases/v0.1.0-pre.23.md) ·
[Changelog](CHANGELOG.md) · [Roadmap](docs/ROADMAP.md)

Cette préversion ajoute la sélection peinte au pointeur, harmonise les survols
et rend les diagnostics lisibles par une icône autant que par leur couleur.
Elle inclut aussi la première passe de la charte UI v2 et le traitement explicite
des doublons devenus introuvables. [DESIGN.md](docs/DESIGN.md) reste la référence ;
la généralisation de la charte et la recette native complète restent ouvertes.

## Ce que fait l'application

- **Bibliothèque** — liste virtualisée (12 000+ signets) et grille de
  vignettes, collections imbriquées, palette ⌘K, édition inline, filtres
  (étiquettes, nature, domaine, dates), recherche composée
  (`#tag`, `domain:`, `type:`), **drag & drop** vers les collections, la
  corbeille, les favoris, « Non classés » et les étiquettes. La sélection
  multiple se peint aussi en maintenant le bouton principal sur les cases à
  cocher traversées, pour sélectionner ou désélectionner une série.
- **Nettoyage** — liens morts, redirections, indéterminés, doublons (tri avec
  consolidation des étiquettes dans le gardé), non-taggés, collections vides,
  corbeille. Filets et pictogrammes distincts rendent chaque diagnostic lisible
  sans dépendre de la couleur. **Restauration partout** : fiche, barre de sélection, drag
  depuis la corbeille. Les opérations de nettoyage utilisent une Revue à
  deux niveaux de confirmation ; déplacer ou mettre à la corbeille depuis
  la sélection agit directement, avec un avis et une action Annuler.
- **Sauvegarde locale** — balayage complet et incrémental de la bibliothèque
  (instantanés JSONL datés, reprise en vol après coupure), archivage des
  copies permanentes Pro avec budget géré et éviction annoncée.
- **Lecture et organisation** — lecture des archives, vues filtrées sauvegardées,
  édition des étiquettes et de la collection, historique de navigation et
  fiche redimensionnable.
- **Journal** — écritures, jobs et erreurs du jour, lisibles dans les
  Réglages (⌘,), copiables pour un rapport.
- **Version et changelog** — l'app affiche sa version et signale une
  publication plus récente (API GitHub du dépôt), notes incluses.
- **Sur le métier** : analyse locale (jamais de requête massive contre des
  tiers sans geste explicite), mise à la corbeille des signets avant suppression
  définitive. Vider la corbeille ou supprimer des collections est irréversible
  et exige la confirmation prévue par la Revue. Analyse d'inspiration produit :
  `docs/KARAKEEP.md`. Ce qui reste : `docs/ROADMAP.md`.

## Construire l'application

Prérequis de développement : Node ≥ 20, npm, Rust/Cargo et outils de compilation
macOS. Installer les dépendances avec `npm ci`. Conventions : [CLAUDE.md](CLAUDE.md)
et [spec produit](docs/superpowers/specs/2026-09-15-raindrop-gui-design.md).

```bash
npm run build:app     # vérifications, tests, cliquet de tailles, .app + .dmg
npm run release       # build complet, puis archives dans bundles/ (envoi GitHub en y/N)
```

`build_app.py` échoue tôt et clairement (épinglage MCP 1.3.1 contrôlé dans
`package.json` ET `package-lock.json`, Node ≥ 20 résolu, cargo présent,
plafond de 400 lignes par fichier), puis contrôle le résultat :
le sidecar embarqué, la version du MCP, la version déclarée dans le bundle et
l’intégrité de sa signature. La signature ad-hoc est explicitement configurée
pour macOS dans `tauri.conf.json`.

Le script `release.py` prépare les archives et propose leur envoi. Pour une
nouvelle publication, incrémenter les versions npm/Cargo/Tauri, vérifier les
artefacts et rédiger les notes avant de créer une release. `pre.22` est déjà
publiée : ne pas réutiliser son tag ni remplacer ses fichiers.

## Développement — l'application complète

```bash
./scripts/dev-sidecar.sh                 # le sidecar, token lu du trousseau
VITE_LOCAL_API_TOKEN=dev-local-token npm run dev   # le front au navigateur (proxy Vite)
npm run tauri:dev                        # la fenêtre native (le shell lance son propre sidecar)
```

Sous `tauri dev`, le front parle directement au sidecar lancé par le shell
Rust (`window.RAINDROP_GUI`) — le proxy Vite est coupé automatiquement.

## Développement — sidecar seul

```bash
npm install
./scripts/dev-sidecar.sh   # token Raindrop lu du trousseau macOS (service « raindrop-api-token »)
```

Enregistrement du token dans le trousseau (une seule fois, saisie interactive
— il n'apparaît ni dans l'historique du shell ni dans `ps`) :

```bash
security add-generic-password -s "raindrop-api-token" -a "$USER" -U -w
```

Alternative directe (token en variable d'environnement) :

```bash
npm run dev:sidecar        # tsx watch
```

Variables d'environnement (voir `sidecar/config.ts`) :

| Variable | Défaut | Rôle |
|---|---|---|
| `MCP_RAINDROPIO_TOKEN` | — (requis) | token API Raindrop, transmis au subprocess MCP |
| `LOCAL_API_TOKEN` | `dev-local-token` | Bearer attendu par l'API locale |
| `APPDATA_DIR` | `~/Library/Application Support/Raindrop-GUI` | lockfile, cache analyse, logs |
| `RAINDROP_MCP_ENTRY` | `node_modules/@kud/mcp-raindrop-io/dist/index.js` | point d'entrée du subprocess MCP (épinglé 1.3.1) |
| `MCP_TIMEOUT_MS` | `30000` | timeout par appel tool MCP |
| `MIN_CALL_INTERVAL_MS` | `550` | espacement des appels MCP (limite 120 req/min) |
| `LINK_CONCURRENCY` | `6` | concurrence du link checker (analyse locale) |
| `LINK_TIMEOUT_MS` | `10000` | timeout par requête HTTP du link checker |
| `ANALYSIS_TTL_DAYS` | `30` | fraîcheur des résultats d'analyse (re-scan incrémental) |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` — logs JSONL, rétention 7 j |

Smoke test :

```bash
APPDATA_DIR=/tmp/rg LOCAL_API_TOKEN=dev-local-token MCP_RAINDROPIO_TOKEN=<vrai-token> npx tsx sidecar/index.ts &
PORT=$(python3 -c "import json;print(json.load(open('/tmp/rg/sidecar.json'))['port'])")
curl -s -H "Authorization: Bearer dev-local-token" "http://127.0.0.1:$PORT/api/health"
```

## Tests

Validation de `v0.1.0-pre.23` : **1 282 tests Vitest**, **88 tests navigateur**
et **73 tests Rust** réussis ; deux tests Vitest et deux tests Rust ignorés.
Types, builds, contrôle de taille, signature, ZIP et DMG vérifiés. Les tests
navigateur utilisent une API simulée ; validation native interactive et tests
sur un compte réel restent au suivi. Voir les [résultats UI](e2e/VALIDATION.md).


```bash
npm test                                   # tout (fakes in-process, réseau local only)
RAINDROP_TEST_TOKEN=<token> npm test       # + intégration réelle (sidecar/integration.test.ts)
npm run typecheck && npm run typecheck:front
npm run build:sidecar                      # build dist-sidecar/
cd src-tauri && cargo test                 # le shell Rust (modules purs + contrats)
```

Validation UI dans Chromium et WebKit (front compilé, API simulée, sans compte) :

```bash
npx playwright install chromium webkit
npm run typecheck:ui      # types du harnais navigateur
npm run test:ui           # tous les parcours, régressions d’audit incluses
npm run test:ui:audit     # régressions issues de l’audit
npm run test:ui:report    # captures et traces dans le rapport HTML
```

Matrice clair/sombre, formats de fenêtre, mode visible et limites :
[e2e/README.md](e2e/README.md).

Veille des sources externes (MCP kud épinglé, API Raindrop, SDK/hono/zod) :
`python3 tools/check_sources.py` (`--report` / `--update` / `--offline`).
