# 016: Report handles are Refs, not strings

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record — the
diagnosis is `docs/project-journal/030_which_record_is_this_about.md`, and the
one thing still wrong is named under Open.

## Goal

Stop collapsing domain entities to strings in the read models.

## Changed

One commit, `9c1e8f7`. Every report handle is now its `Ref` type.

- `src/domain/report.ts` — **`ClaimRef`, `EvidenceRef`, `EvaluationRef`,
  `DecisionRef`** added; claims had **no handle at all**. Every `: string`
  handle field became its ref. Criterion propositions in amendment history
  became `Condition {criterion, requires}`, reusing `UnmetCheck`'s shape rather
  than a third convention.
- `src/domain/read.ts`, `core.ts`, `write.ts` — ~40 construction sites mint
  refs via a new `ref(kind, id)` helper.
- `src/mcp/schemas.ts` — schemas mirror the refs; the `Exact<>` gates hold.
- `src/cli.ts` — every `${x.handle}` interpolation takes `.id`.
- `docs/mcp-tools.md` regenerated (+300 lines: the wire shapes changed).

## Verified

- **`bun test` 299 pass, 0 fail, 39 files, 137.9s.** typecheck, depcruise,
  `check:doc-comments`, `check:tests-assert`, `check:stdout` green.

**The method was the finding.** Dan's instruction was *"we're using TypeScript,
there's an LSP, this shouldn't be hard"* — change the type and let `tsc`
enumerate. **155 errors → 0**, and every one was a site collapsing an entity.
Nothing was found by reading code. The two previous commits had gone looking by
hand and missed most of them.

**What the compiler found that reading had not:**

- **`void replacement;`** in `amendDesign` — the amended criterion was created
  and its handle *explicitly discarded*, so the report named both conditions by
  wording and a caller could reach neither.
- Twelve report fields returning bare ids where the matching verb takes a
  `Ref` — so a caller could not feed a report back into a verb without
  hand-wrapping `{kind, id}`. `DesignHistory.criterion: CriterionRef` was
  already correct **in the same file**.

## Open

**`ConclusionRef` is still a claim identified by wording**, and I defended it as
"a legitimate convenience" before Dan asked how that could be legitimate. It is
not:

> `ConclusionRef {analysis: AnalysisRef, proposition: string}` exists because
> `recordAnalysis` mints one claim per conclusion and **returns only the
> analysis**, so callers must re-identify claims by text.

That is CLAUDE.md's own heuristic — *does the act record what it produced, or
only what it acted on?* — failing for the **fifth** time, after S-1, S-7, S-12
and S-3c. The workaround was built around the gap instead of the gap being
closed.

**The fix:** `recordAnalysis` returns the `ClaimRef`s it minted, and
`ConclusionRef` stops being an identity type. Not done.

Also still wording-only: `InterpretationHistory.originally` / `.nowClaims`,
`Revision.previously` / `.nowClaims`, `ReinterpretationReport.previously` /
`.nowClaims`, and `ReplacementReport.affected` / `.unchanged`. All four are
claim propositions, and all four are downstream of the same thing — nothing
hands a caller a `ClaimRef`, because the verb that mints claims does not
return them.

## Next

`recordAnalysis` returns its claims. That is one change, and it unblocks the
four remaining wording-only fields and retires `ConclusionRef` as an identity
in the same move.
