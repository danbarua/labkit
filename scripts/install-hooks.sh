#!/usr/bin/env bash
# Points git at .githooks/, which a clone or worktree does not do for itself.
#
# Git hooks are not cloned and `core.hooksPath` is per-repository config, so
# every fresh clone and every new worktree starts with no hooks at all — and
# silently, which is the property that matters for the one hook here. Run this
# once. It is idempotent.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
current="$(git -C "$root" config --get core.hooksPath || true)"

if [ "$current" = ".githooks" ]; then
  echo "OK: core.hooksPath is already .githooks"
else
  git -C "$root" config core.hooksPath .githooks
  echo "OK: core.hooksPath set to .githooks (was ${current:-unset})"
fi

for hook in "$root"/.githooks/*; do
  [ -f "$hook" ] || continue
  if [ ! -x "$hook" ]; then
    echo "FAILED: $(basename "$hook") is not executable — chmod +x it" >&2
    exit 1
  fi
  echo "  $(basename "$hook") — $(sed -n '2s/^# //p' "$hook")"
done
