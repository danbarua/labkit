# 016: Handles, not strings — reports, then every verb

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record — the
diagnosis is `docs/project-journal/030_which_record_is_this_about.md`, and the
one thing still wrong is named under Open.

## Goal

Stop collapsing domain entities to strings — first in the read models, then in
the verbs, until nothing has to search for what the caller meant.

## Changed

Three code commits. Tree clean.

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

- After `9c1e8f7` and `dc07629`: **299 pass, 0 fail**.
- After `0564bb7`: **298 pass, 0 fail, 39 files, 143.2s.** All five gates green.
  (One test fewer: S-5's "an ambiguous proposition is refused" and the MCP
  "half-given answer" test were replaced by assertions at the seam the refusal
  moved to.)

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

**`0564bb7` — no verb searches for what the caller meant.**

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

### What finishing it turned up — worth more than the refactor

**Two more instances of the minting defect, found by tests that could not name
a claim.** `replaceAnalysis` and `reverify` both mint claims and returned only
refs, so after either there are **two** claims asserting a sentence and a caller
could name neither. Both now return `claims`. Sixth and seventh time
CLAUDE.md's *"does the act record what it produced, or only what it acted on?"*
has caught something.

**Two real bugs I introduced, both the same shape**, and each caught by the
scenario that exists for it — walking only `SUPPORTS` where a claim may be
**challenged**:

- `scopeOf` lost the enquiry for every challenging claim → S-5's second stage
  reported an empty question.
- `closeEnquiry`'s ownership check rejected a question answered **"no"** on a
  challenging finding → S-4's entire case.

**A semantic consequence, recorded rather than papered over.** `whySupported`
could previously answer about a proposition **nobody had claimed**, reporting
`supported: false, challenged: false`. With a handle there is nothing to ask
about. S-4 and S-1 now assert `claimsAsserting(...)` is **empty**, which makes
the same distinction one step earlier and more strongly: a refuted claim
*exists* and is challenged; an unexamined sentence does not exist at all.

**And one I nearly got wrong.** `reinterpret` first operated on a single claim
node. S-12 failed, correctly: a reinterpretation narrows a **reading**, and two
analyses in one enquiry asserting the same sentence share it, so both must stop
standing. It takes a `ClaimRef` and derives (proposition, enquiry) from it.

**`ConclusionRef` is no longer an identity anywhere.** I had defended it as "a
legitimate convenience" before Dan asked how that could be legitimate. It was
not:

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

The four report fields above — `InterpretationHistory` / `Revision` /
`ReinterpretationReport`'s claim wording and `ReplacementReport.affected` /
`.unchanged`. All four now have a `ClaimRef` available, so each is a projection
change.

This entry is closed. The next piece of work opens 017.
