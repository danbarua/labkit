#!/usr/bin/env bash
# Load this worktree's LABKIT_PORT_* then exec the rest of argv.
#
# Ports come from ../../scripts/worktree-ports.sh. The main checkout keeps
# 5432/8899/8850. Every other worktree gets a path-hash offset. Do not pass
# literal 5432/8899/8850 from web scripts.
set -euo pipefail
root=$(git rev-parse --show-toplevel)
eval "$("$root/scripts/worktree-ports.sh" --export)"
exec "$@"
