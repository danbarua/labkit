#!/usr/bin/env bash
# Load this worktree's LABKIT_PORT_* then exec the rest of argv.
#
# Ports come from ./worktree-ports.sh. The main checkout keeps 5432/8899/8850.
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
eval "$("$here/worktree-ports.sh" --export)"
exec "$@"
