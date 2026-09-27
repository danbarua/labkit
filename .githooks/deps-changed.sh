#!/usr/bin/env bash
# Prints a notice when the dependency files differ between two commits: `deps-changed.sh <from> <to>`.
# Shared by post-merge, post-checkout and post-rewrite. Never fails the git command that ran it.
from=${1:-}
to=${2:-HEAD}
[ -n "$from" ] || exit 0
git rev-parse -q --verify "$from^{commit}" >/dev/null 2>&1 || exit 0
changed=$(git diff --name-only "$from" "$to" -- bun.lock package.json 'packages/*/package.json' 2>/dev/null)
[ -n "$changed" ] || exit 0
echo >&2
echo "Dependencies changed; run: bun install" >&2
echo "$changed" | sed 's/^/  /' >&2
exit 0
