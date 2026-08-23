# 013: PR #2 opened, and a review that landed two hits

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record. The
multi-pursuit finding below needs a decision that has not been made.

## Goal

Open a PR for the MCP work, then act on the external review it drew.

## Changed

One commit, `92f726e` — `docs/TASKS.md` only, +61 lines. **No code changed.**

Off-tree: `feat/mcp-server` pushed and **PR #2 opened**
(`danbarua/labkit#2`, 18 commits, 19 files, +2843/−853), plus a comment on it
carrying the results below.

## Verified

Two of the review's four proposed discriminators were run **over MCP only, no
database access**, in a throwaway test deleted once it had answered. Both fire.

**1. Multi-pursuit closure — a wrong answer, not an empty one.**

```
pose Q; pursue A; pursue B
record observations + analysis in A; close A

enquiry_status(A) -> open:false, closure:"answered", evidence:["yes"]
enquiry_status(B) -> open:false, closure:"answered", evidence:["yes"]
```

B was never worked on and reports itself answered, carrying A's evidence. That
is a confidently incorrect answer, so it clears the bar in CLAUDE.md's
"Changing the graph model" without a further probe.

Not a bug: `closeEnquiry()` writes `Decision -RESOLVES-> Question` and
`enquiryStatus()` derives closure from the Question, both deliberately. Correct
while one question had one pursuit; `pursue` makes that false.

**2. Two-stage repair from a consumer's handles — fails.**

```
replace_analysis(supersedes=A2, because=R, from=[A1])
-> isError: CONSUMES does not allow Computation -> Computation
```

**PR #2's claim that this was "not a functional gap" was under-demonstrated,
and the review caught exactly the right hole.** The equivalence was measured in
entry 012 with an `ART_` id obtained inside the process; a consumer holds
`COMP_2` and never sees one. Right check, wrong boundary.

It is recoverable — the id surfaces as
`why_supported().restingOn -> [{part: "ART_4", name: "stage one output"}]` — but
only by asking why a claim is supported in order to learn what a computation
read.

**3. Read-surface coverage, counted rather than taken.** The review said four
`ReadSurface` methods were unexposed. It is **six**: `originOf`, `contractFor`,
`criteriaGoverning`, `gateStatus`, `doTheseConflict`, `reproducibilityOf`. Nine
of fifteen are reachable.

No gates re-run: the commit is Markdown.

## Open

- **Multi-pursuit closure needs a decision, not a probe**, because the status
  quo already answers wrongly. Either closure belongs to the Question and the
  verb is named at the wrong level (`resolve_question(via_enquiry=A)`, with
  `enquiry_status` reporting B as *pursuing an answered question*), or it
  belongs to the LineOfEnquiry, which then needs lifecycle semantics the model
  does not have.
- **The three recording verbs want one `InputRef`.** No graph change: the edge
  is `Computation -CONSUMES-> Artefact` whichever alias is passed.
- **Six unexposed reads**, wanting a mechanical coverage assertion rather than a
  one-off fix — every public `ReadSurface` method exposed or explicitly excluded
  with a reason, derived from the prototype the way `tests/helpers/read-only.ts`
  derives write verbs.
- **PR #2's description still contains the corrected claim** ("the whole domain
  surface"). The correction is in a comment, not the body.
- The review's other two discriminators — cold task resumption, and whether
  `AnalysisRef` assumes one canonical output — are **downstream of the read
  coverage hole** and were not run, because the reads they need are unexposed.

## Next

Dan's call on multi-pursuit closure. Everything else is buildable without it:
expose the six reads behind a derived coverage assertion, then re-run the two
discriminators that were blocked on them.
