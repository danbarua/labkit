#!/usr/bin/env bash
#
# Regenerate docs/dependency-graph.svg from the current tree.
#
# Run by hand, by `bun run dev:dependency-cruiser`, and by the pre-commit hook
# in .githooks/. Exists as a script rather than a package.json one-liner for one
# reason: the one-liner was a pipeline.
#
#     npx depcruise tests --output-type dot | dot -T svg > docs/dependency-graph.svg
#
# `$?` after a pipeline reports the *last* command's status, so a depcruise that
# crashed left `dot` reading empty input, writing a valid-but-empty SVG, and
# reporting success. CLAUDE.md names that trap under "Commands"; committing the
# result automatically would have turned an occasional silent failure into a
# routine one. Each stage below is run and checked separately, and nothing is
# moved into place until both have produced real output.
#
# Exit 0 = graph is current (whether or not it changed). Exit 1 = generation
# failed and the committed graph is untouched.
set -uo pipefail

root="$(git rev-parse --show-toplevel)" || exit 1
cd "$root" || exit 1
out="docs/dependency-graph.svg"

command -v dot >/dev/null || {
  echo "update-dependency-graph: graphviz 'dot' not on PATH; skipping." >&2
  echo "  brew install graphviz" >&2
  exit 1
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Stage 1 — the graph, as dot. Checked on its own, not through a pipe.
if ! npx depcruise tests --output-type dot > "$tmp/graph.dot" 2> "$tmp/err.txt"; then
  echo "update-dependency-graph: depcruise failed, graph left unchanged." >&2
  sed 's/^/  /' "$tmp/err.txt" >&2
  exit 1
fi
if [ ! -s "$tmp/graph.dot" ]; then
  echo "update-dependency-graph: depcruise produced no output, graph left unchanged." >&2
  exit 1
fi

# Stage 2 — render. Same treatment.
if ! dot -T svg "$tmp/graph.dot" > "$tmp/graph.svg" 2> "$tmp/err.txt"; then
  echo "update-dependency-graph: dot failed, graph left unchanged." >&2
  sed 's/^/  /' "$tmp/err.txt" >&2
  exit 1
fi
if ! grep -q "</svg>" "$tmp/graph.svg"; then
  echo "update-dependency-graph: rendered file has no closing </svg>, graph left unchanged." >&2
  exit 1
fi

if [ -f "$out" ] && cmp -s "$tmp/graph.svg" "$out"; then
  echo "update-dependency-graph: $out already current."
  exit 0
fi

mkdir -p "$(dirname "$out")"
cp "$tmp/graph.svg" "$out"
echo "update-dependency-graph: wrote $out"
