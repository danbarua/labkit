# 030: cull the unreached, then name the strings

**Session wrap, 2026-08-24, on `chore/string-taxonomy`.** Not a decision
record — the reasoning for what was kept versus deleted, and for keeping two
copies of one fact, is in the commit messages and PRs #13/#14.

**The baseline is much wider than this entry.** It is still pinned at `72dbe15`
from the start of a long session; everything up to `3ca3cd0` belongs to entries
022-028, and `eb431c3`/`ed8ef3a` to entry 029. This entry covers `ec852d0` and
`65e8064`.

## Goal

Housekeeping before the persisted event store: delete what nothing reaches, and
replace the one `string` on every node property with names that say what LabKit
does with it.

## Changed

**`ec852d0` — cull dead behaviour, and store a list as a list.** Merged as
PR #13. Eleven files, +105/−170.

- `src/domain/core.ts` — `claimFor`, `enquiriesClaiming` and
  `enquiryAddressedBy` deleted; **zero references anywhere**, verified
  unfiltered. The header's "nine, not five" went with them: it named two of the
  three as pulled in by transitive closure, a numeral asserting a membership
  nobody re-derived.
- `src/domain/report.ts` + four import sites — `ClaimSubject`, exported and used
  by nothing.
- `src/db/graph.ts`, `src/db/domain.ts`, `tests/domain-graph.test.ts` — the
  whole Decision-closure lifecycle: `closeDecision()`, `is_open`, `closed_at`,
  the biconditional validator, its five tests. `NodeType.validate` **kept** as
  the seam a per-label invariant attaches to.
- `Task.inputs` (a JSON string) became `Task.mayRead` (a native agtype array),
  deleting a `JSON.parse`, a try/catch, an `Array.isArray` check and a `typeof`
  filter.

**`65e8064` — the string taxonomy, and indexes generated from it.** Open as
PR #14. Six files, +428/−42.

- `src/db/domain.ts` — `IndexedString`, `Timestamp`, `IdentityString`,
  `ReadOnlyString<T>`, `Prose`, applied to every property of all thirteen
  `*Props` interfaces; plus `INDEXED_PROPS`, the runtime table.
- `src/db/provisioning.ts` — `ensurePropertyIndexes()`, looped per label
  beside the natural-id indexes.
- `scripts/check-prop-classes.ts` (new), `package.json` — the checker holding
  the table to the annotations, via the TypeScript compiler API.
- `tests/reconciliation.test.ts` — one test: the index is built, is non-unique,
  and is restored on re-resolve after being dropped.
- `CLAUDE.md` — the taxonomy in the `src/db/` section, the new script in two
  lists, and the `EvidenceUnitRole` contrast re-pointed at the type that now
  carries the fact.

Working tree clean.

## Verified

Both commits, none of it piped.

- `bun test` — `ec852d0`: **323 pass, 0 fail, exit 0**. `65e8064`: **324 pass,
  0 fail, exit 0**.
- `typecheck`, `depcruise` (101 modules, 337 dependencies), `check:doc-comments`,
  `check:tests-assert`, `check:stdout`, `check:migrations`, `check:prop-classes`
  — all clean.

**Three things were verified by disproof rather than by a green suite**, which
is the part worth trusting:

- The `mayRead` read carried a `?? []` fallback. A sentinel inside it never
  appeared across 17 passing tests, so it was unreachable — `planWork` always
  writes the property. It was the same defect being deleted, in shorter code.
- Deleting the provisioning loop turns the new reconciliation test red.
- Deleting `Claim: ["name"]` from `INDEXED_PROPS` makes `check:prop-classes`
  name it.

**Two checkers caught something they were not aimed at.**
`check:prop-classes` found `Computation.started_at`/`finished_at` annotated
`Timestamp` and missing from the table on its **first run**, which is this
repo's stated bar for a new check script. `check:doc-comments` caught the
taxonomy's overview written as a doc comment above another doc comment rather
than above a declaration.

## Open

**`INDEXED_PROPS` and the annotations are two copies of one fact.** Kept
deliberately, argued in the commit and the script header: the copies fail
silently in opposite directions — a missing entry is a sequential scan nobody
sees, a spurious one an index nobody reads, and neither shows up in a test
because both spellings return the same rows. Generating the table from the
types (the `docs/mcp-tools.md` pattern) is the honest end state and is not done.

**`Computation.kind` holds `input.method`** — free-text prose — while
`Artefact.kind` holds actual kinds. The classification exposed it and does not
settle it: either the property is misnamed or the writes are misusing it.
Recorded in the type's doc comment.

**Part 3 is unbuilt** — ~21 signature conversions in `core.ts`/`read.ts`/
`write.ts`, `UnitRef` for the one natural-id prefix with no `Ref` type, and
`check:no-stringly-typed`.

**Parked by decision: the branded `Ref`.** `.kind` is read at runtime in exactly
two places, and `labelForNaturalId()` already derives the same fact from the
prefix — so `{kind: "claim", id: "GATE_1"}` is constructible today and nothing
catches it. Measured at ~470 compiler-enumerated edits.

**Recorded, not built: `(proposition, enquiry)` is a hidden entity.** It is
withdrawable as a unit and can block a write, with no node, no id, no `Ref` and
no report type. Wants a journal entry; CLAUDE.md's bar for a model change is a
scenario showing a wrong answer, and nothing here is wrong today.

## Next

PR #14 awaits review. Then Part 3: start at `core.ts`'s `workGatedBy` and
`confirmatoryResultsBehind`, both taking `gates: string[]` that hold GATE_ ids,
and add `UnitRef` for `unitOf()` at `write.ts:1560`.
