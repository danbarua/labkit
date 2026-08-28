#!/usr/bin/env bash
# Points git at .githooks/, which a fresh clone does not do for itself.
#
# Git hooks are not cloned, so a clone starts with none at all — and silently,
# which is the property that matters for the one hook here. Run once; idempotent.
# `bun install` runs it, because that is the command a fresh clone cannot skip.
#
# **A worktree does NOT need this, and this comment claimed otherwise until
# 2026-08-28.** `core.hooksPath` is *per-repository*, and a linked worktree
# shares the repository's `config` file, so it inherits whatever the main
# checkout holds. Measured from inside one:
#
#   $ git config --show-origin core.hooksPath
#   file:/…/labkit/.git/config	.githooks
#
# That is the main checkout's config answering. The claim cost nothing yet, but
# it was the stated reason for a manual step nobody needed to take.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# **Not a repository is a different answer from "the config is unset", and only
# one of them is this script's business.** `bun install` runs this, and an
# install can legitimately happen where there is no `.git` — a source tarball, a
# `COPY` into an image. There is nothing to push from, so there is nothing for a
# pre-push hook to guard; saying so and stopping is a distinction, not a
# `|| true`. Anything else git objects to still aborts, loudly.
if ! git -C "$root" rev-parse --git-dir >/dev/null 2>&1; then
  echo "OK: not a git repository, so there is nothing for a hook to guard."
  exit 0
fi

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
