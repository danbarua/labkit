# 031 — Time was one aspect of a command's execution context

**2026-08-24, implemented.** Domain events now record *who* ran a command and
against which commit, beside *when*. The feature is four small edits and one new
file; the entry is longer than the diff because three of the decisions behind it
are the reusable part and the fourth is a defect shipped on purpose.

## 1. The seam was never specific to time

PJ-009 §3 built the temporal seam before a scenario forced it, on an argument
that had nothing to do with clocks:

> the part that is hard to retrofit is the API discipline: once callers can
> mutate research state without leaving a temporal trace, "what evidence existed
> when this decision was amended?" becomes unanswerable for everything already
> recorded.

Substitute the word. Once callers can mutate research state without leaving a
trace of *who*, "which agent recorded this analysis?" is unanswerable for
everything already written, and no later change recovers it — the commands have
already run. That is the same claim, and it was already load-bearing here, so
attribution needed no new argument. It needed the existing one read one level
up: `Clock` was the first aspect of a command's execution context to be
injected, not the only one there is.

Hence `CommandContext { clock, attribution }` in `src/domain/events.ts`, the
file that already calls itself the temporal seam and is now the
execution-context seam. `AttributionContext` carries three fields, and each
answers a question a reader of the record actually asks: `attribution_label` for
a human scanning, `attribution_id` for grouping two events by author, `git_hash`
for the difference between *this was decided* and *this was decided by a version
that had the bug*.

## 2. Alongside the clock, not wrapped around it — and the reason is a count

The obvious shape, and the one originally specified, was
`ResearchSessionOptions { ctx?: CommandContext }`: fold the clock into the
context and thread the context. It was rejected on a measurement rather than a
preference. **110 construction sites across 38 test files** pass `{ clock }` or
`{ clock, events }` into a surface. Nesting rewrites every one of them —
`{ clock }` to `{ ctx: { clock, attribution } }` — to produce byte-identical
behaviour.

```ts
export interface ResearchSessionOptions extends Partial<CommandContext> {
  events?: EventSink;
}
```

The named type from the original design exists and is what the MCP adapter
builds and hands over in one piece (`{ ...ctx, events }`). Every existing call
site stays valid. `clock` keeps its name and its position, so **all fourteen
`this.clock.now()` reads in `write.ts` are untouched** and the domain-layer diff
is two fields and one `record` call.

The generalisable form: **a type can be introduced without being imposed on its
callers.** `Partial<T>` spread flat gives the vocabulary a design wants without
the migration a nesting would have forced. Worth remembering next time the
choice looks like "new shape or no shape".

## 3. Per-command attribution came from a question, not a design

The plan on the table threaded a `ctx` argument through all eighteen write
verbs, because per-command attribution seemed to require a per-command
parameter. It does not. The question that dissolved it was *"`WriteSurface`
could be instantiated when needed? It's a stateless facade, right?"*

Checked rather than assumed, and the check is the part worth recording:
`WriteSurface` and `ReadSurface` declare **no constructor and no field** of
their own; the only two assignments in the entire domain layer are
`SessionCore`'s; the one piece of mutable state in reach — `inTransaction`'s
re-entrancy depth — belongs to the shared `TenantGraph`. So a surface is a `new`
over three references, and `src/mcp/server.ts` builds one **per tool call**,
sampling the providers each time. Per-command attribution, per-command
`git_hash`, and not one verb signature moved.

`buildServer` takes `(read, makeWrite: () => WriteSurface)` — a factory for the
half that needs per-call state, an instance for the half that does not. The read
side stays single because reads never touch the clock and never emit; there is
nothing per-call for them to carry.

**This is what the read/write split bought, cashed in.** The split was justified
on the seam the domain already asserts (events explain how state changed; the
graph explains what it is). A consequence nobody claimed at the time is that the
two halves can now have *different lifecycles*, because only one of them has
anything to hold.

## 4. The hoist that had to come with it

`main()` used to do `new WriteSurface(graph)` and hand `writes.events` to the
read half — the sink defaulted into existence inside whichever surface was
constructed first. Harmless with one surface. With a surface per call it
fragments the stream silently: every call gets a private log, the read half
holds the first one, nothing throws and nothing fails.

