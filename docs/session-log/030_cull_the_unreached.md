# 030: cull the unreached, name the strings, make a handle the id

**Session wrap, 2026-08-24, on `refactor/branded-ref`.** Not a decision record —
the reasoning is in four commit messages and PRs #13/#14/#15/#16.

**The baseline is much wider than this entry.** It is still pinned at `72dbe15`
from the start of a long session; everything up to `3ca3cd0` belongs to entries
022-028, and `eb431c3`/`ed8ef3a` to entry 029. This entry covers `ec852d0`,
`65e8064`, `9173db4` and `2ae3370`.

## Goal

Housekeeping before the persisted event store: delete what nothing reaches, say
what LabKit does with each stored string, stop signatures taking bare ones, and
— unparked once Part 3 produced the evidence for it — make a handle *be* its id.

## Changed

**`ec852d0` — cull dead behaviour, and store a list as a list.** Merged, PR #13.
Three `core.ts` methods with zero references anywhere, `ClaimSubject`, and the
whole Decision-closure lifecycle (`closeDecision()`, `is_open`, `closed_at`, the
validator, its five tests). `Task.inputs` (a JSON string) became `Task.mayRead`
(a native agtype array).

**`65e8064` — the string taxonomy, and indexes generated from it.** Merged,
PR #14. `IndexedString`, `Timestamp`, `IdentityString`, `ReadOnlyString<T>`,
`Prose` on every property of all thirteen `*Props`; `INDEXED_PROPS`,
`ensurePropertyIndexes()`, `check:prop-classes`.

**`9173db4` — no bare `string` in a domain service signature.** Merged, PR #15.
`UnitRef`, `scopeParams()`, ~29 positions converted, `check:no-stringly-typed`.

**`2ae3370` — a handle is the id.** Open as PR #16. `Ref<K>` became
`string & { readonly [KIND]: K }`; `ref()` gained a prefix check that refuses a
mismatch; the MCP wire format became `"GATE_1"` rather than
`{"kind":"gate","id":"GATE_1"}`, and `docs/mcp-tools.md` regenerated 112/319.
37 files.

**Branch cleanup.** 19 local and 15 remote branches deleted, each verified
merged into `origin/main` first — including one that looked unmerged and was
not: `fix/readme-exit-code` carried session-log 025, already on main
byte-identical via `perf/query-loops`. The `labkit-minion` worktree was removed
after checking it had no uncommitted or untracked files and no stash.

Working tree clean.

## Verified

Each commit, none of it piped: `bun test` **323 / 324 / 324 / 325 pass, 0 fail,
exit 0**; `typecheck`; `depcruise` (101 modules); and every `check:*` script,
including the two added here.

**Both new checkers found something on their first run**, which is this repo's
stated bar for adding one: `check:prop-classes` two mis-classified timestamps,
`check:no-stringly-typed` eight positions the manual pass had missed. Every
guard added was also watched to fail on a deliberate revert.

**Three results came from disproof rather than a green suite.** A sentinel
placed in a `?? []` fallback never appeared across 17 passing tests, proving it
unreachable — the same defect being deleted, in shorter code. Deleting the
provisioning loop turns the index test red. Deleting `Claim: ["name"]` makes
`check:prop-classes` name it.

## Open

**The `{kind, id}` shape lasted one commit and both its failure modes shipped
in it.** Cypher params are `Record<string, unknown>`, so a handle bound as a
parameter type-checks and matches nothing — three of those. And
`left.enquiry === right.enquiry` was reference equality: always false, entirely
type-correct, and it turned a contradiction into a dissociation until S-5 caught
it. Neither is expressible under the branded form.

**The branded form has one failure mode of its own, and it is the mirror
image.** A `string | Ref` union is invisible at runtime, so `typeof` cannot
discriminate it — `whatDependsOn` sent every handle to be looked up by logical
name and threw `no artefact named "ART_21"`. **Discriminate on the prefix, never
on `typeof`.** In CLAUDE.md beside the other two.

**`INDEXED_PROPS` and the type annotations are two copies of one fact**, kept
because they fail silently in opposite directions. Generating the table from the
types is the honest end state and is not done.

**`Computation.kind` holds `input.method`** — free-text prose — while
`Artefact.kind` holds actual kinds. The classification exposed it and does not
settle it.

**Recorded, not built: `(proposition, enquiry)` is a hidden entity.**
Withdrawable as a unit, able to block a write, with no node, id, `Ref` or report
type. CLAUDE.md's bar for a model change is a scenario showing a wrong answer,
and nothing here is wrong today.

**`feat/webapp` has never been pushed** and is checked out in another worktree.
Left alone; that session's work exists only on this machine.

## Next

PR #16 awaits review. Then the persisted event store: `labkit_event` declared in
`src/db/schema.ts`, `emit` made async and moved inside each verb's
`inTransaction`, and the minted-ids collector on `TenantGraph` whose residue
guard is one line in `inTransaction`'s existing `finally`. `emit`'s `subject`
gets its type there — it is allowlisted in `check:no-stringly-typed` for exactly
that reason, and the handle shape it will store is now settled.
