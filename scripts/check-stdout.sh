#!/usr/bin/env bash
# CI guard: nothing under src/ may write to stdout except the CLI.
#
# This became load-bearing on 2026-08-21, when src/mcp/server.ts started
# speaking MCP over stdio. stdout IS the protocol channel there: one stray
# `console.log` anywhere the server transitively imports — the DB layer, the
# domain layer, a helper — interleaves a non-JSON line into the stream and the
# client's parser fails on it. Query tracing already writes to stderr for this
# reason (src/db/trace.ts); the point of this script is that the next person
# adding a debug print does not have to know why.
#
# It replaces a transplant. The file here used to be
# check-progress-to-stdout.sh, carried in from another project: it banned
# `process.stdout.write('\r')`, cited "since v0.14.2", named a reporter at
# src/core/progress.ts and flags --progress-json/--progress-interval. None of
# those exist in this repo and none ever did. It ran green on a fiction for
# months, which is a check that cannot fail dressed as one that passed --
# exactly PJ-028's shape, one level out from the tests.
#
# Usage: scripts/check-stdout.sh
# Exit:  0 when clean, 1 when a banned write is found.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

# `src/cli/cli.ts` is the exception and the only one: printing to stdout is its
# whole job, and it is never imported by the MCP server.
#
# It names the **entry point**, not the `src/cli/` tree. The views under it
# return strings, and one of them printing instead of returning is a defect this
# check should still catch -- demonstrated on 2026-08-25 by adding a console.log
# to `src/cli/views/format.ts` and watching this go red.
#
# Comment lines are dropped before matching. Naming the banned call in prose is
# not making it -- the first version of this script failed on its own docstring,
# which is the same trap tests/cli/coverage.test.ts already strips comments to avoid.
matches="$(grep -rEn 'console\.(log|info|dir|table)\(|process\.stdout\.write\(' src/ \
  --include='*.ts' 2>/dev/null \
  | grep -v '^src/cli/cli\.ts:' \
  | grep -vE '^[^:]+:[0-9]+: *(\*|//|/\*)' || true)"

if [ -n "$matches" ]; then
  echo "❌ check-stdout ERROR: writes to stdout under src/, outside src/cli/cli.ts:"
  echo
  echo "$matches"
  echo
  echo "stdout is the MCP protocol channel (src/mcp/server.ts). Use stderr"
  echo "for diagnostics -- console.error, or the tracing in src/db/trace.ts,"
  echo "which is gated behind LABKIT_TRACE and already writes to stderr."
  exit 1
fi

echo "✅ check-stdout OK: nothing under src/ writes to stdout except the CLI."
