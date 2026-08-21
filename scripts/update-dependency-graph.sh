#!/usr/bin/env bash
#
# Regenerate the dependency graph in both of the forms it gets read in.
#
#   docs/dependency-graph.svg  — for a person, opened in a browser. Graphviz
#                                solves edge routing properly, which is what
#                                makes a graph this dense legible; PJ-007 records
#                                a design change prompted by *reading* it.
#   docs/dependency-graph.mmd  — for an agent, read as text. 3KB against the
#                                SVG's 134KB, and it diffs: a reviewer can see
#                                that one edge moved, which is invisible in 1,444
#                                lines of generated SVG.
#
# Two readers, two forms, one analysis. `depcruise` runs **once** and
# `depcruise-fmt` renders the result twice, so the two files cannot describe
# different graphs — not merely "do not in practice". Two independent cruises
# would have left that a matter of luck.
#
# Run by hand, by `bun run dev:dependency-cruiser`, and by .githooks/pre-commit.
#
# It exists as a script rather than a package.json one-liner because the
# one-liner was a pipeline:
#
#     npx depcruise tests --output-type dot | dot -T svg > docs/dependency-graph.svg
#
# `$?` after a pipeline reports the *last* command's status, so a crashed
# depcruise left `dot` reading empty input, writing a valid-but-empty SVG, and
# reporting success. CLAUDE.md names that trap under "Commands". Every stage
# below is run and checked on its own, and nothing is moved into place until it
# has produced real output.
#
# Output is byte-stable: two runs over an unchanged tree produce identical
# files, and an edit that changes no import produces an identical graph. That is
# what lets the caller treat "the file changed" as "the module structure
# changed" — verified, not assumed.
#
# Exit 0 = both graphs are current, whether or not they moved.
# Exit 1 = generation failed; whatever is committed is left untouched.
set -uo pipefail

root="$(git rev-parse --show-toplevel)" || exit 1
cd "$root" || exit 1
svg_out="docs/dependency-graph.svg"
mmd_out="docs/dependency-graph.mmd"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# One analysis. Everything below is a rendering of this file.
if ! npx depcruise tests --output-type json > "$tmp/cruise.json" 2> "$tmp/err.txt"; then
  echo "update-dependency-graph: depcruise failed; graphs left unchanged." >&2
  sed 's/^/  /' "$tmp/err.txt" >&2
  exit 1
fi
if [ ! -s "$tmp/cruise.json" ]; then
  echo "update-dependency-graph: depcruise produced no output; graphs left unchanged." >&2
  exit 1
fi

# --- the agent-readable form -------------------------------------------------
if ! npx depcruise-fmt -T mermaid "$tmp/cruise.json" > "$tmp/graph.mmd" 2> "$tmp/err.txt"; then
  echo "update-dependency-graph: mermaid formatting failed; graphs left unchanged." >&2
  sed 's/^/  /' "$tmp/err.txt" >&2
  exit 1
fi
grep -q "flowchart" "$tmp/graph.mmd" || {
  echo "update-dependency-graph: mermaid output has no flowchart; graphs left unchanged." >&2
  exit 1
}

# --- the human-readable form -------------------------------------------------
# graphviz is optional on purpose. A clone without it still maintains the
# mermaid graph; it just cannot redraw the SVG. Announced, never fatal.
have_dot=1
command -v dot >/dev/null || have_dot=0
if [ "$have_dot" -eq 1 ]; then
  if ! npx depcruise-fmt -T dot "$tmp/cruise.json" > "$tmp/graph.dot" 2> "$tmp/err.txt"; then
    echo "update-dependency-graph: dot formatting failed; graphs left unchanged." >&2
    sed 's/^/  /' "$tmp/err.txt" >&2
    exit 1
  fi
  if ! dot -T svg "$tmp/graph.dot" > "$tmp/graph.svg" 2> "$tmp/err.txt"; then
    echo "update-dependency-graph: graphviz failed; graphs left unchanged." >&2
    sed 's/^/  /' "$tmp/err.txt" >&2
    exit 1
  fi
  grep -q "</svg>" "$tmp/graph.svg" || {
    echo "update-dependency-graph: rendered SVG has no closing tag; graphs left unchanged." >&2
    exit 1
  }
fi

mkdir -p docs
changed=""
place() {
  local from="$1" to="$2"
  if [ -f "$to" ] && cmp -s "$from" "$to"; then return; fi
  cp "$from" "$to"
  changed="$changed $to"
}
place "$tmp/graph.mmd" "$mmd_out"
[ "$have_dot" -eq 1 ] && place "$tmp/graph.svg" "$svg_out"

if [ "$have_dot" -eq 0 ]; then
  echo "update-dependency-graph: graphviz 'dot' not on PATH; $svg_out not redrawn." >&2
  echo "  brew install graphviz" >&2
fi
if [ -z "$changed" ]; then
  echo "update-dependency-graph: graphs already current."
else
  echo "update-dependency-graph: wrote$changed"
fi