So `main()` now constructs `inMemoryEventLog()` itself and passes it to both.
That is not a workaround for per-call construction; it is the thing that was
already wrong being visible for the first time. **Ownership of a shared resource
should not be a side effect of construction order**, and the process-scoped sink
is now a decision written where the decision is made.

`tests/attribution.test.ts` guards it one layer below where the mistake would be
made, and the guard was watched to fail: changing one surface back to a
defaulted sink turns that test red. So was the other gate — deleting
`attribution:` from `emit` is a compile error, because the field on
`DomainEvent` is required and `emit` is the only caller of `record`. Required,
not optional, is what makes the type system rather than a convention the thing
that stops an unattributed event reaching the sink.

## 5. It is written and nothing reads it, and that is deliberate

CLAUDE.md is direct about this shape: an edge written and never queried is the
dead code PJ-007 found in `buildAsClause`. Attribution today is exactly that.
`src/domain/read.ts` never touches `events`; the sink is in-memory and dies with
the process; no verb, report or tool surfaces an author. **The feature records
something nobody can currently ask for.**

Shipping it anyway is a decision, taken after the objection was raised, and it
rests on a distinction this repo has drawn twice before. The no-cull policy
(PJ-011 §6) protects **labels and edges, because each is a claim about the
domain** — a declared-but-unwalked edge is a computable map of where the model
has an untested claim. It does not protect query conveniences: the per-tenant
CQRS views were removed on exactly that ground, and `EvidenceUnitRole`'s tenth
value was declined on it. An event field is not a claim about the domain either,
so the policy does not cover this and the exception has to be argued on its own
terms.

The argument is §1's: this one is not retrofittable. A view can be rebuilt from
the tables whenever a reader appears. An unattributed command is unattributed
forever.

`events.ts` already named a trigger for a durable sink — a scenario needing an
ordering between two decisions sharing no supersession chain. This adds a
second, and a nearer one: **a consumer asking who did something.** An audit
read, a "what has this session been doing" report, an MCP notification. Until
one exists, attribution reaches the end of the process and stops, and the entry
says so rather than leaving a future reader to discover it.

## 6. Mock providers, for the reason the `Clock` had them

`src/attribution.ts` holds `GitContextProvider` and `SessionContextProvider` as
interfaces with constant-answering stubs behind them — the shape `systemClock`
arrived in, for the same reason: the seam is the part that is hard to retrofit,
not the implementation.

The file sits **outside all three layers**, a peer of `src/cli.ts`. That is
layering, not filing. **Nothing under `src/` spawns a subprocess**, and a real
git provider running `git rev-parse HEAD` would be the first; keeping it here
means that when it arrives, it arrives in one file that neither the graph nor
the verbs import.

`mockGitContext` answers with forty zeros rather than a plausible hash, on the
principle that a fake which reads as real is the failure worth designing
against: the first person to see a `git_hash` in a record will try to check that
commit out, and forty zeros answers them immediately.

## Judgment calls

- **Attribution is session-scoped in the field and per-command in practice.**
  `SessionCore` holds one `AttributionContext`; the MCP adapter makes that
  per-command by making the surface per-command. Keeping the field simple and
  varying the lifetime is cheaper than making every verb carry a parameter, and
  it is only available because §3's check came back the way it did.
- **`UNATTRIBUTED` is a named constant, not an inline default.** Most of the
  suite runs the unattributed path, and an event carrying three empty strings
  under a name says *nobody claimed this*, where an absent key leaves a reader
  unable to distinguish that from a writer who forgot.
- **The `tenantCtx` rename in `main()` is not cosmetic.** Two unrelated things
  called `ctx` in one function — which tenant's graph, and who is talking —
  is a diff nobody can read.
- **A known imprecision, left alone.** A verb that stamps a node property and
  then emits reads the clock **twice**, so under a ticking clock the two are
  different instants (`pose` is the clearest case: `posed_at` then the event).
  Pre-existing, harmless under the frozen clocks the suite uses, and not worth
  restructuring `emit` for until something depends on the two agreeing.
