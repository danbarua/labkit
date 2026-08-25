# 032 — The log that finally had a reader

**2026-08-25, implemented.** Domain events are durable. `pgEventLog()` writes
`public.labkit_event`; `whatHappened()` and the `what_happened` MCP tool read
it. The entry is longer than the feature because three of the decisions are
reusable and one of the findings was not planned for.

## 1. What earned it, and why the wait was right

`src/domain/events.ts` argued from PJ-009 §3 that the in-memory sink was a
decision and not an unfinished edge, and it was right for as long as it held:
every historical question the corpus asks is answered from **durable graph
state**, and the scenarios that touch the log assert it is *empty* at the moment
a historical answer is read. That is a stronger claim than it sounds — it is
what makes those answers reconstructed rather than replayed.

It named the trigger that would change it: a scenario needing an ordering
between two decisions sharing no supersession chain. That is not what happened.
**Attribution happened** (PJ-031). Who ran a command is not derivable from the
graph *at all* — not slowly, not awkwardly, not at all — so the moment events
carried it, the log stopped being a convenience and became the only place a
fact lived. PJ-031 §5 said so at the time and called it a nearer trigger.

The generalisable part: **a deferral is right until the deferred thing becomes
the only home for something.** Not until it becomes convenient, and not until
the originally-predicted trigger fires — the prediction was about ordering and
the real trigger was about identity.

## 2. The atomicity discovery, which the plan had backwards

The plan said the verbs already using `inTransaction` would keep their
arrangement, implying their events already committed with their writes.

**All eighteen `emit` calls sat *after* the transaction closure returned.** Ten
verbs opened a transaction and every one of them emitted once it had closed. So
a verb that failed after its writes committed would have left an event
describing work that was rolled back, and a verb that failed before them would
have left none — the first is a lie in an audit log, which is the worst thing
to have in one.

The fix is uniform rather than per-verb, and only because `inTransaction` is
**re-entrant by depth**: wrapping each verb's whole body means a verb that
already opened a transaction now joins the outer one instead of nesting a
`BEGIN`. No inner closure had to be restructured. That re-entrancy was built for
composed verbs; it paid for something else entirely.

**It also made three verbs atomic that never were.** `sharpen`, `pursue` and
`declareGate` each had a test asserting that an interruption leaves an
*unreachable orphan* — acceptable under PJ-011 §5's rule that a partial state is
fine when no reader can reach it. Those tests now assert that an interruption
leaves **nothing**. One of them had predicted its own obsolescence and named the
trigger: *"if someone adds a reader of `NARROWS` that does not require
`MOTIVATES` … `sharpen` becomes transactional."* Nobody added that reader. The
event store did it from the other side. The prediction was right about the
outcome and wrong about the cause, which is worth more than being right about
both.

## 3. `subject` is not what an act created

Six verbs mint a `Decision`. Only `amendDesign` emits against that decision's
id — `sharpen`, `closeEnquiry`, `promote`, `acceptAsUnresolved` and
`reinterpret` emit against the enquiry, the question or the claim, because
`subject` means *what the operation was primarily about* and that is what the
researcher was doing.

So "which act created this record?" is unanswerable from `subject` for five of
six. Hence `created text[]`, GIN-indexed, filled by draining a buffer on
`TenantGraph` rather than listed by callers: a verb that mints three nodes and
remembers two is a state nobody could see, and the only thing that knows what
was minted is the thing minting it.

**The residue guard is one line**, in `inTransaction`'s existing `finally`: a
verb that throws never reaches its `emit`, so its ids are still buffered, and
without the clear the *next* event would claim to have created records that were
rolled back. That `finally` was written for a different bug (a throwing `COMMIT`
leaving `depth` at -1) and already ran exactly once on every path.

**Containment, not a join.** `created @> ARRAY[$id]` is one indexed predicate on
one table. A join between SQL and Cypher is possible — AGE supports it for reads
— but it would need a raw-SQL seam on `TenantGraph`, which deliberately has
none. Every question this log answers is a single-table predicate; reserve the
join for one that genuinely filters a traversal by an event.

## 4. `seq`, not `at`

`at` is stored verbatim as text, because a `timestamptz` round-trip normalises
precision and this record's whole job is fidelity to what the `Clock` said.

It cannot order anything. Most of the suite runs a **frozen** clock, so every
event in a scenario shares one instant. `seq` is a `bigserial`, and it is also
the cursor.

This is the distinction `events.ts` already drew when it rejected natural-id
allocation order — "an accident of the sequence and not a modelled fact". A
sequence *on the event table* is precisely that modelled fact. Note what
follows: the trigger events.ts named for a durable sink — ordering two decisions
with no supersession chain — is now mechanically answerable. It is **not thereby
earned**; a scenario would still have to need it, and none does.

## 5. The trap this repo had already documented, and walked into again

The first run of the migration recorded itself as applied and created nothing
under `public`. The table was in `ag_catalog`.

Migration 0001 does `SET search_path = ag_catalog, "$user", public`, which is
still the active *session* setting when later migrations run — so unqualified
DDL resolves there. `drizzle/0002_natural_ids.sql`'s header records this
happening to the natural-id functions and says why every object in it is
schema-qualified by hand. drizzle-kit generates unqualified DDL, so a generated
migration walks into it by default.

**Every object in `0003` is now qualified `public.` by hand, and the header says
why.** The general lesson is the one CLAUDE.md already draws — never rely on
`search_path` ordering, qualify explicitly — with an addition: a *generated*
migration cannot be trusted to follow a convention the generator has never heard
of. Read it before committing it.

## Judgment calls

- **The in-memory sink stays the default**, and every test uses it. The pg sink
  is wired only in `main()`. Scenarios assert an empty log to prove an answer is
  durable, and that argument is unchanged.
- **`operation` is a union of the eighteen verb names, not `string`.** Checked
  rather than assumed: the emitted operations and the public verbs are the same
  eighteen strings, because CLAUDE.md requires one event per research action
  named for the act. `this.emit("recordAnalyis", …)` used to compile.
- **`whatHappened()` lives on `ReadSurface` and does not break the rule.**
  *Events explain how state changed; the graph explains what is true now.* Every
  other read there answers the second question and must never consult the log;
  this one asks the first, which the graph cannot answer.
- **`tenant_id` on every row and every query.** A tenant's graph is its own
  schema and needs no such column; `labkit_event` is one table for everyone, and
  nothing structural enforces the filter. `tests/event-store.test.ts` is the
  enforcement, and it is the first isolation test on the relational side.
- **No `check:emit-awaited`.** The plan allowed for one and made it conditional
  on catching something when written. It caught nothing — `tsc` had already
  found every site, because `emit` moved inside closures whose values it uses.
  A checker with no first catch does not clear this repo's bar.
