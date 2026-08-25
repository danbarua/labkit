#!/usr/bin/env bash
#
# The old CLI and the new one, given the same script, must print the same thing.
#
# `examples/full-lifecycle.sh` drives twenty-odd commands across both halves of
# the domain. Running it against `src/cli.ts` and `src/cli/cli.ts` and diffing
# the transcripts is the porting harness: it compares what a *user* sees, which
# is the thing a unit test cannot check and the thing a rewrite silently
# changes.
#
# Timestamps and the commit hash differ per run and are blanked before the
# comparison. Nothing else is.
#
# **This script dies at cutover.** When `src/cli.ts` goes, so does this — there
# will be nothing to diff against. It is scaffolding and says so rather than
# quietly becoming a check of one CLI against itself.
#
# Usage: bun run check:cli-diff
# Exit:  0 when the transcripts match, 1 when they do not.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/labkit-clidiff.XXXXXX")"
trap 'rm -rf "$work" "$root/examples/.diff-cli.sh"' EXIT

bash "$root/examples/full-lifecycle.sh" > "$work/old.txt" 2>&1

sed 's|bun "$root/src/cli.ts"|bun "$root/src/cli/cli.ts"|' \
  "$root/examples/full-lifecycle.sh" > "$root/examples/.diff-cli.sh"
bash "$root/examples/.diff-cli.sh" > "$work/new.txt" 2>&1

normalise() {
  sed -E -e 's/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z/<TIME>/g' -e 's/@[0-9a-f]{8}/@<SHA>/g' "$1"
}
normalise "$work/old.txt" > "$work/old.norm"
normalise "$work/new.txt" > "$work/new.norm"

if ! diff -u "$work/old.norm" "$work/new.norm" > "$work/diff.txt"; then
  echo "❌ check-cli-diff ERROR: the two CLIs print different things."
  echo
  cat "$work/diff.txt"
  exit 1
fi

echo "✅ check-cli-diff OK: src/cli.ts and src/cli/cli.ts print the same transcript."
