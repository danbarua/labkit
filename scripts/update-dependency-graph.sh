#!/usr/bin/env bash
#
# Regenerate docs/dependency-graph.mmd — the module dependency graph, as text.
#
# **Run by hand, when you want it.** There was a pre-commit hook that regenerated
# on every commit touching src/ or tests/ and staged the result; it was removed
# on 2026-08-21 along with the SVG. The graph is documentation, and documentation
# that rewrites itself inside someone else's commit buys less than it costs — it
# put a generated artefact in every code commit's diff, and the reason for
# keeping it byte-stable was to stop that being noise rather than to make it
# useful.
#
# The SVG went with it. 134KB against the mermaid form's 3KB, 1,444 generated
# lines in which a moved edge is invisible, and a graphviz dependency to render
# it. Mermaid renders on GitHub, diffs line by line, and is what an agent reads.
# PJ-007 records a design change prompted by *reading* the SVG, which is the case
# for having had one; it is not a case for regenerating it forever. Recover it
# with `bunx depcruise-fmt -T dot` over the JSON below if a person wants one.
#
# It exists as a script rather than a package.json one-liner because the
# one-liner was a pipeline:
#
#     bunx depcruise tests --output-type dot | dot -T svg > docs/dependency-graph.svg
#
# `$?` after a pipeline reports the *last* command's status, so a crashed
# depcruise left `dot` reading empty input, writing a valid-but-empty SVG, and
# reporting success. CLAUDE.md names that trap under "Commands". Every stage
# below is run and checked on its own, and nothing is moved into place until it
# has produced real output. That is worth keeping even with one output left.
#
# Exit 0 = the graph is current, whether or not it moved.
# Exit 1 = generation failed; whatever is committed is left untouched.
set -uo pipefail

root="$(git rev-parse --show-toplevel)" || exit 1
cd "$root" || exit 1
mmd_out="docs/dependency-graph.mmd"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

if ! bunx depcruise tests --output-type json > "$tmp/cruise.json" 2> "$tmp/err.txt"; then
  echo "update-dependency-graph: depcruise failed; graphs left unchanged." >&2
  sed 's/^/  /' "$tmp/err.txt" >&2
  exit 1
fi
if [ ! -s "$tmp/cruise.json" ]; then
  echo "update-dependency-graph: depcruise produced no output; graphs left unchanged." >&2
  exit 1
fi

if ! bunx depcruise-fmt -T mermaid "$tmp/cruise.json" > "$tmp/graph.mmd" 2> "$tmp/err.txt"; then
  echo "update-dependency-graph: mermaid formatting failed; graphs left unchanged." >&2
  sed 's/^/  /' "$tmp/err.txt" >&2
  exit 1
fi
grep -q "flowchart" "$tmp/graph.mmd" || {
  echo "update-dependency-graph: mermaid output has no flowchart; graphs left unchanged." >&2
  exit 1
}

mkdir -p docs
changed=""
place() {
  local from="$1" to="$2"
  if [ -f "$to" ] && cmp -s "$from" "$to"; then return; fi
  cp "$from" "$to"
  changed="$changed $to"
}
place "$tmp/graph.mmd" "$mmd_out"

if [ -z "$changed" ]; then
  echo "update-dependency-graph: graph already current."
else
  echo "update-dependency-graph: wrote$changed"
fi
