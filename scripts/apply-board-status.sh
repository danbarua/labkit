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
# Ranked highest-first within Todo. The reasoning lives in the issues and in
# docs/session-log/066; this is only the assignment.
TODO="95 50 55 52 49 81 56 76"
BLOCKED="94 60"   # both behind #49
PARKED="63 64 65 98 51 54"
IN_PROGRESS=""
DONE="57"
# ─────────────────────────────────────────────────────────────────────────────

PROJECT_ID=$(gh project view "$NUM" --owner "$OWNER" --format json -q .id)

STATUS_JSON=$(gh project field-list "$NUM" --owner "$OWNER" --format json |
  python3 -c "
import sys, json
for f in json.load(sys.stdin)['fields']:
    if f.get('name') == 'Status':
        print(json.dumps({'id': f['id'], 'options': {o['name']: o['id'] for o in f['options']}}))
        break
else:
    raise SystemExit('no Status field on the board')
")

export STATUS_JSON TODO BLOCKED PARKED IN_PROGRESS DONE

gh project item-list "$NUM" --owner "$OWNER" --limit 200 --format json |
  python3 -c "
import sys, json, os

status = json.loads(os.environ['STATUS_JSON'])
plan = {
    'Todo': os.environ['TODO'].split(),
    'In progress': os.environ['IN_PROGRESS'].split(),
    'Blocked': os.environ['BLOCKED'].split(),
    'Parked': os.environ['PARKED'].split(),
    'Done': os.environ['DONE'].split(),
}
wanted = {n: s for s, nums in plan.items() for n in nums}

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

for n, s in sorted(wanted.items(), key=lambda kv: (list(plan).index(kv[1]), int(kv[0]))):
    print(by_number[n], status['id'], status['options'][s], n, s)
" |
  while read -r item field option number label; do
    gh project item-edit --id "$item" --project-id "$PROJECT_ID" \
      --field-id "$field" --single-select-option-id "$option" >/dev/null
    printf '  %-12s #%s\n' "$label" "$number"
  done

echo "OK: every board item has a status."
