#!/usr/bin/env bash
# docker compose for this package, with this worktree's host ports.
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
eval "$("$here/worktree-ports.sh" --export)"
exec docker compose -f "$here/../docker-compose.yml" --project-directory "$here/.." "$@"
