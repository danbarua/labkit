#!/usr/bin/env bash
#
# Generates a Rust/Grafeo port trace and serves it in the LabKit Explorer,
# start to finish. See ./read-rust-traces.ts and ../explorer/.
#
# The three pieces this stitches together already exist and are each tested
# on their own -- the Rust port's LABKIT_TRACE_OUT (labkit#119, #121),
# read-rust-traces.ts's NDJSON parser, and serve-explorer.ts's --rust-traces
# flag -- but nothing shows the commands that connect them. Reading the code
# to reconstruct "cargo build, then what env var, then what path" is exactly
# the kind of thing this file exists to save a reader from doing, the same
# reason examples/full-lifecycle.sh exists for the CLI.
#
# Shows the pipeline; does not check it. `--verify` (or CI) instead checks
# that the fixtures produced still parse into a well-formed Trace -- see the
# bottom of this file.
#
# Not hermetic in the way examples/full-lifecycle.sh is: it starts a real HTTP
# server and leaves it running in the foreground so a reader can open the URL
# printed at the end. Ctrl-C stops it; the generated trace and the `cargo
# build` output both live under a temp directory removed on exit either way.
#
# Usage:
#   bun run demo:rust-explorer            # build, generate, serve (foreground)
#   bun run demo:rust-explorer --verify   # generate only, assert the trace parses, exit
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rust_dir="$root/spikes/labkit-rust"
work="$(mktemp -d "${TMPDIR:-/tmp}/labkit-rust-explorer-demo.XXXXXX")"
trap 'rm -rf "$work"' EXIT

verify_only=0
[ "${1:-}" = "--verify" ] && verify_only=1

echo "== 1. Build the Rust/Grafeo port =="
echo "\$ cargo build --release"
( cd "$rust_dir" && cargo build --release )
binary="$rust_dir/target/release/labkit-grafeo"
echo

echo "== 2. Run a parity slice with tracing on =="
traces_dir="$work/traces"
mkdir -p "$traces_dir"
# LABKIT_TRACE_FRAGMENT names the trace in the Explorer's picker; without it,
# read-rust-traces.ts falls back to the file's own name.
echo "\$ LABKIT_TRACE_OUT=$traces_dir/slice-5.ndjson LABKIT_TRACE_FRAGMENT=slice-5 \\"
echo "    bash parity/slice-5.sh $binary"
LABKIT_TRACE_OUT="$traces_dir/slice-5.ndjson" LABKIT_TRACE_FRAGMENT=slice-5 \
  bash "$rust_dir/parity/slice-5.sh" "$binary" > "$work/slice-5.stdout" 2>&1
lines=$(wc -l < "$traces_dir/slice-5.ndjson" | tr -d ' ')
echo "-> $traces_dir/slice-5.ndjson  ($lines lines, one per graph-changing command)"
echo

echo "== 3. First line, so a reader can see the shape without opening the file =="
head -1 "$traces_dir/slice-5.ndjson" | python3 -m json.tool
echo

if [ "$verify_only" = "1" ]; then
  echo "== --verify: does it parse into a well-formed Trace? =="
  bun -e '
    import { readRustTraces } from "./scripts/read-rust-traces";
    const traces = await readRustTraces(process.argv[1]);
    if (traces.length !== 1) throw new Error(`expected 1 trace, got ${traces.length}`);
    const [t] = traces;
    if (t.origin !== "labkit-rust") throw new Error(`expected origin labkit-rust, got ${t.origin}`);
    if (t.steps.length === 0) throw new Error("trace has no steps");
    console.error(`OK: parsed ${t.steps.length} steps as one Trace, origin=${t.origin}, name=${t.name}`);
  ' "$traces_dir"
  exit 0
fi

echo "== 4. Serve it in the Explorer, alongside the TS-derived traces =="
port="${LABKIT_PORT_EXPLORER:-8850}"
echo "\$ bun scripts/serve-explorer.ts --port $port --rust-traces $traces_dir"
echo
echo "   Open http://localhost:$port -- the scenario picker's [rust] entry is"
echo "   the trace just generated. Ctrl-C to stop."
echo
exec bun "$root/scripts/serve-explorer.ts" --port "$port" --rust-traces "$traces_dir"
