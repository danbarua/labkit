#!/usr/bin/env bash
# Sets Status on every item of the ship-labkit project board, idempotently.
#
# The ordering is the thinking; this only applies it. It exists because the
# first version of this triage was done by hand in a session and thrown away —
# so the ranking survived only in a session log, and the next person re-argues
# it instead of re-running it. Borrowed from `exo-ledger`'s
# `tools/scripts/apply-board-priority.sh` (PR #60), with two changes noted below.
#
# **Needs the `project` scope**, which a normal `gh` login does not have:
#
#     gh auth refresh -s project
#
# Reads work without it and writes fail with a scope error, which is the
# confusing half — the board looks accessible right up until you change it.
#
# **Field and option ids are resolved by name, never hardcoded.** They are not
# stable: editing the Status field regenerates every option id (see the warning
# below), and a script holding the old ones would write to nothing.
#
# ## The warning, learnt the hard way on 2026-08-28
#
# `updateProjectV2Field` **replaces the entire option set**. Adding one column
# cleared the Status of all seventeen items and regenerated the option ids, with
# no warning and no error. It was harmless then — everything was `Todo` and this
# script was about to set them all anyway — but on a board carrying real state
# that is silent data loss. If you add a column, re-run this immediately after.
#
# ## What the statuses mean
#
#   Todo         ready to start: no decision owed, someone could pick it up today
#   In progress  someone is on it
#   Blocked      waiting on another issue in this repo — name it in the comment
#   Parked       waiting on something outside this repo, or `domain model` +
#                `open question`, which CLAUDE.md defines as defined and tracked
#                but *not ready to work on*
#   Done         closed
#
# `exo-ledger`'s board has no `Blocked`, so anything waiting on a decision sits
# in its backlog and `Ready` carries the distinction instead. Ours can say what
# it means, so it does.
#
# ## Two things this refuses to do quietly
#
# **An unlisted item is an error, not a default.** `exo-ledger`'s version falls
# back to `Backlog`, so a newly filed issue silently acquires a status nobody
# chose. Here the script fails and names it: a new issue should be triaged, and
# the failure is how you find out there is one.
#
# **An empty board is an error.** Without that check a wrong project number, or
# a `gh` returning nothing, runs the loop zero times and exits 0 — a script
# reporting success for work it did not do, which is the shape this repo has
# been bitten by more than once.
#
# Usage: bun run board:status
set -euo pipefail

OWNER=danbarua
NUM=3

# ── the triage ───────────────────────────────────────────────────────────────
# The reasoning lives in the issues; this is only the assignment.
#
# Status says whether it can be picked up. Priority says what to look at first,
# and exists because Todo alone gives eight items in no order — which is a list,
# not a focus.
#
#   P0  clear it next: a demonstrated wrong answer shipping green, or something
#       that loses work. CLAUDE.md permits at most one of the first kind at a
#       time and requires that clearing it be the next thing built, so P0 is
#       normally one issue and never many.
#   P1  real, unblocked, and it slides if nobody ranks it.
#   P2  everything else, Blocked and Parked included — not competing for
#       attention. Every item carries one so the completeness check below stays
#       total; P2 is the honest value for a thing nobody should be looking at.
TODO="81 50 55 104 52 49 56 76"
BLOCKED="94 60"   # both behind #49
PARKED="63 64 65 98 51 54"
IN_PROGRESS=""
DONE="57 95"

P0="81"           # attribution: two writes, byte-identical, one of them a claim nobody checked
P1="50 55 104 52"
P2="49 56 76 94 60 63 64 65 98 51 54 57 95"
# ─────────────────────────────────────────────────────────────────────────────

PROJECT_ID=$(gh project view "$NUM" --owner "$OWNER" --format json -q .id)

