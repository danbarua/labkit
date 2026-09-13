#!/usr/bin/env bash
# docker compose for this package, with this worktree's host ports.
#
# Project name is labkit-web on the main checkout, labkit-web-<offset>
# on every other worktree. Directory-default `web` would let db:down in one
# checkout control another's stack.
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
eval "$("$here/worktree-ports.sh" --export)"
offset=$((LABKIT_PORT_DB - 5432))
if [ "$offset" -eq 0 ]; then
  project=labkit-web
else
  project=labkit-web-$offset
fi
exec docker compose --project-name "$project" -f "$here/../docker-compose.yml" --project-directory "$here/.." "$@"
