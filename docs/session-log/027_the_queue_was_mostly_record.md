# 027: the queue was mostly record

**Session wrap, 2026-08-24, on `docs/audit`.** Covers `6cd46de`. The pinned
baseline is `72dbe15`; entries 017-026 hold the rest of the range.

Short on purpose — the commit it describes deletes 93 lines of documentation
that nobody could act on.

## Goal

Dan: *"Check docs for outdated prose/ceremony."*

## Changed

**Most claims held**, and were checked mechanically rather than read: every
`bun run …` in the live docs exists in `package.json`; every `src/`, `tests/`,
`docs/`, `scripts/` path resolves; all fifteen `docs/GLOSSARY.md` pointers
resolve; no lint script, no CI workflow, no git hooks, `src/index.ts` still a
17-line stub, 13 node and 25 edge labels, three migrations, six `check:*`
scripts. `README.md` carries no counts that can rot.

**`docs/TASKS.md` did not.** 152 lines, of which 122 were the finished flake
investigation — in a file whose first paragraph forbids exactly that: *"A queue,
not a record. Only actionable items live here — a finished item is deleted."*

Cut to what a next investigator can act on. Every deletion was checked to have
a home first: the 69% in `6eeeb92`'s commit message, the profile numbers and
16ms derivation in CLAUDE.md, the tables in entries 024 and 026.

Also deleted a `## Setup a new clone or worktree needs` heading whose entire
content was *"Moved to CLAUDE.md"*.

Two CLAUDE.md cross-references would have been stranded by the cut — one
pointing at extrapolations that no longer existed, one promising a table that
had moved — and are fixed in the same commit.

## Verified

`bun run check:doc-comments` — OK. Nothing outside `CLAUDE.md` and
`docs/TASKS.md` was touched, so the code gates do not apply.

## Open

`docs/audit` is PR #8. Nothing else queued.

The mechanism worth keeping from this: **a document that states its own rule can
be audited against it.** TASKS.md's first paragraph is what made its own defect
visible, and it was the only live document that had drifted. CLAUDE.md's
equivalent rule — *if a sentence would be wrong next week it doesn't go in a
document* — is why its standing claims all still held.
