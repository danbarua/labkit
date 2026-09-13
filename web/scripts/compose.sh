#!/usr/bin/env bash
# Shared Postgres for every checkout. HTTP isolation is Vite's job.
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
export LABKIT_PORT_DB=5432
exec docker compose --project-name labkit-web -f "$here/../docker-compose.yml" --project-directory "$here/.." "$@"
