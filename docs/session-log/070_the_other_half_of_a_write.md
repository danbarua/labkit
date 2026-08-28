# 070: the other half of a write

**Session wrap, 2026-08-28, on `feat/edges-in-the-event-log`.** Not a decision
record — `DomainEvent.edges` and `TenantGraph.mintedEdges` carry the argument,
and PR #110 carries what it is for.

A new entry rather than more of 065: that entry's goal was getting findings out
of a session log and into the queue, and this is a feature with a plan behind
it. 065 is closed.

## Goal

Dan asked whether the mockup's scenarios could be made composable —

> If this is labkit commands in → graph mutations out… can we make any of these
> composable?

Find out what stops that, and clear it.

## Changed

**`fe886e7`** — an act records the edges it created.

- `src/db/graph.ts` — `mintedEdges` beside `minted`, pushed in `createEdge`,
  cleared by the same outermost-transaction reset, drained by
  `drainMintedEdges()`.
- `src/db/domain.ts` — `MintedEdge`, declared beside `EdgeLabel` because
  `src/db` may not import `src/domain`.
- `src/domain/events.ts` — `edges?: readonly MintedEdge[]` on `DomainEvent`.
- `src/domain/write.ts` — `emit()` drains both buffers. **No verb changed**:
  39 `createEdge` call sites, one `createEdge` body.
- `src/db/schema.ts`, `drizzle/0006_sour_vermin.sql` — a nullable `jsonb`
  column, plus its line in `EMBEDDED` (`src/db/migrations.ts`).
- `src/cli/views/events.ts` — a `connecting` block under each event.
- `tests/event-store.test.ts` — three tests.

Working tree clean. Open as PR **#110**.

**The range is far wider than this session** — fifteen commits, of which one is
mine. #92, #93, #96–#109 belong to entries 063, 064 and 066–069 and are not
restated here.

## Verified

`bun run check` — **19/19**. `bun run test:pg` — **420 pass, 4 skip, 0 fail**
(the change is `src/db/**`, so that arm runs on the PR regardless).

**Each test made red by its own mutation:**

| mutation | test that failed |
| --- | --- |
| remove the edge push | `recordAnalysis reports every edge, not only its nodes` |
| remove the residue clear | `after a failure, the next event claims only its own edges` |

Driven end to end through the CLI, which is where the `connecting` output above
was read from rather than predicted.

## Open

**Two things the work corrected about itself, both worth keeping.**

The residue test was **a check that could not fail** when first written. It
injected a failure into `openEnquiry`, whose only edge is `MOTIVATES`, so the
buffer was empty at the throw and the assertion held with or without a clear.
Running the mutation showed it; reading it would not have. Same defect as the
one recorded in this session's scratchpad notes earlier the same day, caught by
the practice those notes prescribe.

The other test **corrected its own expectation**: it predicted two `PRODUCES`
and found three. The third is `EvidenceUnit -> Artefact`, which CLAUDE.md names
as this repository's one endpoint pair with a writer and no reader — invisible
to the event log until this change. And "seven edges" was written into five
comments before driving the CLI said **eight**.

**Not earned by a wrong answer, and the commit says so.** An event missing its
edges is *incomplete*, and PJ-011 §5 is explicit that an empty result is not a
wrong one. What earns it is a consumer, as attribution earned the durable log in
PJ-032. Anyone revisiting this should not find a stronger claim than was made.

**Steps 2–4 of the plan are not built**
(`~/.claude/plans/async-napping-quiche.md`): a trace exporter over
`ResearchSession.events`, the mockup consuming traces instead of hand-written
`add: {nodes, edges}`, and the agent-authoring prompt that falls out of it.

**And the composability question was answered "no" for the suite**, which is the
part most likely to be re-litigated. `openScenario().begin()` hands back an
empty graph per `beforeEach`; `s9b_rebuild_or_fresh_work.test.ts:86`
re-implements S-9's opening by hand *deliberately*, "so that what this scenario
adds is visible against it". Do not refactor the 32 scenarios into shared
fixtures.

## Next

```sh
git checkout -b feat/scenario-trace origin/main   # after #110 merges
```

A dump of `[{operation, subject, created, edges, detail}]` from
`ResearchSession.events` after a scenario run. It reads the in-memory sink, so
it adds nothing to `src/` and does not breach the harness's no-`src/db` rule.
Caveat: in-memory events have `seq` undefined, so order is array order.
