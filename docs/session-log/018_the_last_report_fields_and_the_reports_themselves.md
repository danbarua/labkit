# 018: the last report fields carry handles, and so do the reports themselves

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record — see
`docs/project-journal/030_which_record_is_this_about.md` for why any of this
matters.

**The range is wider than this entry.** The session baseline is pinned at
`72dbe15` and covers four commits; `ad5f99b` and `f293ee1` belong to the docs
sweep and are written up in entry 017. This entry covers `fd51642..a07898f`
only — a different goal, started after 017 was closed out.

## Goal

Resume the work queue: give the four remaining report fields that carry claim
wording a handle, per `docs/TASKS.md` → "Ready to build".

## Changed

Two commits.

**`fd51642` — the four report fields.** The queue item predicted a projection
change at each. It was right at three and wrong at the fourth, informatively:
a reinterpretation narrows a *reading*, and two analyses in one line of enquiry
reaching the same reading are withdrawn together (S-12), so
`ReinterpretationReport.previously`, `Revision.previously` and
`InterpretationHistory.originally` are `ConcludedClaim[]`. A single handle
would have re-introduced the arbitrary pick PJ-030 was opened to remove.

- `src/domain/report.ts` — the five type changes, plus `ChangedConclusion`
  gaining `was` (superseded) and `claim` (fresh). Not in the queue item;
  leaving it would have split one report's convention.
- `src/domain/write.ts` — `reinterpret` returns the narrower claim's handle
  (minted there, previously discarded). `replaceAnalysis` pairs the
  replacement's claims to the input conclusions **by index**, since
  `recorded()` mints one per conclusion in order. `conclusionsOf` returns a
  module-private `RecordedConclusion` carrying the id its query already
  selected — deliberately not the `Conclusion` command shape.
- `src/domain/read.ts` — `interpretationHistory` binds `nxt` so a step can name
  the record the decision motivated; its single-line guard covers that too, and
  its loop guard now marks every withdrawn claim per step rather than one of N.
- `src/mcp/schemas.ts` — mirrors, plus one named `concludedClaim` replacing
  eight inline copies.
- `src/mcp/tools.ts` — `interpretation_history`'s description said "takes the
  proposition as currently worded", untrue since its input became a handle.
- Tests: S-11 (`affected` vs `unchanged` disjoint, cross-check by id), S-12
  (both withdrawn claims named), S-4, `domain-session`, `mcp`.

**`a07898f` — the reports themselves.** The same question one level up:
`whySupported`, `reproducibilityOf` and `whatDependsOn` took a handle, answered
about it, and returned only wording. In-process that is redundant; over MCP the
request is gone and the response is a blob that does not identify its subject.
`whatDependsOn` also accepts a logical *name*, so a caller passing one could
not learn which record it resolved to — that echo is a real gain rather than a
tidy one. `tests/subject-identity.test.ts` asserts the round trip.

S-9b's two shape detectors fired and were updated per their own comment, not
loosened. Neither `subject` nor `analysis` answers row F: both name the record
**asked about**, not what a part was an attempt to rebuild.

Working tree clean; both commits pushed to `origin/feat/mcp-server` (PR #2).

## Verified

Run after `a07898f`, output in full:

- `bun test` — **299 pass, 0 fail**, 299 tests across 39 files, 118.38s. (The
  earlier run at `fd51642` was 298 pass / 0 fail.) Exit code ignored per
  CLAUDE.md; redirected to a file rather than piped.
- `bun run typecheck` — clean, no output.
- `npx depcruise src tests --output-type err` — `no dependency violations
  found (89 modules, 293 dependencies cruised)`.
- `check:doc-comments`, `check:tests-assert`, `check:stdout` — all OK.
- `bun run docs:tools` regenerated `docs/mcp-tools.md`; its diff is the API
  change and nothing else.

Not run: `check:migrations` (no `drizzle/` change),
`bun examples/full-lifecycle.ts`, `check:pglite-concurrency`.

One intermediate failure, expected and fixed: S-9b's `Object.keys()` detector
went red on `subject` arriving. That is the detector working.

## Open

`docs/TASKS.md` → "Ready to build" now holds **one** item, and its own cell
says it is a model question rather than a projection:
`interpretationHistory` still *walks* by wording. Walking by id wants the
revision chain to carry an edge, which has to clear the wrong-answer bar first
— and today's behaviour may be merely unanswerable, which PJ-011 §5 says does
not clear it.

Nothing else was found and left unfixed.

## Next

Asked the user, awaiting an answer: pull **the three-verb input asymmetry** out
of "Needs a discriminator" and build it? Its cell already records the consumer
failure (`replace_analysis(supersedes=A2, from=[A1])` →
`CONSUMES does not allow Computation -> Computation`) and the workaround —
asking why a claim is supported in order to learn what a computation read,
which is the "database search to use a command" shape the last three sessions
have been removing. `recordAnalysis` already dereferences an `AnalysisRef` to
its output artefact, so widening `ReplaceAnalysisCommand.from` and
`ReverifyCommand.under` to the same union needs no new edge. It sits under
"Needs a discriminator" only because it shares a root with the `ART_` naming
question, so moving it is a call about the queue rather than about the code.
