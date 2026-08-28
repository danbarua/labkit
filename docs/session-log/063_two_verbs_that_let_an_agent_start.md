# 063: two verbs that let an agent start

**Session wrap, 2026-08-28, on `feat/enumeration-verbs`.** Not a decision record
— `WorkState` in `src/domain/report.ts` carries the enum's derivation, and #66
carries the argument that settled one verb versus two.

**A second entry for this session**, opened rather than growing 061: that entry
is #83's — session registration, the write gate, `--read-only` — and no single
`## Goal` line covers both it and this. The baseline is still 061's, so the
range is wider than what is written below; 061 covers everything up to
`214a57b`, and `062` is a peer session's HTTP work, not this one's.

## Goal

Build #66's enumeration verbs, so an agent that holds no handle can find out
what is blocked and what is ready to start.

## Changed

**`7e72234`** — `Task.is_open` deleted. Written `true` by `planWork`, read by
nobody: the same flag `DecisionProps` lost on 2026-08-24, in the neighbouring
type, four days later. Its own commit and first, so the design that follows is
provably unable to read a stored flag. `outputs` stays — also written-and-unread,
but its comment names what is missing, and this one named nothing.

**`7193fc6`** — `gateList` and `workList`.

- `src/domain/read.ts` — both verbs, plus `gateStateFrom` and `workStateFrom`
  extracted as named functions.
- `src/domain/report.ts` — `ListedGate`, `ListedWork`, `WorkState`, the last
  carrying why two candidate states were dropped.
- `src/domain/session.ts` — two delegations. `ResearchSession` forwards each
  verb by hand and no coverage test notices an omission; `tsc` did.
- `src/mcp/{schemas,tools}.ts` — two `Exact<>`-held schemas and two tools.
- `src/cli/{args,commands/reads,views/gates}.ts` — `labkit gates` and
  `labkit work`, with a `--state` parser that refuses a typo rather than
  silently returning everything.
- `tests/enumeration.test.ts` **new**; `tests/mcp-smoke.test.ts` drives both
  tools, since that file refuses a tool nobody calls.

Working tree clean. Open as PR **#93**, closing #66.

## Verified

`bun run check` — **all 19 passed**.

**Mutation:** replacing `gateStateFrom(...)` in `gateList` with a constant turns
**five of six** enumeration tests red, mutation confirmed by `git diff --stat`.

**The fixture-completeness test is the control that makes the rest mean
anything.** It asserts the fixture really contains all four gate states and all
three work states — without it, every filter assertion passes by matching
nothing, which is the same green as a filter that works.

Two things the tools found rather than review:

- the decoders needed `optional()` on both `OPTIONAL MATCH` columns, and the row
  where both are NULL is exactly the ready work these verbs exist to surface.
  The decoder said so by name.
- `ResearchSession`'s hand-written delegation list, above.

## Open

**The grain did not carry, and the workaround is worth knowing before the next
all-subjects read.** `compose()` takes the anchor, so the gate-scoped check fact
composes over every gate as happily as over one — but `checkStatusForGate` is
grained `byCriterion`, and a criterion may govern several gates, so folding the
whole result by criterion merges two gates' verdicts. Rows are bucketed by gate
before `per()`. A composite grain would have had to change the fact itself, and
grains are compared by **reference**, so it would silently re-scope `gateStatus`
too. There is a test for the merge, not just a comment.

**`PRODUCES: ["Task", "Computation"]` and `["Task", "Artefact"]` have no writer
and no reader.** Named rather than culled, per the no-cull policy, and distinct
from row AD's pair, which has a writer. No state is derived from either.

**`digest` is still unbuilt and still behind #55**, deliberately: it composes
these two, and putting it first would have let it paper over the one-verb-or-two
decision.

## Next

`gh pr view 93`. With it merged, **#55** is the live issue — an agent that does
not already know an identifier can now orient, so the question becomes whether
the standup view is worth building or whether `gates`/`work` already answer it.

`docs/digest-design.md` §3 is where that was argued; its §8 prediction has
already been recorded as wrong once, so read the header table before trusting
the body.
