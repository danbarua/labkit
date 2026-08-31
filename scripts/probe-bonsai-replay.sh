#!/usr/bin/env bash
# Proves the real Bonsai record is script-derived: replays the four
# probe-bonsai-*.sh scripts into a fresh database and diffs the result
# against the live one. Zero lines out is the point.
#
#   LABKIT_HOME=~/Code/pycharm/bonsai-2026 bash scripts/probe-bonsai-replay.sh
#   bash scripts/probe-bonsai-replay.sh <live-db-dir>
#
# NOT registered in package.json and NOT in `bun run check`'s sweep, for
# the same two reasons `test:pg` sits outside it (CLAUDE.md): it needs a
# resource the repository cannot assume exists -- a specific external
# checkout, LABKIT_HOME, that is not part of this repo or CI -- and it
# takes on the order of three minutes, not the sweep's ~90s budget. Unlike
# `probe:dogfood`, this is NOT a "no exit code expresses the outcome"
# probe -- it can and does properly pass or fail, and its exit code is
# the thing to trust. It keeps the `probe-bonsai-` prefix rather than
# `check-` because it is Bonsai-transcription tooling, sibling to the four
# scripts it replays, not a general LabKit repo check -- CLAUDE.md's own
# lesson about `check-all.ts`'s first exclusion list applies in reverse
# here: a script's name should say what it is, and this one is not what
# `check:` means even though it can go red.
#
# The live record is opened READ-ONLY -- only `happened` is ever run
# against it. Everything the four scripts write goes into a fresh,
# disposable directory.
#
# What gets stripped before the diff, and why each survives or doesn't:
#   - ISO timestamps: always differ between the live run and today's replay.
#   - `@<git-hash>` in each event's attribution line: differs whenever the
#     scripts themselves have been committed since the live record was
#     built -- not a reproducibility defect, just which commit was HEAD.
#   - Attribution NAME and claimed/observed are kept, not stripped. They
#     must reproduce identically -- including the one Reviewer-attributed
#     evaluate in probe-bonsai-2b.sh -- and a stripped diff that could not
#     catch a broken --author override would not be proving what this
#     script exists to prove.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
live="${1:-${LABKIT_HOME:-}}"
[ -n "$live" ] || { echo "usage: LABKIT_HOME=<live-db-dir> $0, or $0 <live-db-dir>" >&2; exit 2; }
[ -d "$live/.labkit" ] || { echo "no .labkit record at $live" >&2; exit 2; }

fresh="$(mktemp -d)"
trap 'rm -rf "$fresh"' EXIT

echo "replaying the four scripts into $fresh" >&2
for script in probe-bonsai-1a.sh probe-bonsai-1b2-1d.sh probe-bonsai-2a.sh probe-bonsai-2b.sh; do
  echo "  $script" >&2
  bash "$root/scripts/$script" "$fresh" >/dev/null
done

normalize() {
  # 1) drop the ISO timestamp column on a numbered event line
  # 2) drop the @<hash> token from an attribution line, wherever it sits
  sed -E \
    -e 's/^([[:space:]]*[0-9]+[[:space:]]+)[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z([[:space:]]+)/\1\2/' \
    -e 's/ @[0-9a-f]+,/,/'
}

live_happened=$(bun "$root/src/cli/cli.ts" --db "$live" happened --limit 1000 2>&1 | normalize)
fresh_happened=$(bun "$root/src/cli/cli.ts" --db "$fresh" happened --limit 1000 2>&1 | normalize)

if diff_out=$(diff <(printf '%s\n' "$live_happened") <(printf '%s\n' "$fresh_happened")); then
  echo "OK: the live record is exactly what the four scripts produce, timestamps and commit hashes aside."
  exit 0
fi

echo "FAILED: the live record has drifted from what the four scripts produce." >&2
echo "$diff_out"
echo >&2
echo "A handle name below is the usual cause -- probe-bonsai-2a.sh's hardcoded" >&2
echo "q6=\"Q_6\" / loe6=\"LOE_6\" inheritance from probe-bonsai-1b2-1d.sh is the" >&2
echo "known fragile point (guarded on write, not proven identical until now)." >&2
exit 1
