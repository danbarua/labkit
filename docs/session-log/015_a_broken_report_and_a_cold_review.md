# 015: A broken report, a cold review, and the defects it found

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record. The
review's findings are unactioned and listed below; the scenario and diagnosis
are `docs/project-journal/030_which_record_is_this_about.md`.

## Goal

Settle whether multi-pursuit closure was fixed by carrying the question's id;
check cold whether the identifier work made the read layer simpler; then fix
what the check found.

## Changed

Three code commits.

**`f3bc50e` — the broken report.**

- `src/domain/report.ts` — `EnquiryStatus` restructured to
  `{enquiry, pursuing, contributed, question: QuestionClosure | null}`.
  `QuestionClosure` is new and holds what used to be flattened onto the enquiry.
- `src/domain/read.ts` — `enquiryStatus` gains a query for what **this** pursuit
  produced; all four returns nest the question's state.
- `src/cli.ts`, `src/mcp/schemas.ts`, `docs/mcp-tools.md`, and every assertion
  site across nine test files.

**`52f6b49` — the review's six dedup defects.**

```
core.ts  workGatedBy               Set<objective>  -> Map by TASK_n
core.ts  confirmatoryResultsBehind Set<claim name> -> Map by CLM_n
core.ts  decidedOnTheStrengthOf    Set<q name>     -> Map by Q_n
read.ts  sideOf                    Set<statement>  -> dedupeById
read.ts  amendmentChain citing     Set<statement>  -> Map by EV_n
write.ts reinterpret carried       Set<statement>  -> Map by EV_n
```

Plus `QuestionOrigin.knownAtTheTime`, `ReproductionReport`'s two computations,
and `ConflictSide` — which had four entity-naming fields and no identifier at
all. `claimFor` moved from `WriteSurface` to `SessionCore` for that, and
generalised to both bearings.

**`09602cb` — the rest, and one refutation.** `EvaluationRecord`,
`UnaffectedRecord`, `TaskContract`, `withdrawalOf`'s `replacedBy`, and
`interpretationHistory`'s loop guard. Two dead fallbacks removed. PJ-030 gains
§8.

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

**A paired measurement, and it is the method note from this session.** A full
run gave **29 failures at 478s** with `Ran 302` against 299 — the double-count
tell. **S-1 was newly among them and I had just added queries**, so attributing
it to the flake would have been a guess. Paired instead: S-1 at **2.40s with the
changes, 2.19s with them stashed**, against a 10,000ms timeout. Not mine. Clean
re-run: **299 pass, 0 fail, 132.8s**.

One genuine failure surfaced that way and was fixed — the CLI rendered
`why.replacedBy` as a string after it became an object.

**One review finding was refuted, not fixed.** It flagged `enquiryStatus`
deriving `answer: "no"` from an unscoped `CHALLENGES` match. Unreachable:
`CHALLENGES` has exactly one writer on an exclusive branch, so an `Evidence`
carries one bearing edge ever. Probed with an analysis concluding both ways —
answer came back `yes`, correctly. **A static read inferred a path no writer can
produce**, which is the failure mode a cold reviewer is most prone to, and worth
recording beside everything it got right.

## Open

The cold review's verdict on whether the identifier work made the read layer
simpler with fewer bugs was **no, with numbers**. Recorded here because the
finding outlived the fixes:

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
**Still carrying wording where an id exists**, recorded rather than fixed:
`ReplacementReport.affected` / `unchanged` / `changed[].proposition`,
`AmendmentRecord.replaced` / `nowRequires`, and `Revision` /
`InterpretationHistory`'s claim wording.

**`interpretationHistory` walks by name.** Its loop guard is id-keyed now, so
the false "loops at" is gone, but the traversal still resolves claims by text.
It wants the treatment `whySupported` has: take a `ClaimSubject` and refuse on
ambiguity.

**My audit was scoped to four reports and I treated that as the problem's
extent.** That is the reusable error, and it is why the review was worth
running: the defect class ran straight past the table I drew, and six more
instances were sitting in shared helpers feeding MCP-exposed tools.

## Next

The four remaining wording-only fields above, and `interpretationHistory`'s
name-based traversal. None is a demonstrated wrong answer; they are the same
class as everything else in PJ-030 §4 and want the same treatment.

This entry is closed. The next piece of work opens 016.
