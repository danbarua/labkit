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
a change of mind; 5 the supersession chain and everything that reads it —
a second amendment, a re-check, a replacement, and whether an analysis can be
accounted for from what it read.

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
- **35 of 36 non-`mcp` CLI commands reached byte-for-byte parity** on that
  typed API, with no query string anywhere in the port. (2026-08-29 at 31;
  2026-08-31 for the next four — `reverify`, `replace`, `reproduction`,
  `reproducibility` — after widening `design` to the full amendment chain
  they read.) **The denominator itself was wrong in every earlier revision of
  this file** — counted twice today (`grep -oP '\.command\("\K[^"]+'` over
  `src/cli/commands/*.ts`, then the port's own match arms), directly rather
  than carried forward: 37 CLI commands exist in total, 36 excluding `mcp`,
  not the 35/36 split this file used to state. The fixtures are the
  authority for the 35 that have one; run them rather than trusting this
  sentence. `happened` is the 36th, written 2026-08-31 (see "What is left")
  but unable to reach byte parity even in principle, so it is verified a
  different way and stays out of this count on purpose. `mcp` is a server,
  not a command.

### The epoch question, resolved — and it decomposes rather than settles one way

**Whether Grafeo's epoch APIs are real time travel or recovery internals** was
open pending a runnable probe. `examples/epoch_probe.rs` and
`examples/epoch_probe_session.rs` are that probe (2026-08-30). The answer is
both poles were half right, about different paths:

- **On the typed CRUD API this port actually uses** (`create_node_with_props`,
  `set_node_property`), there is no history to query. `epoch_probe` advances
  the epoch counter with `LpgStore::new_epoch()` — which *is* public, just
  `#[doc(hidden)]`, so `db.store()` reaches it even though rustdoc never shows
  it — and `get_node_at_epoch` still can't tell the epoch before a property
  write from the epoch after: both read the post-write value. Advancing the
  counter is not the same as recording history, and nothing on this path
  records any.
- **On the session/query path, with `temporal` enabled, it works.**
  `epoch_probe_session` runs a write through `session.execute("MATCH ... SET
  ...")`, which commits a real transaction, then reads the *pre-write* value
  back with `session.execute_at_epoch(query, epoch_1)` — a public, ordinarily-
  documented method, not a hidden one. It returns the old value; a plain
  `execute` at the same point returns the new one. That is genuine, working
  time travel.

So the dispute wasn't wrong on either side, it was under-scoped: "Grafeo's
epoch APIs" turned out to name two different mechanisms, one per write path,
and the port's own design goal — a typed API with no query strings — is
exactly the path epochs don't reach. Getting LabKit's "what was known then"
from Grafeo's own history would mean writing through `session.execute(...)`
instead, which is the *less* interesting bet this port deliberately avoided
(see "Why typed calls and not Cypher," above). `sharpen`'s freeze-at-write-time
snapshot stays: not because Grafeo lacks real time travel, but because taking
it would mean giving up the property that motivated this port in the first
place.

`Cargo.toml`'s `temporal`, `cypher` and `gql` features exist only for these two
probes — the port itself (`src/main.rs`) still builds and runs on `lpg` alone,
unchanged; see the comment there.

## Defects the fixture found that no type could

Worth naming because every one is about *reports* or *unwalked structure*, not
about Rust or Grafeo. (This heading used to say "three" — a count that goes
stale the next time this file finds one, which is exactly the state-in-prose
mistake the parent repo's CLAUDE.md names and this file just repeated.)

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

**Widening `design` and adding `reverify`/`replace` found two more gaps in the
same family — a node the port never wrote, and a reader that didn't guard
against a new one existing.** (2026-08-31.) Both were invisible for the same
reason as `SUPERSEDES`: nothing in slices 1-4 printed the handle that would
have shown them.

- `analyse` never minted the output `Artefact` a real analysis produces
  (`recordAnalysis`'s `output` — the thing `replaceAnalysis` invalidates and
  `outputArtefactOf` reads back). Slices 1-4 never name it, so `analyse` had
  minted one fewer `Artefact` than Bun on every call, silently, the whole
  time. It surfaced only once slice 5 named a *later* handle by number and
  got a different node than Bun did — the exact mechanism that hid
  `SUPERSEDES`, arriving a second time from a different verb.
- Once `analyse`'s `EvidenceUnit` produced two things instead of one, `enquiry`
  broke: it collected *every* `PRODUCES` target off a unit and assumed they
  were all findings, so it started reporting the output `Artefact` as a
  finding with no statement. This is `PRODUCES: [EvidenceUnit, Artefact]`
  from CLAUDE.md's own unwalked-pair table, arriving in a Rust port with a
  compiler that cannot catch it either — a wrongly-included *pair* isn't a
  type error any more than a wrongly-typed *edge* is.
- `reinterpret` was also missing the `Review` node LabKit's real verb mints
  (`"the review records that someone objected; the decision records that the
  objection was acted on"`) — invisible for the same reason, until slice 5's
  own explicit `review` call landed on `REV_2` where Bun's landed on `REV_3`.

All three fixed the same way as `SUPERSEDES`: read the real domain code,
change the port, regenerate every `.expected` from Bun, and let 75 runs across
five slices say whether it's still deterministic. It is.

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
- **`SUPERSEDES` was modelled `Criterion -> Criterion`; fixed 2026-08-31 to
  `Decision -> Decision`** (`src/db/domain.ts`'s actual schema). The fixture
  never caught it — slice 4 has one amendment, and one hop reads the same
  either way. Found via exo-ledger, not the fixture; verified by hand-driving
  two amendments on the same gate and checking `design` reports the immediate
  prior value at each step, which it does. Recorded in exo-ledger pair
  `ecb648b2`, evidence for the antithesis (a typed API removes one silent
  class of defect, not silence as such).

## What is left

**Byte-parity command coverage is done, for the 35 commands byte-parity is a
coherent question for.** `reproduction`, `reproducibility`, `replace` and
`reverify` landed 2026-08-31, on a `design` widened to walk the full
amendment chain LabKit's `designHistory()` does (`src/domain/read.ts`) rather
than report only the immediately prior step — needed once a chain could be
more than one amendment long, and tested at two. `mcp` is a server, not a CLI
command; 36 non-`mcp` commands exist, and 35 of them now have a fixture.

### `happened`, tried — half of it turned out free, and half of it can't exist here

Went in on the instinct that a minimal event log is close to what the port
already has: every write is durable in the graph the moment it happens, so
maybe *ordering* alone gets you most of `happened` for nothing. Ran it rather
than reasoning about it (`examples/graph_history_probe.rs`), and it split
cleanly into a part that held up and a part that can't be built here at all.

**Held up, once the first attempt's false positive was caught.** A 3-node
probe showed `iter_nodes()` returning nodes in creation order and it was
tempting to stop there — a small-hash-table coincidence, not a property of
the store. The real test is the discriminating one: the same 27-command
`slice-5` sequence, replayed against a fresh `--db` in three separate
processes, gave **three different `iter_nodes()` orders** for the identical
history — a randomised-hasher-backed store, not a list, the same shape as the
`iter_edges()` flakiness `origin` and `known` already hit. `NodeId`
allocation order is the reliable part (it's a counter, leaned on all through
this port), so `happened()` sorts by it explicitly rather than trusting
`iter_nodes()` — the same fix, a third time in this file.

**What ordering doesn't buy you is which *verb* ran.** Two different commands
can produce the same graph shape, and the graph itself carries no record of
which one did it. The fix needed no new sink, only reusing what's already
there: every write command's whole stdout is the handle(s) it minted (the
convention this port already follows), so `main()` tags each of those nodes
with the verb name that produced it, in one place, after the match — not a
separate log, one property on a node that already existed.

**What can't be built at all: who ran it.** LabKit's real `happened` exists
specifically to answer that (PJ-031) — `renderHappened`'s whole reason to
read the event log instead of the graph is the attribution line. This port
has no concept of attribution whatsoever: no `--author`, no git-context
provider, nothing a verb could tag a node with even if it wanted to. Adding
it would mean inventing a piece of LabKit this port never had, which is a
different, larger undertaking than "derive history from what's already
written" — so `happened` here reports the acts and their order, honestly
short of what the name promises on the real CLI.
