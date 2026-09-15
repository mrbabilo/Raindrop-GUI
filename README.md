# Raindrop-GUI

GUI desktop macOS pour Raindrop.io. **Phase 1 : sidecar complet** (pont MCP,
API REST locale, moteur d'analyse) ; front React et shell Tauri : plans
suivants. Conventions et décisions structurantes : `CLAUDE.md` et la spec
(`docs/superpowers/specs/2026-09-15-raindrop-gui-design.md`).

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
npm run typecheck                          # tsc --noEmit
npm run build:sidecar                      # build dist-sidecar/ (plan 3 : spawn par Tauri)
```

Veille des sources externes (MCP kud épinglé, API Raindrop, SDK/hono/zod) :
`python3 tools/check_sources.py` (`--report` / `--update` / `--offline`).
