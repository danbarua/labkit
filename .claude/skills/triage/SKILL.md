# triage — a new issue is not a default

When you file an issue in this repo, put it on the ship-labkit board and set
**Status** and **Priority** in the same breath. The board is the only copy of
that state: there is no list in a file, and there must not be one.

There was. `scripts/apply-board-status.sh` held `TODO="81 50 55 …"` and applied
it — `docs/TASKS.md` reborn as a shell script, with a guard that failed until
someone added the new number, which cost three pull requests in one afternoon
(2026-08-31). It was deleted for the reason `docs/TASKS.md` was: a queue is
state, a file is prose, and keeping the two in step was a job nobody had. What
survived is this — the meanings, which are convention rather than state, and
two things `gh` will not tell you.

## The vocabulary

Status says whether it can be picked up. Priority says what to look at first.

| Status | meaning |
| --- | --- |
| Todo | ready: no decision owed, someone could start today |
| In progress | someone is on it — including *shipped, open under review* |
| Blocked | waiting on another issue in this repo; name it in the body |
| Parked | waiting on something outside the repo, or `open question` + `domain model`, which CLAUDE.md defines as *defined and tracked, not ready to work on* |
| Done | closed |

| Priority | meaning |
| --- | --- |
| P0 | clear it next. A **demonstrated wrong answer shipping green**, or something that loses work. CLAUDE.md permits at most one of the first kind at a time and requires that clearing it be the next thing built, so P0 is normally one issue and never many. Which row is `demonstrated` is in PJ-008 §3's index table and nowhere else. |
| P1 | real, unblocked, and it slides if nobody ranks it |
| P2 | everything else — Blocked and Parked included. The honest value for a thing nobody should be looking at. |

Every item gets both. An issue with neither is untriaged, and untriaged is the
state this skill exists to refuse.

Two conventions live beside these, from CLAUDE.md: a `not-doing` issue is
**closed as not planned**; a `deferred` issue names the issue that would unpark
it rather than restating the condition.

## Doing it

```sh
gh project item-add 3 --owner danbarua --url https://github.com/danbarua/labkit/issues/<n>
```

then set the two fields. **Resolve field and option ids by name, every time,
never from memory or a comment** — they are not stable (below):

```sh
PROJECT=$(gh project view 3 --owner danbarua --format json -q .id)
FIELDS=$(gh project field-list 3 --owner danbarua --format json)
ITEM=$(gh project item-list 3 --owner danbarua --limit 200 --format json \
  -q '.items[] | select(.content.number == <n>) | .id')
field()  { printf '%s' "$FIELDS" | jq -r --arg n "$1" '.fields[] | select(.name == $n) | .id'; }
option() { printf '%s' "$FIELDS" | jq -r --arg n "$1" --arg o "$2" '.fields[] | select(.name == $n) | .options[] | select(.name == $o) | .id'; }
gh project item-edit --id "$ITEM" --project-id "$PROJECT" --field-id "$(field Status)"   --single-select-option-id "$(option Status Todo)"
gh project item-edit --id "$ITEM" --project-id "$PROJECT" --field-id "$(field Priority)" --single-select-option-id "$(option Priority P1)"
```

Needs the `project` scope, which a normal `gh` login lacks:
`gh auth refresh -s project`. Reads work without it and **writes fail with a
scope error**, so the board looks accessible right up until you change it.

**Sub-issues are not `gh`'s.** Linking an issue under a parent is
`mcp__github__sub_issue_write` (the GitHub MCP server), or the GraphQL
`addSubIssue` mutation through `gh api graphql`. `gh issue` has no verb for it.

## The warning worth keeping

**`updateProjectV2Field` replaces the entire option set.** On 2026-08-28,
adding one Status column cleared every item's Status and regenerated all the
option ids, with no warning and no error. Harmless then — everything was Todo —
but on a board carrying real state that is silent data loss. Never edit a
field's options without re-setting every item afterwards, and never hold an
option id anywhere but the call that resolved it.

## What this is not

Not a place to record *why* an issue has the rank it has. The reasoning lives
in the issue body — a P0 says what wrong answer it ships, a Blocked names what
blocks it. A ranking without a reason in the issue is a number.
