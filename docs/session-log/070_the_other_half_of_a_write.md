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

Working tree clean. Both commits open as PR **#110**.

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
Sketched mid-session as a small library of composable research moves:

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
independent probes.

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

Sketch the fragment API against `~/.claude/plans/async-napping-quiche.md`
before building — the plan predates the `fragments/` idea and its step 2 is the
weaker version of it.

```sh
git checkout -b feat/scenario-trace origin/main   # after #110 merges
```

A dump of `[{operation, subject, created, edges, detail}]` from
`ResearchSession.events` after a scenario run. It reads the in-memory sink, so
it adds nothing to `src/` and does not breach the harness's no-`src/db` rule.
The `seq` caveat this line carried is gone — `f4db3a0` above is what removed
it, so a trace can order by `seq` on either sink.
