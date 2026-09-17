# Raindrop-GUI

GUI desktop macOS pour Raindrop.io — **Phase 1 livrée** : shell Tauri
(fenêtre, cycle de vie du sidecar, trousseau macOS), front React
(bibliothèque, nettoyage, palette, Revue) et sidecar Node (pont MCP épinglé,
API REST locale, moteur d'analyse). L'application se construit et
s'empaquete depuis ce dépôt. Conventions et décisions structurantes :
`CLAUDE.md` et la spec (`docs/superpowers/specs/2026-09-15-raindrop-gui-design.md`).

## Construire l'application

```bash
npm run build:app     # vérifications, tests, cliquet de tailles, .app + .dmg
npm run release       # build complet, puis archives dans bundles/ (envoi GitHub en y/N)
```

`build_app.py` échoue tôt et clairement (épinglage MCP 1.3.1 contrôlé dans
`package.json` ET `package-lock.json`, Node ≥ 20 résolu, cargo présent,
plafond de 400 lignes par fichier), puis contrôle le résultat : le sidecar
est-il VRAIMENT embarqué dans le `.app`, le MCP à la bonne version dedans.

La signature est **ad-hoc** (pas de Developer ID) : au premier lancement,
Gatekeeper met l'app en quarantaine —
`xattr -dr com.apple.quarantine "Raindrop GUI.app"` la lève.

Au premier lancement, l'app demande le jeton d'API Raindrop, le vérifie
auprès de l'API (le compte détecté s'affiche) et le range au **trousseau
macOS** — le même enregistrement que le développement ci-dessous.

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

```bash
npm test                                   # tout (fakes in-process, réseau local only)
RAINDROP_TEST_TOKEN=<token> npm test       # + intégration réelle (sidecar/integration.test.ts)
npm run typecheck && npm run typecheck:front
npm run build:sidecar                      # build dist-sidecar/
cd src-tauri && cargo test                 # le shell Rust (modules purs + contrats)
```

Veille des sources externes (MCP kud épinglé, API Raindrop, SDK/hono/zod) :
`python3 tools/check_sources.py` (`--report` / `--update` / `--offline`).
