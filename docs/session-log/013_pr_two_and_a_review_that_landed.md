# 013: PR #2, the review it drew, and the read layer shipped

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record. The
multi-pursuit finding below needs a decision that has not been made.

## Goal

Open a PR for the MCP work, act on the external review it drew, write down the
scenario behind its sharpest finding, and close the two adapter gaps the review
exposed.

## Changed

Three commits plus this entry.

**`92f726e`** — `docs/TASKS.md`, +61 lines, the three findings below. No code.

**`ed71481`** — the scenario and its demonstration:

- **`docs/project-journal/030_which_record_is_this_about.md`** (new) — the
  scenario in PJ-008's conversation form, although that corpus is closed; this
  one came from exposing the whole domain over MCP.
- **`tests/subject-identity.test.ts`** (new) — five tests, one file, all three
  ambiguities.
- `CLAUDE.md` — one paragraph: *identity is never wording* now names its other
  half and points at both files.

**`596e699`** — the two gaps closed:

- `src/mcp/tools.ts`, `schemas.ts` — the **six unreachable reads exposed**:
  `origin_of`, `contract_for`, `criteria_governing`, `gate_status`,
  `do_these_conflict`, `reproducibility_of`. Every public verb on both surfaces
  is now an MCP tool.
- **`tests/helpers/surface-coverage.ts`** (new) — the derived check that would
  have caught it.
- **`docs/mcp-tools.md`** (new, 839 lines) + `scripts/render-tool-docs.ts` +
  `bun run docs:tools`.
- `CLAUDE.md`, `docs/TASKS.md` — the new file described, the queue item closed.

Off-tree: `feat/mcp-server` pushed, **PR #2** (`danbarua/labkit#2`) now **23
commits**, head `596e699`, plus a comment carrying the corrections below.

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

**After `596e699`: `bun test` 294 pass, 0 fail, 39 files, 109.9s**; all five
gates green. Both new mechanisms were demonstrated by breaking them — deleting
`gate_status` fails the coverage assertion; appending a line to
`docs/mcp-tools.md` fails the freshness one.

**After `ed71481`: `bun test` 292 pass, 0 fail, 39 files, 107.4s**; typecheck,
depcruise, `check:doc-comments`, `check:tests-assert` green. The first
background run of the suite was **killed before producing output** and was
re-run rather than reported — a killed run is not a passing one.

**The scenario Dan asked for**, and it decided something by being written:

> Two teams on one question. Ana's seed sweep is conclusive and gets closed.
> Next morning Bruno asks where his ablation is up to, and LabKit says
> "answered", offering Ana's evidence as his.

Writing it out **ruled out both options previously put to Dan.** Both assumed
`enquiryStatus` reports one state; the conversation says Bruno needs two facts —
the question is answered, and his line produced nothing — and collapsing them is
what produces the wrong answer. That is the same shape as S-1 refusing to
collapse `untested` into `unresolved`.

**Dan's reframing is the substance of the entry.** This is *identity*, asked
from the other end. The six previous instances all ask *are these two records
the same one?*; this asks *which record is this answer about?* — a reference
denoting one record while the verb answers about another:

| reference | the id denotes | what the verb takes it to mean |
| --- | --- | --- |
| `EnquiryRef` into `enquiryStatus` | a line of enquiry | the **question** it pursues |
| `ObservationsRef` | an artefact of either kind | "observations", asserted by `kind` |
| `AnalysisRef` as an input | a computation | that computation's **output artefact** |

The sharpest assertion in the new file: Ana's and Bruno's reports differ in
**exactly one field** — the id of the thing they claim to be about — proved by
stripping it and comparing the rest.

## Open

- **Multi-pursuit closure is still undecided**, and PJ-030 says so rather than
  deciding. The likely direction — two reads, each answering about what it was
  given — is a guess from **one** conversation, and one conversation is not a
  corpus. Whether two verbs earn their place where one stands needs a reader;
  Bruno is that reader if the conversation is right.
- **One diagnosis, possibly three remedies.** Rows 2 and 3 may not want row 1's
  fix: the `AnalysisRef` dereference is convenient and writes the correct edge,
  and making it honest would mean callers naming artefacts they do not hold.
- **`tests/subject-identity.test.ts` is green while the ambiguities are
  present.** Its header says so, because a green tick otherwise reads as
  approval. Fixing row 1 turns it red on purpose.
- **`docs/mcp-tools.md` will appear in the diff of any commit touching
  `src/mcp/tools.ts`.** That is the cost the dependency-graph decision rejected
  on 2026-08-21, accepted here for a reason stated in CLAUDE.md rather than
  glossed: this document's diff is the signal, where the graph's byte-stability
  existed to suppress noise. If it becomes annoying, the honest fix is to stop
  checking it in, not to stop asserting it.
- **`NOT_EXPOSED` is empty.** That is today's state, not a claim it must stay
  empty; the mechanism exists so an exclusion has to carry a reason.
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

Both blocked discriminators are now runnable, because the reads they need are
exposed:

1. **Cold task resumption.** Agent A plans work, declares its gate and exits.
   Agent B reconnects holding nothing and asks: what work am I to do, why does
   it exist, what may I read, what would count as done, what is blocking it?
   `contract_for` and `gate_status` are the reads that make this answerable at
   all; whether they make it *sufficient* is the actual question, and it is the
   real test of the Task model.
2. **Whether `AnalysisRef` assumes one canonical output.** Recorded in PJ-030 as
   row 3, downstream of the artefact-identity question rather than separate
   from it.

Undecided and waiting on Dan: multi-pursuit closure (PJ-030 §3).

**Two things I got wrong that are worth carrying forward.** A rendered preamble
claiming "there is no stored copy" would have shipped false the moment the copy
was checked in — caught because the sentence was about the thing being changed.
And the coverage check had to read *source* rather than the prototype: TS's
`private` is compile-time only, so `getOwnPropertyNames` cannot tell
`outputArtefactOf` from `recordAnalysis`.

This entry is closed. The next piece of work opens 014.
