# 015: A broken report, and a cold review that said the fix did not generalise

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record. The
review's findings are unactioned and listed below; the scenario and diagnosis
are `docs/project-journal/030_which_record_is_this_about.md`.

## Goal

Settle whether multi-pursuit closure was fixed by carrying the question's id —
then check, cold, whether the identifier work made the read layer simpler.

## Changed

One commit, `f3bc50e`.

- `src/domain/report.ts` — `EnquiryStatus` restructured to
  `{enquiry, pursuing, contributed, question: QuestionClosure | null}`.
  `QuestionClosure` is new and holds what used to be flattened onto the enquiry.
- `src/domain/read.ts` — `enquiryStatus` gains a query for what **this** pursuit
  produced; all four returns nest the question's state.
- `src/cli.ts`, `src/mcp/schemas.ts`, `docs/mcp-tools.md`, and every assertion
  site across nine test files.

## Verified

- **`bun test` 299 pass, 0 fail, 39 files, 136.5s** at load **9.73**. All five
  gates green.

**The wrong answer was demonstrated before it was fixed**, which is what settled
the disagreement. A caller doing the obvious thing — *for each pursuit of this
question, what has it produced?* — was told **one finding twice**:

```
PER PURSUIT: [{"enquiry":"LOE_1","evidence":["EV_2"]},
              {"enquiry":"LOE_2","evidence":["EV_2"]}]
FINDINGS COUNTED: 2   DISTINCT: 1
```

`enquiryStatus(LOE_2)` asserted four things of a pursuit that had produced
nothing: `closure`, `answer`, `evidence`, `restsOn`.

**I had called that a residual and Dan called it a broken report.** He was
right. I had treated *"a careful reader could cross-reference `whatDependsOn`
and work it out"* as good enough — which is the standard this repo explicitly
rejects. The bar is what the record **states**, not what a diligent reader can
reconstruct. Carrying the `QuestionRef` in the previous session made the defect
**diagnosable, not correct**; presence of a reference is not attribution.

**Three mistakes of my own, all caught by tests rather than by review.** Two
`str.replace` calls silently no-op'd and were rewritten to assert a match first.
And I asserted `ana.contributed` *equals* the closing evidence — it does not and
must not: her pursuit produced the observations **and** the analysis, while the
closure cites only the analysis. *What this pursuit produced* is not *what the
answer rests on*. I fixed the assertion, not the code.

## Open

A cold-context review agent was asked whether the identifier work had made the
read layer simpler with fewer bugs. **It answered no, with numbers**, and its
findings are unactioned:

- **Not simpler: +222 / −72** across the read layer, nothing deleted. No
  lookup-by-name removed, no re-query collapsed. `dedupeById` has **two**
  callers while five sites open-code the same thing.
- **The dedup fix did not generalise past the audit's boundary.** At least six
  surviving dedup-by-wording siblings, three in `src/domain/core.ts` shared by
  both halves, all feeding MCP-exposed tools.
- **The sharpest instance, verified directly:** `core.ts:81` and `read.ts:867`
  are the *same* `Gate -GATES-> Task` traversal. One was converted to
  `{work, objective}`; the other is still a `Set<string>` of objective text, so
  two tasks with one objective collapse in `AmendmentReport.rerun`.
- **`QuestionOrigin.knownAtTheTime`** is a bare `string[]` from the same
  `Decision -BASED_ON-> Evidence` edge that `EnquiryStatus.evidence` now reports
  as `{evidence, states}`. One edge, two shapes, one report apart.
- **A possible correctness bug, latent not demonstrated:** `enquiryStatus`
  derives `answer: "no"` from `OPTIONAL MATCH (e)-[:CHALLENGES]->(against:Claim)`
  **unscoped to the question's line of enquiry** (`read.ts:400`). Query confirmed
  unscoped. A finding that supports the question while challenging an unrelated
  claim would report the question answered "no" — PJ-030's shape again.

**My audit was scoped to four reports and I treated that as the problem's
extent.** That is the reusable error here, and it is why the review was worth
running: the defect class runs straight past the table I drew.

## Next

The three `core.ts` helpers — `workGatedBy`, `confirmatoryResultsBehind`,
`decidedOnTheStrengthOf`. Shared by both halves, all feeding MCP tools, each a
one-column query change. `decidedOnTheStrengthOf` feeds
`restingOnTheOldReading`, which is the **meaning-changes-without-type-changing**
shape `tsc` will not catch, so it wants the rename treatment recorded in
PJ-030 §5.
