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

**`2a21524`** — `sharpenQuestion` and `amendLockedDesign` complete the set at
sixteen fragments, reaching all eighteen write verbs; thirteen compositions,
one per distinct scenario shape.

**`044f1f2`** — `check:compositions`, `fragments/run.ts`, and
`.claude/skills/compose-scenario`. The sweep is **20** now.

All of the above merged as **#110** (`a74c345`).

**`083a125`** — an eighteen-month programme, 29 steps / 64 nodes / 98 edges,
2.6x the previous largest. Same sixteen fragments, no new machinery, which was
the claim under test: *length costs handles, not machinery*. Open as PR
**#112**, on a fresh branch because #110 merged mid-work — see `## Open`.

Working tree clean.

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

**The domain refused a composition and was right.** S-10 first tried to
re-verify `"the coefficient is 0.61"` against an analysis that concluded 0.63:

```
analysis COMP_1 concluded nothing about "the coefficient is 0.61";
there is nothing to re-verify
```

A re-verification re-checks the claim that was *made*. The error named the
analysis and the proposition, so it cost one read — and the fix is the
scenario's own point: the re-run answers the same question and gets a different
number, which is not a reproduction.

**The mockup is derived now, and one thing had to be removed rather than
faked.** It used to colour nodes by *state* — settled, contested, provisional —
turning them amber when a check failed. **A write-trace cannot carry that.**
The event log records what each act wrote; whether a claim is currently
contested is a computed answer from `whySupported`, and no number of writes
adds up to it without issuing the read. Colour now groups by **family** and the
legend says so.

That is the boundary derivation exposes, and it is worth more than the feature
lost: *the trace is what happened; the state is a question you have to ask.*
Anyone wanting state back needs reads in the trace, which is a different thing
from what was built here.

**A check earned by what typecheck cannot see.** `check:compositions` runs
every arc and asserts each edge lands on a node it made. Nothing else exercises
the compositions — the acceptance scenarios deliberately do not share fixtures —
so a domain change would break one silently and the mockup would stop being
reproducible. Made red on purpose: pointing S-10 at a proposition nobody
concluded fails 1 of 13 and names both the composition and the refusal.

`fragments/run.ts` exists so the builder and the check cannot fork their setup.
Two copies of *connect, resolve, step down, build a surface* would drift, with
the check passing against a composition the builder can no longer run.

**What length found, which twelve short arcs had not.** The domain refused the
long programme twice, and the second refusal is a finding about the model:

```
enquiry LOE_1 is already closed by decision DEC_5 (answered on "the compound
is effective"); closing it again would leave two decisions resolving one
question
```

Both pursuits address the **same question**, and closure attaches to the
question rather than to the line of enquiry — S-4's finding met from the other
side. **No short arc could have reached it**: it needs one question carrying two
pursuits *and* both reaching an answer. The safety result is not lost; it
supports its own claim and released the gate. It simply gets no second closing
act.

The smaller one: `replaceAnalysis` returns `replacement` where
`observeAndAnalyse` returns `analysis`, both `AnalysisRef`. Nothing shorter
threads one into the other. Left as it is — `replacement` says *which* analysis
— with the friction noted at the call site.

**The pre-push hook saved this work.** #110 merged while the programme was
being written, and the first push was refused:

```
pre-push: REFUSED — PR #110 for 'feat/edges-in-the-event-log' is already merged.
```

That push would have succeeded and reached nothing. Verified by *content* that
everything from #110 was on `main` and only the programme was new — ancestry
claimed thirteen unmerged commits, which is the squash blind spot the hook
exists for — then cherry-picked onto `feat/a-long-programme` as the hook
instructed.

**All four steps of the plan are built**
(`~/.claude/plans/async-napping-quiche.md`). The authoring prompt is
`.claude/skills/compose-scenario`, and its §4 is the point of the whole shape:
PJ-008 §2 says a scenario's lines must never name a node or edge label, and a
composition **cannot**, because it does not write a graph. The rule holds by
construction rather than by review — which is why the skill also forbids
"this creates a Claim node" comments, true until they are not and checked by
nothing.

The skill does not list the fragments; it says to grep for them. A copy of a
derivable list is a second thing to go stale, which is the same reason CLAUDE.md
keeps no count of labels or tools.

**And the composability question was answered "no" for the suite**, which is the
part most likely to be re-litigated. `openScenario().begin()` hands back an
empty graph per `beforeEach`; `s9b_rebuild_or_fresh_work.test.ts:86`
re-implements S-9's opening by hand *deliberately*, "so that what this scenario
adds is visible against it". Do not refactor the 32 scenarios into shared
fixtures.

## Next

Nothing queued. #110 is merged; **#112** carries the long programme. If more is
wanted here:

```sh
/compose-scenario                 # write a new arc
bun run check:compositions        # every arc still runs
bun scripts/build-traces.ts --out /tmp/traces
```

The one thing knowingly given up is node **state** in the picture — see the
`## Open` note. Getting it back means putting *reads* in the trace, which is a
different design from the one built here and should be argued before it is
built.

`~/.claude/plans/async-napping-quiche.md` should be read against `fragments/`
rather than followed from here — the plan predates the decomposition and its
step 2 describes the weaker version.