FIELDS_JSON=$(gh project field-list "$NUM" --owner "$OWNER" --format json |
  python3 -c "
import sys, json
want = {'Status', 'Priority'}
out = {
    f['name']: {'id': f['id'], 'options': {o['name']: o['id'] for o in f['options']}}
    for f in json.load(sys.stdin)['fields']
    if f.get('name') in want and 'options' in f
}
missing = want - set(out)
if missing:
    raise SystemExit('the board has no ' + ', '.join(sorted(missing)) + ' field')
print(json.dumps(out))
")

export FIELDS_JSON TODO BLOCKED PARKED IN_PROGRESS DONE P0 P1 P2

gh project item-list "$NUM" --owner "$OWNER" --limit 200 --format json |
  python3 -c "
import sys, json, os

fields = json.loads(os.environ['FIELDS_JSON'])
status, priority = fields['Status'], fields['Priority']
plan = {
    'Todo': os.environ['TODO'].split(),
    'In progress': os.environ['IN_PROGRESS'].split(),
    'Blocked': os.environ['BLOCKED'].split(),
    'Parked': os.environ['PARKED'].split(),
    'Done': os.environ['DONE'].split(),
}
ranks = {
    'P0': os.environ['P0'].split(),
    'P1': os.environ['P1'].split(),
    'P2': os.environ['P2'].split(),
}
wanted = {n: s for s, nums in plan.items() for n in nums}
ranked = {n: p for p, nums in ranks.items() for n in nums}

# **Both lists must name the same issues.** Two hand-written lists drift, and a
# priority silently missing from one of them is exactly the untriaged-by-default
# case this script exists to refuse -- one level in, where it is harder to see.
only_status = sorted(set(wanted) - set(ranked), key=int)
only_rank = sorted(set(ranked) - set(wanted), key=int)
if only_status or only_rank:
    raise SystemExit(
        'the Status and Priority lists disagree:\n'
        + (('  no priority for: ' + ', '.join('#' + n for n in only_status) + '\n') if only_status else '')
        + (('  no status for:   ' + ', '.join('#' + n for n in only_rank) + '\n') if only_rank else '')
        + '  Every item gets both. P2 is the value for one nobody should be looking at.'
    )

dupes = sorted({n for p in ranks for n in ranks[p] if sum(n in v for v in ranks.values()) > 1}, key=int)
if dupes:
    raise SystemExit('these issues have more than one priority: ' + ', '.join('#' + n for n in dupes))

items = json.load(sys.stdin)['items']
if not items:
    raise SystemExit('the board returned no items -- wrong project number, or a gh that listed nothing')

by_number = {}
for it in items:
    n = it.get('content', {}).get('number')
    if n is not None:
        by_number[str(n)] = it['id']

untriaged = sorted(set(by_number) - set(wanted), key=int)
if untriaged:
    raise SystemExit(
        'these board items are not in the triage above: '
        + ', '.join('#' + n for n in untriaged)
        + '\n  A new issue is not a default. Rank it in this script, then re-run.'
    )

stale = sorted(set(wanted) - set(by_number), key=int)
if stale:
    raise SystemExit(
        'the triage names items that are not on the board: '
        + ', '.join('#' + n for n in stale)
        + '\n  Remove them here, or add them to the board.'
    )

for n, s in sorted(wanted.items(), key=lambda kv: (ranked[kv[0]], list(plan).index(kv[1]), int(kv[0]))):
    print(by_number[n], status['id'], status['options'][s],
          priority['id'], priority['options'][ranked[n]], n, s, ranked[n])
" |
  while read -r item sfield soption pfield poption number label rank; do
    gh project item-edit --id "$item" --project-id "$PROJECT_ID" \
      --field-id "$sfield" --single-select-option-id "$soption" >/dev/null
    gh project item-edit --id "$item" --project-id "$PROJECT_ID" \
      --field-id "$pfield" --single-select-option-id "$poption" >/dev/null
    printf '  %-3s %-12s #%s\n' "$rank" "$label" "$number"
  done

echo "OK: every board item has a status and a priority."
