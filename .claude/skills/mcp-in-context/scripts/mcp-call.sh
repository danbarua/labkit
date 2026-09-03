#!/usr/bin/env bash
#
# One MCP method against one record, through the inspector CLI.
#
# Exists because the raw invocation has three ways to go wrong that all look
# like server faults: a binary npx cannot spawn, a working directory that
# chooses the wrong record, and a tool refusal reported as an exit code. This
# names each one instead.
#
#   mcp-call.sh tools/list
#   mcp-call.sh tools/call now
#   mcp-call.sh tools/call gate_status gate=GATE_3
#   LABKIT_RECORD=~/Code/pycharm/bonsai-2026 mcp-call.sh tools/call now
#
# LABKIT_BIN  the labkit binary (default: `labkit` on PATH, else the repo's bin/)
# LABKIT_RECORD  the directory whose record to read (default: cwd)
#
# Read-only in practice: every invocation is one connection, so a write tool's
# `register_session` cannot carry into it and the write refuses. That is the
# property that makes this safe to point at a record someone is using.
set -euo pipefail

method="${1:-}"
[ -n "$method" ] || { echo "usage: $0 <method> [tool] [key=value ...]" >&2; exit 2; }
shift

# The binary, named absolutely. npx spawns it, and a bare name resolves against
# the subprocess's PATH rather than the shell's -- which fails as
# `spawn labkit ENOENT` and reads like the server rather than the lookup.
bin="${LABKIT_BIN:-}"
if [ -z "$bin" ]; then
  if command -v labkit > /dev/null 2>&1; then
    bin="$(command -v labkit)"
  else
    here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    bin="$(cd "$here/../../../.." && pwd)/bin/labkit"
  fi
fi
[ -x "$bin" ] || {
  echo "mcp-call: no labkit binary at '$bin'. Build one with \`bun run build\`," >&2
  echo "          or set LABKIT_BIN to the one you mean." >&2
  exit 1
}

args=(--cli "$bin" mcp --method "$method")
if [ "$method" = "tools/call" ]; then
  tool="${1:-}"
  [ -n "$tool" ] || { echo "mcp-call: tools/call needs a tool name" >&2; exit 2; }
  shift
  args+=(--tool-name "$tool")
  for pair in "$@"; do args+=(--tool-arg "$pair"); done
fi

# The record is chosen by where the server starts, so cd rather than passing a
# flag -- the server resolves its own database exactly as any labkit process
# does, which is the behaviour being debugged.
cd "${LABKIT_RECORD:-$PWD}"

# stderr is passed through, not swallowed: LabKit's request log writes one JSON
# line there naming the tool and the arguments a failing call was given, and
# that line is most of the diagnosis.
npx -y @modelcontextprotocol/inspector "${args[@]}"
