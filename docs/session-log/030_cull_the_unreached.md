# 030: cull the unreached, name the strings, make a handle the id

**Session wrap, 2026-08-24 into 08-25, on `refactor/internal-handles`.** Not a
decision record — the reasoning is in five commit messages and PRs #13-#17.

**The baseline is much wider than this entry.** It is still pinned at `72dbe15`
from the start of a long session; everything up to `3ca3cd0` belongs to entries
022-028, and `eb431c3`/`ed8ef3a` to entry 029. This entry covers `ec852d0`,
`65e8064`, `9173db4`, `2ae3370` and `9d37ec9`.

## Goal

Housekeeping before the persisted event store: delete what nothing reaches, say
what LabKit does with each stored string, stop signatures taking bare ones,
make a handle *be* its id, and carry that inward to the internal collections.

## Changed

**`ec852d0` — cull dead behaviour, and store a list as a list.** Merged, PR #13.
Three `core.ts` methods with zero references anywhere, `ClaimSubject`, and the
whole Decision-closure lifecycle. `Task.inputs` (a JSON string) became
`Task.mayRead` (a native agtype array).

**`65e8064` — the string taxonomy, and indexes generated from it.** Merged,
PR #14. Five names on every property of all thirteen `*Props`; `INDEXED_PROPS`,
`ensurePropertyIndexes()`, `check:prop-classes`.

**`9173db4` — no bare `string` in a domain service signature.** Merged, PR #15.
`UnitRef`, `scopeParams()`, ~29 positions, `check:no-stringly-typed`.

**`2ae3370` — a handle is the id.** Merged, PR #16. `Ref<K>` became
`string & { readonly [KIND]: K }`; `ref()` gained a prefix check; the wire
format became `"GATE_1"`, and `docs/mcp-tools.md` regenerated 112/319.

**`9d37ec9` — internal collections key on handles.** Open as PR #17. Twenty-two
`Map`/`Set`/array locals; the checker widened to walk into `Map`/`Set` type
arguments.

**Branch cleanup.** 19 local and 15 remote branches deleted, each verified
merged into `origin/main` first — including one that looked unmerged and was
not. The `labkit-minion` worktree was removed after checking it had no
uncommitted or untracked files and no stash.

Working tree clean.

## Verified

Each commit, none of it piped: `bun test` **323 / 324 / 324 / 325 / 325 pass, 0
fail, exit 0**; `typecheck`; `depcruise` (101 modules); every `check:*` script,
including the two added here.

**Both new checkers found something on their first run**, which is this repo's
bar for adding one: `check:prop-classes` two mis-classified timestamps,
`check:no-stringly-typed` eight positions the manual pass had missed. Every
guard added was watched to fail on a deliberate revert.

**What line counts say, because it is not what you would guess.** `src/` grew by
**42 code lines** across #16 (comments excluded). What shrank is inside the
lines: `.id` occurrences across `src`+`tests` went **409 → 12**, and
`docs/mcp-tools.md` lost 207 lines. The simplification is per-expression, not
per-line, and the session as a whole *added* lines — two check scripts and a lot
of doc comments.

## Open

**The `{kind, id}` shape lasted one commit and both its failure modes shipped in
it.** A handle bound as a Cypher param type-checks and matches nothing (params
are `Record<string, unknown>`) — three of those. And
`left.enquiry === right.enquiry` was reference equality: always false, entirely
type-correct, turning a contradiction into a dissociation until S-5 caught it.
Neither is expressible now.

**The branded form has one failure mode of its own, the mirror image.** A
`string | Ref` union is invisible at runtime, so `typeof` cannot discriminate it
— `whatDependsOn` threw `no artefact named "ART_21"`. **Discriminate on the
prefix, never on `typeof`.**

**Typing the internal collections caught a wrong reading of the code.**
`inputNames`/`retracted` are keyed by the caller's `InputRef`, which may be an
analysis, not by the artefact it resolves to; the compiler refused the guess.
And `amendmentChain` was minting one handle four times in a loop because its map
key stayed a raw string — a conversion repeated at each use belongs one level up.

**`INDEXED_PROPS` and the type annotations are two copies of one fact**, kept
because they fail silently in opposite directions. Generating the table from the
types is the honest end state and is not done.

**`Computation.kind` holds `input.method`** — free-text prose — while
`Artefact.kind` holds actual kinds. Exposed by the classification, not settled.

**Recorded, not built: `(proposition, enquiry)` is a hidden entity.**
Withdrawable as a unit, able to block a write, with no node, id, `Ref` or report
type.

**`feat/webapp` has never been pushed** and is checked out in another worktree.

## Next

PR #17 awaits review. Then the persisted event store: `labkit_event` in
`src/db/schema.ts`, `emit` made async and moved inside each verb's
`inTransaction`, and the minted-ids collector on `TenantGraph` whose residue
guard is one line in `inTransaction`'s existing `finally`. `emit`'s `subject`
gets its type there — allowlisted in `check:no-stringly-typed` for exactly that
reason, and the handle shape it will store is now settled.
