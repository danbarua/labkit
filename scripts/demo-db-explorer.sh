#!/usr/bin/env bash
#
# Builds a real LabKit record through the CLI and serves it in the Explorer,
# start to finish. See ./read-db-trace.ts and ../explorer/.
#
# labkit#124/#126: the record the Explorer renders here is not a composition
# run in a temp directory (fragments/compositions.ts) and not an NDJSON file
# from the Rust port -- it is durable state, written by real CLI commands,
# read back from its own pgEventLog on a *kept* record, the same way a
# researcher's real project's .labkit/ would be. This script is that
# lifecycle end to end: write a few real events, then serve them, so the
# commands that connect ./read-db-trace.ts to scripts/serve-explorer.ts's
# --db flag don't have to be reconstructed from reading both files.
#
# Shows the pipeline; does not check it. `--verify` checks that the record
# produced still reads back as one well-formed, non-empty Trace with no
# dangling edges -- see the bottom of this file.
#
# Usage:
#   bun run demo:db-explorer            # write, generate, serve (foreground)
#   bun run demo:db-explorer --verify   # write only, assert the trace reads back, exit
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="$(mktemp -d "${TMPDIR:-/tmp}/labkit-db-explorer-demo.XXXXXX")"
trap 'rm -rf "$db"' EXIT

verify_only=0
[ "${1:-}" = "--verify" ] && verify_only=1

lab() { bun "$root/src/cli/cli.ts" --db "$db" --author demo-db-explorer.sh "$@"; }

echo "== 1. Write a few real events through the CLI, into a kept record =="
echo "\$ labkit --db $db pose 'does the effect survive a held-out set?'"
q=$(lab pose 'does the effect survive a held-out set?')
echo "\$ labkit --db $db pursue $q --approach 'held-out replication'"
e=$(lab pursue "$q" --approach 'held-out replication')
echo "\$ labkit --db $db observe $e --name held-out-raw --finding '...'"
obs=$(lab observe "$e" --name held-out-raw --finding 'convergence counts on the held-out split' --hash sha256:demo1)
echo "\$ labkit --db $db analyse $e --method 'held-out comparison' --from $obs --concludes '{...}'"
lab analyse "$e" --method 'held-out comparison' --from "$obs" \
  --concludes '{"proposition": "the effect holds on the held-out set", "finding": "it does, smaller margin"}' > /dev/null
echo "-> $db/.labkit  (4 events)"
echo

if [ "$verify_only" = "1" ]; then
  echo "== --verify: does it read back as one well-formed Trace? =="
  bun -e '
    import { readDbTrace } from "./scripts/read-db-trace";
    import { danglingEndpoints } from "./fragments/trace";
    const trace = await readDbTrace(process.argv[1], "demo");
    if (trace.origin !== "labkit-db") throw new Error(`expected origin labkit-db, got ${trace.origin}`);
    if (trace.steps.length === 0) throw new Error("trace has no steps");
    const dangling = danglingEndpoints(trace);
    if (dangling.length > 0) throw new Error(`dangling endpoints: ${dangling.join(", ")}`);
    console.error(`OK: read back ${trace.steps.length} steps as one Trace, origin=${trace.origin}, no dangling edges.`);
  ' "$db"
  exit 0
fi

echo "== 2. Serve it in the Explorer, alongside the composition and Rust traces =="
port="${LABKIT_PORT_EXPLORER:-8850}"
echo "\$ bun scripts/serve-explorer.ts --port $port --db $db"
echo
echo "   Open http://localhost:$port -- the scenario picker's [db] entry is"
echo "   this record, re-read on every request: run another labkit --db $db"
echo "   command in another shell and reload the page without restarting this"
echo "   one to see it grow. Ctrl-C to stop."
echo
exec bun "$root/scripts/serve-explorer.ts" --port "$port" --db "$db"
