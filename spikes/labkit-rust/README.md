# Spike: labkit-rust

## Concept

Port the `labkit` bun [cli](../../src/cli/cli.ts) + PGLite/Postgres/Apache-AGE
application to Rust + [Grafeo](https://github.com/GrafeoDB/grafeo).

## The question it is actually asking

Not *"can Rust reach parity"* — that was never in doubt. The question is whether
the machinery LabKit needed still has a reason to exist on a different store.

`src/domain/facts.ts` is a fact graph that composes Cypher clauses. It exists
because a clause spelled twice gets spelled wrong once: the `SUPPORTS` /
`CHALLENGES` pair was forgotten **six times** in this codebase, four by the same
author, twice *after* the fix for the previous occurrence. On Grafeo the same
traversal is

```rust
db.iter_edges().filter(|e| e.src == src && &*e.edge_type == edge_type)
```

`out()` and `into_()` are the only two ways through the graph in the whole
program. There is no second spelling to forget, and a mistyped edge type is a
value the compiler sees rather than a query that quietly matches nothing.

So the port is a probe of a design claim, not a rewrite anybody has asked for.

## Parity is a diff, not a reading

`parity/slice-N.sh` runs **any** binary through the same commands into a
throwaway `--db`, and prints stdout only. `parity/slice-N.expected` is that
output from the Bun binary.

```sh
cd spikes/labkit-rust && cargo build
for n in 1 2 3 4; do
  bash parity/slice-$n.sh ./target/debug/labkit-grafeo | diff - parity/slice-$n.expected
done
```

Regenerate a fixture by pointing the same script at the reference:

```sh
bash parity/slice-1.sh bun ../../src/cli/cli.ts > parity/slice-1.expected
```

### The slices are a subset of the real target

The end state is like-for-like output on the two scripts that already exist:

- [smoke-cli](../../scripts/smoke-cli.sh) — the CLI against a real database,
  **asserted**; 13 assertions, hermetic, and the only thing that drives the
  binary as a process.
- [end-to-end](../../examples/full-lifecycle.sh) — the narrated lifecycle, for
  reading rather than checking.

Neither runs against the port yet. The slices exist because those two are
all-or-nothing: they exercise the whole surface, so until the last command
lands they report the same failure and measure no progress. A slice is the
smallest thing that can be *diffed*, which makes "how far did we get" a number
instead of an opinion.

**The slices are cumulative conversations, not test groups.** Slice 2 continues
the record slice 1 built, because `known` only becomes interesting once
something has been run against a question. Slice 1 is the five acts that mint
handles; 2 adds the analysis verbs and the composed reports; 3 the reads that
work off a record the caller already has handles into; 4 the verbs that record
a change of mind.

### Three properties the harness has, each checked rather than assumed

- **Deterministic.** Regenerating gives an identical file. Handles come out
  `CRIT_1`, `LOE_1`, … every run.
- **It discriminates.** A one-character mutation to a padded field is caught.
  A green diff nobody has seen go red is not evidence.
- **stdout only.** The `creating a new record` notice is stderr *by design* —
  the whole of a write command's stdout is an id the next command consumes, so
  polluting it would break `$(labkit criterion 'x')`.

One field is normalised: an evaluation carries the moment it happened, so
`gate` prints a timestamp that differs every run. Left alone the diff is red
forever, which is the same defect as green forever. Both binaries pass through
the same filter, so a port that dropped the stamp entirely still fails — the
line loses its shape, not just its value.

**The harness caught a defect in itself before it was trusted.** Its first
version generated a fixture of six `<<the command failed>>` markers: the runner
helper did not capture the binary, so the shell tried to execute a program named
`criterion`. That fixture would have passed against a Rust binary printing
nothing at all. Found by reading the file, not by an exit code.

## What has been established, by measurement

Dated, because each was run rather than reasoned about.

- **Grafeo's Cypher supports edge-type alternation** — `[:SUPPORTS|CHALLENGES]`
  returns both bearings where each arm alone returns one. Apache AGE rejects
  that as a syntax error, and working around it is the direct cause of the
  six-occurrence defect above. (2026-08-28, with a control.)
- **Grafeo has a typed native write API** — `create_node_with_props`,
  `create_edge_with_props`, `set_node_property` — needing no query strings.
  (2026-08-28.)
- **31 of 36 commands reached byte-for-byte parity** on that typed API, with no
  query string anywhere in the port. (2026-08-29. The fixtures are the
  authority; run them rather than trusting this sentence.)

### What is open, and should not be built on

**Whether Grafeo's epoch APIs are real time travel or recovery internals.**
`GrafeoDB` publicly exposes `get_node_at_epoch`, `execute_at_epoch`,
`epoch_range` and `restore_to_epoch` — but **no public method advances an
epoch**, a write left `current_epoch` at 0 so the past read identical to the
present even with `features = ["temporal"]`, and the internal setter is
documented *"(for snapshot/WAL recovery)"*.

This matters more than it looks. LabKit answers *"what was known then"* by
**freezing** findings onto a decision at write time, because AGE cannot be
asked. `labkit origin <sharpened-question>` prints that snapshot and says so:
*"Frozen when the sharpening was recorded, not recomputed now."* If Grafeo's
epochs are queryable history, that design becomes unnecessary; if they are
recovery plumbing, it stays. Recorded as an **open dispute** in the exo-ledger
rather than settled either way — "I could not find the advance path" is not
"there isn't one", and an in-memory database may simply never advance where a
persistent one with WAL would.

## Three defects the fixture found that no type could

Worth naming because all three are about *reports*, not about Rust or Grafeo.

**The port independently reproduced a bug LabKit itself had until PR #69.**
After `promote` and `close`, `known` reported the question `established`. The
Bun binary says `provisional` — because the prespecified check had not been
evaluated, and promotion alone is not enough: a check nobody performed counts
against the finding it qualifies. Both readings look correct in isolation;
only the diff distinguished them.

**Two traversals returned more than one row and the code took the first.**
`reinterpret` adds a second `SUPPORTS` edge from the same evidence to the
narrowed claim, so the closing claim resolved to two — and `.next()` picked
whichever the store handed back, making `known` wrong intermittently by
construction. The same shape in `sharpen`'s frozen snapshot. The fix is not
*be careful*: **a report is a contract between runs, and an unordered read
cannot be one.**

**Fixing the write side of that same defect left the read side broken, and
the fixture went flaky rather than red — worse, because flaky reads as "run it
again."** (2026-08-30.) `sharpen` sorts its `Evidence` nodes by `NodeId` before
writing the `BASED_ON` edges that freeze what was known — the fix above. But
`origin` read that frozen snapshot back with a bare `out(&db, dec,
"BASED_ON")`, trusting `iter_edges()`'s own order. It doesn't have one:
`slice-4` went from clean to failing on roughly half of twenty otherwise
identical runs, same binary, same fixture, same commands — the two `Evidence`
nodes in the frozen list traded places. Sorting only where a value is written
does not make reading it back ordered; the same `.sort()` was needed again at
the read site. This is the lesson two paragraphs up, recurring in the other
half of the same verb after the first half had already been fixed — which is
this repo's own finding about itself (CLAUDE.md, "'Be more careful' is not an
available remedy") arriving here by an independent route.

**Only the two sites the fixture actually exercised twice are sorted; every
other `out()`/`into_()` call in this file still trusts traversal order.** That
is a named risk, not a cleared one — the fixture is what turned each of the
three defects above from a theory into a fact, and nothing has done that for
the rest.

## Divergences from the Bun implementation, named rather than hidden

- **Handle minting counts nodes.** `CRIT_1` is `count + 1`. LabKit uses a
  Postgres `SEQUENCE` per entity type, which never reuses a number after a
  delete — this would. No delete verb exists here, so the two agree today and
  would part the moment one did.
- **`next_handle` reads every node.** Fine at spike scale; the next thing to
  fix after the above.
- **No event log.** LabKit emits one durable event per verb, on the same
  connection as the graph, so an event commits with the writes it describes.
  The port has none.

## What is left

- `reproduction`, `reproducibility`, `replace`, `reverify` — all read
  supersession chains, so they need more of the `SUPERSEDES` / `REVERIFIES`
  structure than `amend` currently writes.
- `happened` — reads the event log the port does not have. Deciding whether to
  keep a separate log or derive history from the graph is **the same question**
  as the epoch dispute above, which is why it is last rather than next.
- `mcp` is a server, not a CLI command. 35 is the realistic ceiling for a
  command-parity spike.
