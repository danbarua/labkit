#!/usr/bin/env bash
# MCP Servers on STDIO: No stdout from console.log et al.
#
# Scoped to app-mcp's own import graph (core-db, core-domain), not every package
# under packages/. A package the MCP server does not import cannot interleave into
# its stdout, so it needs no exception here and none to maintain as the workspace
# grows.
#
# Usage: scripts/checks/check-stdout.sh
# Exit:  0 when clean, 1 when a banned write is found.
# retire-when: app-mcp's own import graph is checked directly, so this no longer
# has to be kept in step with it by hand.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

# Comment lines are dropped before matching. Naming the banned call in prose is
# not making it -- the first version of this script failed on its own docstring,
# which is the same trap tests/cli/coverage.test.ts already strips comments to avoid.
matches="$(grep -rEn 'console\.(log|info|dir|table)\(|process\.stdout\.write\(' \
  packages/core-db packages/core-domain packages/app-mcp \
  --include='*.ts' 2>/dev/null \
  | grep -vE '^[^:]+:[0-9]+: *(\*|//|/\*)' || true)"

if [ -n "$matches" ]; then
  echo "FAILED: writes to stdout in core-db, core-domain or app-mcp:"
  echo
  echo "$matches"
  echo
  echo "stdout is the MCP protocol channel (packages/app-mcp/server.ts). Use stderr"
  echo "for diagnostics -- console.error, or the tracing in packages/core-db/trace.ts,"
  echo "which is gated behind LABKIT_TRACE and already writes to stderr."
  exit 1
fi

echo "OK: nothing in core-db, core-domain or app-mcp writes to stdout."
