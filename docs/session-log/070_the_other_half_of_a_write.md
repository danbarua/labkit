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

**`f4db3a0`** — the in-memory sink numbers its events.

`select({ since })` returned **nothing for every value** while `pgEventLog`
answered the same filter correctly: `matches` reads `(e.seq ?? 0) > f.since`
and nothing assigned a `seq`, so every event scored 0. Two sinks behind one
interface, disagreeing. Dan asked why an atomic incrementer was not trivial;
it is, and the comment saying "a process-lifetime array has nothing to number"
is the reason the defect stood.

**`99ddfb1`** — `fragments/`, a small library of composable research moves.

Fourteen fragments covering the eighteen write verbs, plus
`tests/fragments.test.ts`. Not in `tests/` because someone would import it into
a scenario; not in `src/` because it adds no verbs and no ontology. `depcruise`
reaches it transitively through the test, so the layering rules already apply
with no config change.

**`1a72428`** — traces, derived from a real run.

`fragments/trace.ts` turns an `EventSink` into steps a picture can be drawn
from; `fragments/compositions.ts` is six named arcs built from moves and
nothing else; `scripts/build-traces.ts` runs them against a real database, one
temp directory per composition, removed on exit.

```
S-19  A gated advance                      12 steps  25 nodes  38 edges
S-4   A negative result that closes it      4 steps  11 nodes  15 edges
S-14  Deliberately left unresolved          4 steps  11 nodes  15 edges
S-12  The sentence about them is wrong      4 steps  13 nodes  17 edges
S-5   Contradiction or dissociation?        7 steps  19 nodes  26 edges
S-11  The analysis was wrong                5 steps  16 nodes  23 edges
```

Working tree clean. All of the above open as PR **#110**.

**The range is far wider than this session.** Everything in it except the shas
above belongs to entries 063, 064 and 066–069 — #92, #93, #96 through #109 —
and none of it is restated here. (This paragraph carried a commit count until
it was corrected; SKILL.md forbids one for the obvious reason, and it was
already wrong.)

## Verified

`bun run check` — **19/19**. `bun run test:pg` — **420 pass, 4 skip, 0 fail**
(the change is `src/db/**`, so that arm runs on the PR regardless).

**Each test made red by its own mutation:**

| mutation | test that failed |
| --- | --- |
| remove the edge push | `recordAnalysis reports every edge, not only its nodes` |
| remove the residue clear | `after a failure, the next event claims only its own edges` |
| remove the seq counter | `in-memory: since is a cursor, not a filter that empties the log` |

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

**One of two implementations was never asked the question**, which is the
general form of the `seq` defect and worth more than the fix. The suite's only
`since` test uses `pgEventLog`; the in-memory path had none, so a filter that
returned nothing for every input survived in the sink *every scenario uses*.
Where an interface has two implementations, a test that exercises one proves
nothing about the other.

**`fragments/` — Dan's decomposition, and it is better than this entry's.**
Now built (`99ddfb1`); this is what it was:

    ask-and-pursue  prespecify  gated-work  observe-and-analyse
    negative-result  failed-check  rerun-check  promote
    close-on-evidence  replace-analysis  reinterpret-claim
    multi-pursuit  accept-unresolved  reverify

Fourteen, covering the eighteen write verbs. The plan asked whether *scenarios*
compose and answered no; the composable unit is a **move**. S-19 is
`ask-and-pursue → prespecify → gated-work → observe-and-analyse → failed-check
→ rerun-check → promote → close-on-evidence`, and the mockup hand-wrote that
sequence eight times.

**The boundary that still holds:** fragments compose in the *trace*, not in the
test suite. `s9b_rebuild_or_fresh_work.test.ts:86` duplicates S-9's opening
deliberately so the difference is visible; a shared fragment there would couple
independent probes. `fragments/index.ts`'s header carries that argument, which
is why it is not under `tests/`.

**The branded handles caught four wrong assumptions at compile time**, which is
worth recording because it is the type system doing the job it was argued for.
`evaluateCriterion.citing` is a `ClaimRef`, not an `AnalysisRef`;
`acceptAsUnresolved.inLightOf` is one claim, not a list; `reverify.concludes` is
one conclusion, not a list; and `replaceAnalysis.because` is a **`ReviewRef`** —
so an analysis cannot be superseded without a recorded verdict to point at,
which is why that fragment is the review and the replacement together rather
than two.

**What hand-drawing a graph actually costs, measured.** The mockup drew S-19's
arc by hand; the same arc derived from a run:

| | hand-written | derived |
| --- | --- | --- |
| steps | 13 | 12 |
| nodes | 18 | **25** |
| edges | 23 | **38** |

It omitted **15 edges, 39% of them** — every `RECORDED_IN`, both `REQUIRES`,
the `MOTIVATES`: three labels it never mentions at all. **And it invented
nothing.** Every edge it named is real.

That is the failure mode worth carrying forward: hand-drawing produces an
*under-connected* graph rather than a wrong one, so a reader sees a plausible
picture and cannot tell what is missing. The 13-vs-12 step difference is honest
by contrast — the mockup showed `gates --state blocked`, and a read writes no
event.

**Step 2 of the plan is now built; steps 3–4 are not**
(`~/.claude/plans/async-napping-quiche.md`): the mockup consuming traces
instead of hand-written `add: {nodes, edges}`, and the agent-authoring prompt
that falls out of it. The mockup swap is now a data change rather than a
rewrite.

**And the composability question was answered "no" for the suite**, which is the
part most likely to be re-litigated. `openScenario().begin()` hands back an
empty graph per `beforeEach`; `s9b_rebuild_or_fresh_work.test.ts:86`
re-implements S-9's opening by hand *deliberately*, "so that what this scenario
adds is visible against it". Do not refactor the 32 scenarios into shared
fixtures.

## Next

```sh
bun scripts/build-traces.ts --out /tmp/traces
```

Then point the LabKit Explorer's `SCENARIOS` at those files instead of its
hand-written `add: {nodes, edges}`. The measurement above says what that
recovers: 39% more edges on the one scenario checked, and no invented ones to
remove.

`~/.claude/plans/async-napping-quiche.md` should be read against `fragments/`
rather than followed from here — the plan predates the decomposition and its
step 2 describes the weaker version.
