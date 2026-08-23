# 016: Handles, not strings — reports, then the verbs

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record — the
diagnosis is `docs/project-journal/030_which_record_is_this_about.md`, and the
one thing still wrong is named under Open.

## Goal

Stop collapsing domain entities to strings — first in the read models, then in
the verbs, until nothing has to search for what the caller meant.

## Changed

Two commits, and a **dirty tree** described under Open.

**`9c1e8f7` — every report handle is its `Ref` type.**

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

**`dc07629` — `recordAnalysis` returns the claims it mints.**

`{ analysis: AnalysisRef; claims: ConcludedClaim[] }`. A caller holds a
`ClaimRef` the moment the claim exists, so nothing downstream has to describe
one by wording. 217 tsc errors, all binding sites, mechanically destructured.

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

**The tree is dirty and does not pass.** `typecheck`, `depcruise` and the three
static checks are green; **`bun test` is 247/53** — of which roughly 24 are
real and ~18 are the flake (that run was 338s). It is not committable as it
stands.

What the uncommitted work does — **retiring wording as identity from the verbs**:

- `recordAnalysis` → `{analysis, claims}` (committed above); `promote`,
  `closeEnquiry`, `evaluateCriterion`, `acceptAsUnresolved`, `amendDesign`,
  `reinterpret`, `whySupported`, `doTheseConflict` and `interpretationHistory`
  all take a **`ClaimRef`**.
- **`scopeFor` and `enquiriesClaiming` are deleted** — the machinery that took a
  sentence and searched for which claim was meant. `scopeOf(claim)` replaces
  them: the scope comes *from the named claim*.
- Wording is resolved in exactly **one** place: a new `claimsAsserting` verb,
  exposed as `claims_asserting`, which returns every match and **refuses to
  pick**. The CLI and the tests both go through it.
- The MCP write tools lost their paired `*_analysis` / `*_proposition` fields
  and the both-or-neither validation that went with them; each takes one claim
  id.

**One thing I got wrong and the tests caught.** I first made `reinterpret`
operate on a single claim node. S-12 failed, correctly: a reinterpretation
narrows a **reading**, and two analyses in one enquiry asserting the same
sentence share it, so both must stop standing. It now takes a `ClaimRef` and
derives (proposition, enquiry) from that claim — semantics preserved, nothing
guessed.

**The remaining ~24 failures are the change working.** They fail with
*"X is claimed 2 times; name one"* — in scenarios where the sentence genuinely
is asserted twice (a replacement analysis re-asserting its predecessor's
proposition; S-5's two-enquiry case). Each needs the test to say which claim it
means, which is what the model has always said is required.

**`ConclusionRef` is no longer an identity anywhere in the verbs.** I had
defended it as "a legitimate convenience" before Dan asked how that could be
legitimate. It was not:

> `ConclusionRef {analysis: AnalysisRef, proposition: string}` exists because
> `recordAnalysis` mints one claim per conclusion and **returns only the
> analysis**, so callers must re-identify claims by text.

That is CLAUDE.md's own heuristic — *does the act record what it produced, or
only what it acted on?* — failing for the **fifth** time, after S-1, S-7, S-12
and S-3c. The workaround was built around the gap instead of the gap being
closed.

Still wording-only in the *reports*: `InterpretationHistory.originally` /
`.nowClaims`, `Revision.previously` / `.nowClaims`,
`ReinterpretationReport.previously` / `.nowClaims`, and
`ReplacementReport.affected` / `.unchanged`. Now unblocked — a `ClaimRef` is
available at each of them.

`interpretationHistory` still **walks** by wording internally; only its entry
point is a handle. Walking by id wants the chain to carry an edge a caller can
follow, which is a separate change.

## Next

Finish the ~24 test call-sites, each naming which claim it means. Then the four
report fields above.
