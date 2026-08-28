#!/usr/bin/env bash
# Prints the host-port offset for this worktree, and the five ports it implies.
#
# **The main checkout gets 0**, so `docker compose ps`, a log line and a curl on
# `localhost:5432` all say what they have always said for the person doing
# reviews on `main`. Every other worktree gets a deterministic offset, so two
# stacks can be up at once without competing for one set of ports.
#
# ## Why a hash and not an index
#
# `git worktree list` has an order, and an index into it is **not stable**:
# removing a worktree shifts every later one, so a stack that was on 18902
# silently becomes a different worktree's port. That reintroduces the defect
# this exists to fix, and it does it during `git worktree remove`, which is
# exactly when nobody is thinking about ports.
#
# A hash of the worktree's own path is stable for that worktree's whole life and
# needs no registry to consult. The cost is that two paths can collide, which is
# why this refuses rather than guesses -- see below.
#
# ## The failure this prevents, observed 2026-08-28
#
# `bun run spike:web` in one checkout while another worktree's stack was up: the
# database could not bind 5432, `localhost:8899/healthz` answered
# `{"ok":true,...}`, and that was **the other worktree's server**. Nothing
# errored. `spike:web:down` could not stop it either, because compose derives
# its project name from the directory and that resolved elsewhere.
#
# Ports are only half the fix. `/healthz` and `labkit --version` now say which
# worktree answered, so a stray curl on a port you did not expect is
# self-diagnosing rather than confidently green.
#
# Usage:  bun run ports          # show them
#         eval "$(scripts/worktree-ports.sh --export)"
set -euo pipefail

# Base ports, and the container port each maps to. Kept here rather than in
# `docker-compose.yml` so one file decides, and the compose file reads
# `${LABKIT_PORT_*}` with these as its defaults.
BASE_DB=5432
BASE_WEB=8899
BASE_POOLER=6432
BASE_ALPHA=8901
BASE_BETA=8902

toplevel=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo "")

# The main checkout is the one whose working tree is the parent of the single
# `.git` every worktree shares -- the same discriminator `resolveProjectRoot`
# uses in `src/db/connect.ts`, one question over.
offset=0
if [ -n "$toplevel" ] && [ -n "$common" ] && [ "$toplevel" != "$(dirname "$common")" ]; then
  # 10000-19999, so every port stays well clear of its base and of 65535
  # (8902 + 19999 = 28901). `cksum` rather than sha256sum: it is POSIX and on
  # every machine this runs on, and this needs determinism, not strength.
  h=$(printf '%s' "$toplevel" | cksum | cut -d' ' -f1)
  offset=$((10000 + h % 10000))
fi

# **A collision is refused, not rounded off.** Two worktree paths hashing to one
# offset would put two stacks back on one set of ports -- the original defect,
# arrived at by a route that looks deliberate. Every worktree is knowable here,
# so this is checkable rather than a risk to accept quietly.
if [ -n "$common" ]; then
  clash=$(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}' |
    while read -r wt; do
      if [ "$wt" = "$(dirname "$common")" ]; then
        echo "0 $wt"
      else
        echo "$((10000 + $(printf '%s' "$wt" | cksum | cut -d' ' -f1) % 10000)) $wt"
      fi
    done | sort -n | awk 'NR > 1 && $1 == prev { print prev_line "\n" $0 } { prev = $1; prev_line = $0 }')
  if [ -n "$clash" ]; then
    echo "FAILED: two worktrees hash to one port offset:" >&2
    echo "$clash" >&2
    echo "  Rename or move one of them. Ports are derived from the path." >&2
    exit 1
  fi
fi

PORT_DB=$((BASE_DB + offset))
PORT_WEB=$((BASE_WEB + offset))
PORT_POOLER=$((BASE_POOLER + offset))
PORT_ALPHA=$((BASE_ALPHA + offset))
PORT_BETA=$((BASE_BETA + offset))

if [ "${1:-}" = "--export" ]; then
  printf 'export LABKIT_PORT_DB=%s\n' "$PORT_DB"
  printf 'export LABKIT_PORT_WEB=%s\n' "$PORT_WEB"
  printf 'export LABKIT_PORT_POOLER=%s\n' "$PORT_POOLER"
  printf 'export LABKIT_PORT_ALPHA=%s\n' "$PORT_ALPHA"
  printf 'export LABKIT_PORT_BETA=%s\n' "$PORT_BETA"
  exit 0
fi

name=$([ -n "$toplevel" ] && basename "$toplevel" || echo "(not a git worktree)")
printf '%s  offset %s%s\n' "$name" "$offset" \
  "$([ "$offset" = 0 ] && echo '  (the main checkout keeps the defaults)' || echo '')"
printf '  db      %s\n  web     %s\n  pooler  %s\n  alpha   %s\n  beta    %s\n' \
  "$PORT_DB" "$PORT_WEB" "$PORT_POOLER" "$PORT_ALPHA" "$PORT_BETA"
