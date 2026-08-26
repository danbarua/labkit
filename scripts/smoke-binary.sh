#!/usr/bin/env bash
# The compiled binary works against a database that does not exist yet, as a CLI and as an MCP server.
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
# **The MCP arm is here for the same reason the CLI arm is**, and it caught the
# same shape of bug the first time it ran. `labkit mcp` connected and exited 0
# with no output: `src/cli/cli.ts` ends with `process.exit(await main())`, and
# the server's `main()` resolved as soon as the transport was connected --
# correct while `src/mcp/server.ts` was its own entry point, wrong the moment it
# became a subcommand. Invisible to every other test, all of which run the
# server as a module rather than as the thing anyone ships.
#
# Usage: bun run check:binary
# Exit:  0 when the binary migrates and answers, 1 otherwise.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="$(mktemp -d "${TMPDIR:-/tmp}/labkit-binary.XXXXXX")"
trap 'rm -rf "$db"' EXIT

bash "$root/scripts/build-binary.sh" > /dev/null

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

# --- the same binary, as an MCP server -------------------------------------
#
# One JSON-RPC round trip over stdio is enough: it proves the subcommand does
# not exit early, that the protocol channel is clean (nothing from the CLI's
# printer reaches stdout), and that `initialize` gets a reply. The tool calls
# themselves are covered by `tests/mcp-stdio.test.ts` against the source.
mcp_dir="$(mktemp -d "${TMPDIR:-/tmp}/labkit-binary-mcp.XXXXXX")"
trap 'rm -rf "$db" "$mcp_dir"' EXIT

init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"check:binary","version":"0"}}}'

# `LABKIT_HOME` rather than `--db`: the server takes no such flag, which is the
# documented way to point it at a record.
mcp_out="$(printf '%s\n' "$init" | LABKIT_HOME="$mcp_dir" "$root/bin/labkit" mcp 2>/dev/null || true)"

[[ -n "$mcp_out" ]] || fail "labkit mcp answered nothing" \
  "it exited without writing to stdout -- the subcommand returned instead of serving"
[[ "$mcp_out" == *'"protocolVersion"'* ]] || fail "labkit mcp did not complete initialize" "$mcp_out"
[[ "$mcp_out" == *'"serverInfo"'* ]] || fail "labkit mcp sent no serverInfo" "$mcp_out"

# The first line must be JSON-RPC and nothing else. A stray print from any CLI
# module now reaches the protocol channel, which `check:stdout` guards
# statically; this is the same claim, executed.
first_line="$(printf '%s' "$mcp_out" | head -1)"
[[ "$first_line" == '{'* ]] || fail "something non-JSON reached the protocol channel" "$first_line"

echo "OK: the compiled binary migrates a fresh database, answers from it, and serves MCP."
