#!/usr/bin/env bash
# Assemble ce que le .app doit emporter : le sidecar compilé et ses
# dépendances d'EXÉCUTION seulement (appelé par beforeBuildCommand de
# tauri.conf.json, et donc à chaque `tauri build`).
#
# Pourquoi une installation à part plutôt qu'une copie de node_modules/ :
# l'arbre de développement porte Vite, Vitest, TypeScript et Playwright —
# des centaines de mégaoctets qui n'ont rien à faire dans l'application.
set -euo pipefail
cd "$(dirname "$0")/.."

RES="src-tauri/ressources"
ETAPE="$(mktemp -d)"
trap 'rm -rf "$ETAPE"' EXIT

echo "[ressources] compilation du sidecar"
npm run build:sidecar >/dev/null

echo "[ressources] dépendances de production"
cp package.json package-lock.json "$ETAPE/"
( cd "$ETAPE" && npm ci --omit=dev --ignore-scripts >/dev/null )

echo "[ressources] assemblage"
rm -rf "$RES"
mkdir -p "$RES"
cp -R dist-sidecar "$RES/dist-sidecar"
cp -R "$ETAPE/node_modules" "$RES/node_modules"

# Contrôles : le paquet MCP épinglé DOIT être là, à la bonne version, et
# l'entrée du sidecar doit exister — deux pannes qui, sinon, ne se verraient
# qu'au premier lancement de l'app livrée.
VERSION=$(python3 -c "import json;print(json.load(open('$RES/node_modules/@kud/mcp-raindrop-io/package.json'))['version'])")
[ "$VERSION" = "1.3.1" ] || { echo "[ERROR] MCP attendu en 1.3.1, trouvé $VERSION" >&2; exit 1; }
[ -f "$RES/dist-sidecar/sidecar/index.js" ] || { echo "[ERROR] entrée du sidecar absente ($RES/dist-sidecar/sidecar/index.js)" >&2; exit 1; }

echo "[ressources] prêt — $(du -sh "$RES" | cut -f1)"
