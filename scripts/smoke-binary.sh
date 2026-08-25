#!/usr/bin/env bash
# The compiled binary works against a database that does not exist yet.
#
# **This check exists because that had never once been done.** `bun run build`
# produced `bin/labkit` and exited 0, and the binary died on the first command
# it was ever given -- three separate times over, each hidden behind the last:
# drizzle's migration folder, the two extension tarballs, and PGlite's own
# `pglite.data`. All three were `import.meta.url` naming a directory that does
# not exist once the code is inside a bundle. Every one of them was invisible to
# `bun test` and `bun run dev`, which read those files off disk and work.
#
# The cheap part is the point: `bun run build` takes ~0.2s. There was never a
# cost reason not to run the thing.
#
# A **fresh** directory every time, deliberately. The failure was in the code
# that runs once, against an empty database -- pointing this at a warm one
# would exercise everything except the part that was broken.
#
# Usage: bun run check:binary
# Exit:  0 when the binary migrates and answers, 1 otherwise.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="$(mktemp -d "${TMPDIR:-/tmp}/labkit-binary.XXXXXX")"
trap 'rm -rf "$db"' EXIT

bun build --compile --outfile "$root/bin/labkit" "$root/src/cli/cli.ts" > /dev/null

lab() { "$root/bin/labkit" --db "$db" --author check:binary "$@"; }

fail() {
  printf '\nFAILED: %s\n  %s\n' "$1" "$2" >&2
  exit 1
}

# A write, which is what has to migrate first.
enquiry="$(lab open 'does the packaged binary work?')"
[[ "$enquiry" == LOE_* ]] || fail "the binary could not open an enquiry" "got: $enquiry"

# A second process against the same directory. If the ledger were not written,
# or the hashes disagreed with a disk-read run, this re-applies migration 0000
# and fails on an existing table.
known="$(lab known)"
[[ "$known" == *"does the packaged binary work?"* ]] || fail "the question is not on the record" "$known"

# The graph extension actually loaded: `unresolved` means a LineOfEnquiry node
# was created and read back through AGE, not merely that Postgres started.
[[ "$known" == *"Unresolved"* ]] || fail "the survey has no buckets" "$known"

# The durable event log, on the same connection as the graph.
happened="$(lab happened)"
[[ "$happened" == *"openEnquiry"* ]] || fail "the event log is empty" "$happened"
[[ "$happened" == *"check:binary"* ]] || fail "attribution is missing" "$happened"

echo "OK: the compiled binary migrates a fresh database and answers from it."
