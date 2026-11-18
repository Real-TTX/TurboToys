#!/usr/bin/env sh
# Rebuilds and starts the local MatGame stack with TurboToys in it (TurboToys is a plugin of MatGame: ../MatGame).
# Usage: ./scripts/redeploy.sh [--clean]
set -e
here=$(cd "$(dirname "$0")" && pwd)
matgame="$here/../../MatGame/scripts/redeploy.sh"
if [ ! -f "$matgame" ]; then
    echo "MatGame fehlt: TurboToys laeuft als Plugin von MatGame. Bitte https://github.com/Real-TTX/MatGame neben dieses Repository klonen." >&2
    exit 1
fi
exec sh "$matgame" "$@"
