#!/usr/bin/env bash
# Lance le sidecar en dev avec le token Raindrop lu du trousseau macOS.
#
# Le token n'est pas stocké ici : il est lu au démarrage depuis le trousseau.
# Il ne traîne donc ni dans le dépôt, ni dans l'historique du shell, ni dans
# la liste des processus.
#
# Enregistrement (une seule fois — la commande demande le token sans l'écrire
# dans l'historique) :
#
#   security add-generic-password -s "raindrop-api-token" -a "$USER" -U -w
#
set -euo pipefail

KEYCHAIN_SERVICE="raindrop-api-token"

if ! token=$(security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$USER" -w 2>/dev/null); then
    cat >&2 <<EOF
[dev-sidecar] Token Raindrop introuvable dans le trousseau (service « $KEYCHAIN_SERVICE »).

Enregistrez-le une fois — la saisie est interactive, le token n'apparaît
ni dans l'historique du shell ni dans « ps » :

    security add-generic-password -s "$KEYCHAIN_SERVICE" -a "\$USER" -U -w

EOF
    exit 1
fi

export MCP_RAINDROPIO_TOKEN="$token"
export LOCAL_API_TOKEN="${LOCAL_API_TOKEN:-dev-local-token}"
cd "$(dirname "$0")/.."
exec npm run dev:sidecar
