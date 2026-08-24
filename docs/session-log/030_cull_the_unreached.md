# 030: cull the unreached, name the strings, ban the bare ones

**Session wrap, 2026-08-24, on `chore/no-stringly-typed`.** Not a decision
record — the reasoning is in the three commit messages and PRs #13/#14/#15.

**The baseline is much wider than this entry.** It is still pinned at `72dbe15`
from the start of a long session; everything up to `3ca3cd0` belongs to entries
022-028, and `eb431c3`/`ed8ef3a` to entry 029. This entry covers `ec852d0`,
`65e8064` and `9173db4` — the three parts of one housekeeping plan.

## Goal

Housekeeping before the persisted event store: delete what nothing reaches, say
what LabKit does with each stored string, and stop signatures from taking bare
ones.

## Changed

**`ec852d0` — cull dead behaviour, and store a list as a list.** Merged, PR #13.
`claimFor`/`enquiriesClaiming`/`enquiryAddressedBy` (zero references anywhere),
`ClaimSubject` (exported, used by nothing), and the whole Decision-closure
lifecycle — `closeDecision()`, `is_open`, `closed_at`, the biconditional
validator, its five tests. `NodeType.validate` kept as the seam an invariant
attaches to. `Task.inputs` (a JSON string) became `Task.mayRead` (a native
agtype array).

**`65e8064` — the string taxonomy, and indexes generated from it.** Merged,
PR #14. `IndexedString`, `Timestamp`, `IdentityString`, `ReadOnlyString<T>`,
`Prose` applied to every property of all thirteen `*Props`; `INDEXED_PROPS` and
`ensurePropertyIndexes()`; `scripts/check-prop-classes.ts`.

**`9173db4` — no bare `string` in a domain service signature.** Open as PR #15.
`UnitRef` (the last natural-id prefix without a handle), `scopeParams()`, ~29
positions converted across `core.ts`/`read.ts`/`write.ts`, and
`scripts/check-no-stringly-typed.ts`.

Working tree clean.

## Verified

Each commit, none of it piped: `bun test` **323 / 324 / 324 pass, 0 fail, exit
0**; `typecheck`; `depcruise` (101 modules); `check:doc-comments`,
`check:tests-assert`, `check:stdout`, `check:migrations`, and the two new
scripts — all clean.

**Every guard added was watched to fail**, and three results came from disproof
rather than from a green suite:

- The replacement `mayRead` read carried a `?? []` fallback. A sentinel inside
  it never appeared across 17 passing tests — `planWork` always writes the
  property, so it was the same defect being deleted, in shorter code.
- Deleting the provisioning loop turns the new reconciliation test red;
  deleting `Claim: ["name"]` makes `check:prop-classes` name it; reverting one
  signature makes `check:no-stringly-typed` name it.
- Both new checkers found something on their first run:
  `check:prop-classes` two mis-classified timestamps, `check:no-stringly-typed`
  eight positions the manual pass had missed.

## Open

**The refactor shipped three defects that no type caught, and one of them is
worth more than the refactor.** Cypher params are `Record<string, unknown>`, so
`{ id: gate }` where `{ id: gate.id }` was meant compiles, binds a `{kind, id}`
object as the parameter and matches nothing. The suite went 35 failures → 19 →
1 as they came out.

The last was `sameScope = left.enquiry === right.enquiry`. Those were strings;
they are objects now, so `===` is **reference equality** — always false, and
type-correct because both sides have the same type. It reported two claims in
one line of enquiry as being in different ones, turning a contradiction into a
dissociation. S-5 caught it. **Compare `.id`, never handles**; both blind spots
are now in CLAUDE.md beside the rule.

**That is new evidence on a parked question.** A branded-string `Ref` would not
have this failure mode at all, since `===` on branded strings is value equality.
The parked measurement (~470 compiler-enumerated edits; `.kind` read at runtime
in two places; `labelForNaturalId()` already deriving the same fact from the
prefix) now has an argument beside it that it did not have when the decision was
taken.

**`INDEXED_PROPS` and the annotations are two copies of one fact**, kept
because they fail silently in opposite directions — a missing entry is a
sequential scan nobody sees, a spurious one an index nobody reads. Generating
the table from the types is the honest end state and is not done.

**`Computation.kind` holds `input.method`** — free-text prose — while
`Artefact.kind` holds actual kinds. The classification exposed it and does not
settle it.

**Recorded, not built: `(proposition, enquiry)` is a hidden entity.**
Withdrawable as a unit, able to block a write, with no node, id, `Ref` or report
type. Wants a journal entry; CLAUDE.md's bar for a model change is a scenario
showing a wrong answer, and nothing here is wrong today.

## Next

PR #15 awaits review. Then the persisted event store: `labkit_event` declared in
`src/db/schema.ts`, `emit` made async and moved inside each verb's
`inTransaction`, and the minted-ids collector on `TenantGraph` whose residue
guard is one line in `inTransaction`'s existing `finally`. `emit`'s `subject`
gets its type there — it is allowlisted in `check:no-stringly-typed` for exactly
that reason.
