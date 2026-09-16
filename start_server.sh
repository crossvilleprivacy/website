#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
port="${1:-${PORT:-8000}}"

echo "Serving $(pwd) at http://127.0.0.1:${port}/"
exec python3 -m http.server "$port" --bind 127.0.0.1
