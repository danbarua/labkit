#!/usr/bin/env bash
# Asks LabKit what to investigate next, using only LabKit. Prints; asserts nothing.
#
# **`probe:`, not `check:`, and the prefix is the whole point.** `check:` means
# green is fine and red is yours to fix. This answers a question instead — *how
# much of a research queue can LabKit hold without markdown beside it* (#56) —
# and its interesting outcomes are things it cannot do, which no exit code
# expresses. CLAUDE.md reserves this prefix for exactly that and had no example
# left after `probe:pglite-concurrency` went; this is one.
#
# **It exists because the first run of it did not.** That run happened on
# 2026-08-28, found three of #56's four criteria met and one not, and was then
# deleted along with its record — so re-running it meant rebuilding it from an
# issue comment. A measurement nobody can repeat is an anecdote, and #56 is a
# recurring question rather than a one-shot: the fourth criterion is expected to
# start passing if a `Task` ever names the question it serves, and this is what
# would show that.
#
# The corpus is deliberately narrow, per the issue: not the commits and not the
# journal, but the things that generate follow-on work. It is one real slice —
# the attribution grade that shipped as #109 — loaded as it actually happened.
#
#   bash scripts/probe-dogfood.sh [dir]
#
# With no argument it builds a throwaway record and removes it. Pass a directory
# to keep the record and poke at it afterwards with `labkit --db <dir>`.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
keep=${1:-}
db=${keep:-$(mktemp -d)}
[ -n "$keep" ] || trap 'rm -rf "$db"' EXIT

lab() { bun "$root/src/cli/cli.ts" --db "$db" --author probe-dogfood.sh "$@"; }
ask() { printf '\n\033[1m$ labkit %s\033[0m\n' "$*"; lab "$@"; }
say() { printf '\n\n=== %s\n' "$1"; }

say "loading one slice of this repository's own recursive work"

# The open question, and the line of enquiry under it.
q=$(lab pose 'what may the record honestly say about who did something?')
e=$(lab pursue "$q" --approach 'grade the attribution at the provider')

# The review finding that started the work -- a real measurement, kept verbatim.
obs=$(lab observe "$e" \
  --name 'author-vs-os-attribution' \
  --finding 'labkit pose and labkit --author dan pose wrote byte-identical attribution' \
  --hash 'sha256:427fa7f')

# The work that finding created, the condition it was held to, the gate.
w=$(lab plan \
  --objective 'record how LabKit came by the actor name' \
  --acceptance 'observed and claimed are distinguishable in the event log' \
  --may-read 'author-vs-os-attribution')
c=$(lab criterion 'every declared grade has a producer')
g=$(lab declare --governed-by "$c" \
  --consequence 'a value nothing writes is one whose absence a reader cannot interpret' \
  --protecting "$w")

out=$(lab analyse "$e" \
  --method 'grade on the provider, three values' \
  --from "$obs" --implementing "$w" --held-to "$c" \
  --concludes '{"proposition": "the grade belongs to the provider, not the field", "finding": "how() is a method because personContext is observed or claimed by construction"}')
claim=$(printf '%s' "$out" | tail -1)
lab evaluate "$c" --gate "$g" --value 'observed, claimed, unattributed all written' \
  --outcome pass --citing "$claim" >/dev/null

# The two danglers: named, not built, each with what would reopen it.
for pair in \
  'should corroborated be a grade?|wait for a non-caller attester|nothing writes it: agent-bus whoami does not exist yet|a handshake reports an id LabKit did not get from the caller' \
  'should trace_id go on CommandContext?|look for a producer|no producer: CLI has none, stdio MCP has none, and one session id covers 153 merged commits|a harness emits a turn delimiter, or a bus message carries an id into a write'
do
  IFS='|' read -r question approach because until <<<"$pair"
  dq=$(lab pose "$question")
  de=$(lab pursue "$dq" --approach "$approach")
  lab accept "$de" --because "$because" --until "$until" --in-light-of "$claim" >/dev/null
done

# Work nobody has started, and which nothing explains the existence of. That
# absence is the finding, not an oversight in this script.
lab plan --objective 'decide whether a Task should name the question it serves' \
  --acceptance 'a report gets a confidently wrong answer without the edge' >/dev/null

say "#56's criterion, asked cold"

printf '\n-- 1. what should I investigate next?\n'
ask work

printf '\n-- 2. why does that work exist?\n'
printf '   THE GAP. A Task hangs off nothing but a gate: `plan` takes no question\n'
printf '   and TaskContract carries none, so no report can name one (#55).\n'
printf '   Note that it DECLINES rather than guessing, which is why no edge is\n'
printf '   earned yet -- PJ-011 §5 wants a confidently wrong answer, not an absent one.\n'
ask contract TASK_2

printf '\n-- 3. what is the chain under a conclusion?\n'
ask why "$claim"

printf '\n-- 4. what is deliberately not being done, and what would reopen it?\n'
ask known
ask enquiry LOE_3

say "the events the run generated"
ask happened

say "read the four answers above. This script asserts nothing on purpose."
[ -n "$keep" ] && printf '\nrecord kept at %s\n' "$db"
exit 0
