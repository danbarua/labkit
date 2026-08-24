# 030: cull the unreached

**Session wrap, 2026-08-24, on `chore/cull-dead-behaviour`.** Not a decision
record — the reasoning for what was kept versus deleted is in the commit
message and PR #13.

**The baseline is much wider than this entry.** It is still pinned at `72dbe15`
from the start of a long session; everything up to `3ca3cd0` belongs to entries
022-028, and `eb431c3`/`ed8ef3a` to entry 029. This entry covers `ec852d0`
alone.

## Goal

Housekeeping before the persisted event store: delete what nothing reaches, and
audit the domain layer's stringly-typed surface.

## Changed

**`ec852d0` — cull dead behaviour, and store a list as a list.** Eleven files,
+105/−170. Open as PR #13.

- `src/domain/core.ts` — `claimFor`, `enquiriesClaiming` and
  `enquiryAddressedBy` deleted; **zero references anywhere**, verified
  unfiltered. The header's "nine, not five" went with them: it named two of the
  three as pulled in by transitive closure, a numeral asserting a membership
  nobody re-derived.
- `src/domain/report.ts` + four import sites — `ClaimSubject` deleted, exported
  and used by nothing.
- `src/db/graph.ts`, `src/db/domain.ts`, `tests/domain-graph.test.ts` — the
  whole Decision-closure lifecycle: `closeDecision()`, `is_open`, `closed_at`,
  the biconditional validator, its five tests. `NodeType.validate` **kept** as
  the seam a per-label invariant attaches to.
- `src/db/domain.ts`, `src/domain/write.ts`, `src/domain/read.ts` —
  `Task.inputs` (a JSON string) became `Task.mayRead` (a native agtype array),
  deleting a `JSON.parse`, a try/catch, an `Array.isArray` check and a `typeof`
  filter.
- `tests/domain-session.test.ts` — one test added, the empty contract in both
  spellings.
- `CLAUDE.md`, `tests/helpers/read-only.ts` — prose that cited `closeDecision`.

Working tree clean.

## Verified

All on `ec852d0`, none piped.

- `bun test` — **323 pass, 0 fail, exit 0**, 1759 assertions, 48 files. That is
  327 − 5 deleted + 1 added, which is the number the plan predicted.
- `bun run typecheck` — clean.
- `npx depcruise src tests --output-type err` — no violations, 101 modules.
- `check:doc-comments`, `check:tests-assert`, `check:stdout` — clean.

**The `mayRead` change was verified by disproof, not by a green suite.** The
replacement read carried a `?? []` fallback; putting a sentinel value inside it
and running the file showed 17 pass with the sentinel never appearing, so the
fallback was unreachable — `planWork` always writes the property. It was the
same defect as the guards being deleted, in shorter code. Removed.

## Open

**Two audits produced findings larger than this PR**, all recorded in the plan
file rather than acted on:

- **`Computation.kind` holds `input.method`** — the researcher's free-text
  method description, not a kind, while `Artefact.kind` holds real kinds. Either
  the property is misnamed or the write is misusing it.
- **`(proposition, enquiry)` is a hidden entity.** It is withdrawable as a unit
  and can block a write, with no node, no id, no `Ref` and no report type.
  Wants a journal entry; CLAUDE.md's bar for a model change is a scenario
  showing a wrong answer, and nothing here is wrong today.
- **Parked: the branded `Ref`.** `.kind` is read at runtime in exactly two
  places, and `labelForNaturalId()` already derives the same fact from the
  prefix — so `{kind: "claim", id: "GATE_1"}` is constructible today and nothing
  catches it. Measured at ~470 compiler-enumerated edits; deferred by decision.

**Parts B and C of the plan are unbuilt.** B is the five string types,
`INDEXED_PROPS` and generated indexes; C is ~21 signature conversions and
`check:no-stringly-typed`.

**`Claim.name` and `Artefact.logical_name` are still unindexed** — all twelve
`MATCH (c:Claim {name: $name})` sites are sequential scans. That is PR B's
measurable win and it is not in yet.

## Next

PR #13 awaits review. Then Part 2: add the five types to `src/db/domain.ts`,
`INDEXED_PROPS` beside `NODE_LABELS`, and the index loop in
`provisionTenantGraph()` next to the natural-id one at `provisioning.ts:194`.
