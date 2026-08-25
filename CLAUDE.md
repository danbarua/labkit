# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## First, in a fresh clone or worktree

```sh
bun install
```

**Nothing else in this file works until that runs, and the failure does not name
its cause.** A worktree starts with no `node_modules`, so `bun run typecheck`
and `npx depcruise src tests --output-type err` — two of the three gates — fail
with `TS2688: Cannot find type definition file for 'bun'`, which reads like a
TypeScript configuration problem and is not one. `bun run check:doc-comments`
passes throughout, being a plain script with no dependencies, so a green check
is available to mislead you. Found on 2026-08-22 in this state.

Two more things a worktree will not have, because they are untracked:

- `.claude/settings.local.json`, `.claude/.wrap-state/` and
  `.claude/hookify.*.local.md`. The hookify rules are the ones worth copying
  across — they warn on mistakes already made in this repo. `.wrap-state/` must
  be **seeded** before the first Stop fire or the first wrap is silently
  swallowed; `.claude/skills/wrap/SKILL.md` §Forking has the command.
- Nothing to configure for git hooks. `.githooks/` and the generated SVG were
  both removed (`ce97456`); `bun run dev:dependency-cruiser` regenerates
  `docs/dependency-graph.mmd` by hand, and graphviz is no longer needed.

## The one rule about documents

**If a sentence would be wrong next week because something changed, it doesn't
go in a document.**

Statuses, counts, ranges, "no row is currently open", "X files", "the newest
entry is N" — that is state, and state belongs in exactly one place, which is
the thing itself: the code, the index table, `git log`. Every documentation
defect this repo has found was state written into a sentence. None was a bad
argument; the arguments have all held.

So: other documents may write `row F` and nothing else about it. If a reader
wants its status they grep one table. This deleted a checker rather than adding
one — `check:ledger` existed only to police a copy that should not have existed.

**Dated records are exempt and must stay exempt** — `docs/project-journal/`,
`docs/session-log/`, `docs/consumer-contract/`. They say their date and are
measurements of it, so they cannot go stale. Do not "correct" them.

## What this is

LabKit is a research control plane: it tracks provenance, justification, and
dependency propagation for a research process (why a computation was run,
what evidence resulted, what claims/decisions depend on it, what remains
unresolved) — not an experiment-telemetry system (W&B/MLflow own metrics,
run logs, sweeps). See `docs/project-journal/001_git_init.md` for the full
domain rationale and boundary tests.

The domain model lives across a chain of project-journal entries
(`docs/project-journal/00N_*.md`) — each records *why* a decision was made.
They are dated records: read them for reasoning, never for current state.

- Before touching `src/db/`: 001 (domain model), 003 (tenancy), 004-007
  (persistence design).
- Before touching `src/domain/`: 008 (the interaction corpus the service layer
  is built against — its §3 index is the ledger), 009, 011, then 014-023 for
  how individual verbs were earned. 010, 013, 017, 020 and 024 are external
  reviews; 012 is superseded by 014/015. 030 is on reference-vs-subject
  identity, 031 on the execution-context seam — read it before changing how a
  surface is constructed, not only before touching events — 032 on the
  durable event log, which is where the atomicity of every write verb is
  argued, and 033 on retiring the CLI's read-only constraint, whose §4 is a
  negative control that found an assertion asserting nothing.
- **025-029 are about the method, not the model**, and are the ones worth
  reading if you are about to write a document. Their rules, which is all you
  need from them:
  - A condition recorded where nobody re-reads it is not a mechanism (025).
  - A predictions document may not rank outcomes by how impressive they would
    be (026).
  - Prose agreeing with itself is not evidence that the code agrees with the
    prose (027).
  - A numeral in prose must earn an assertion, be deleted, or be explicitly
    dated (028). Zero of the seven audited earned an assertion.
  - A conclusion can be right with the reasoning under it wrong, and no test
    catches that because the tests pass either way (029). Hence: paired and
    interleaved, one variable, *round one is not the result*, and a negative
    result is not evidence unless it could have been positive.
  - **"Be more careful" is not an available remedy** (028's last section). Four
    instances of one defect were committed in a day by two authors who had it
    named and in front of them. What worked was checking the *other side* of
    the operation in front of you, and a disagreeing measurement.

**The live counts of anything countable are in the code, not here** —
`NODE_LABELS.length` and `EDGE_LABELS.length` in `src/db/domain.ts`, the tool
list in `src/mcp/tools.ts`, the scripts in `package.json`. This paragraph used
to carry those numbers and was wrong about them repeatedly.


`docs/mcp-tools.md` is **the domain's API as one reviewable file** — every MCP
tool, what it takes and what it returns — generated from the tool declarations
by `bun run docs:tools`. The same document is served live at
`labkit://docs/tools`.

It is checked in because its **diff** is the useful part: a changed line means
the API changed. Freshness is one assertion in `tests/mcp.test.ts` (the
checked-in file equals what the generator produces), not a hook and not a
`check:*` script — that test already renders the document, so the check rides a
run that was happening anyway. The accepted cost is that a commit touching
`src/mcp/tools.ts` also touches this file.

`docs/dependency-graph.mmd` is the module dependency graph, as text.
`bun run dev:dependency-cruiser` regenerates it — **by hand, when you want it.**

It was briefly self-maintaining, via a `.githooks/pre-commit` that regenerated on
every commit touching `src/` or `tests/`, alongside a 134KB SVG. Both were
removed on 2026-08-21. The graph is documentation, and documentation that
rewrites itself inside someone else's commit buys less than it costs: it put a
generated artefact in the diff of every code commit, and the byte-stability that
made "the graph changed" mean "the module structure changed" was there to stop
that being noise rather than to make it useful. The SVG went for its own reasons
— 1,444 generated lines in which a moved edge is invisible, against 3KB of
mermaid that renders on GitHub and diffs line by line. PJ-007 records a design
change prompted by *reading* the SVG, which is the case for having had one; it is
not a case for regenerating it forever. `npx depcruise-fmt -T dot` over the
cruise JSON recovers one if a person wants it.

It is **not a gate** and never was: `npx depcruise src tests --output-type err`
is. Generation lives in `scripts/update-dependency-graph.sh` rather than a
`package.json` one-liner because the one-liner was a pipeline, and `$?` after a
pipeline reports the last command's status — a crashed `depcruise` used to yield
an empty SVG and a success code.

**Do not use this repo's shorthand when reporting to the user.** `§5`, `bar 4`,
`D2`, "the rungs", the ledger status words and the row letters are compression
that pays between documents and costs on sight. Say *"we showed it gives a wrong
answer"*, not *"it clears §5"*. A glossary makes documents readable and does
nothing for a sentence in a reply — the user hit unexplained shorthand three
times in one session, twice after it was noticed and once in the same message
that announced the glossary.

`docs/GLOSSARY.md` is a pointer table for the shorthand this repo uses across
documents — `D2`, `§5`, `bar 4`, the rungs, the ledger status words. It defines
nothing itself; every entry names where the real definition lives, because a
second copy is a second thing to go stale. Read it if a token in a journal entry
means nothing to you; `D1`/`D2` in particular mean two unrelated things
depending on the document.

`docs/TASKS.md` is the **work queue** — actionable items only. It carries no
statuses, verdicts or counts; PJ-008 §3's index is authoritative on what the
model knows, and standing facts and gates are in this file.

**Never suggest `git reset --hard` to another session.** You cannot see its
working tree. Suggested to `labkit-minion` on 2026-08-21 to get it onto a merge
commit; it had **five uncommitted files** at that moment, including a fix and a
predictions document, and the command would have destroyed all of them silently.
It rebased instead and said so. `rebase` reaches the same place and refuses when
the tree is dirty, which is the property that matters across a boundary you
cannot see through. The advice was right in shape and wrong in verb.

More generally: a parallel session's **worktree state is invisible to you** in a
way its branch state is not. `git log` tells you where it is; nothing tells you
what it is holding.

`docs/consumer-contract/` holds the **predictions-and-verdict pairs** — an
odd-numbered file states what a probe will show and what would refute it, the
next records what happened. Bare numerals elsewhere in this file mean
`docs/project-journal/`; consumer-contract files are always named with their
directory, because both chains have an `029`. The pile closed with the
inferred-verb corpus.

`docs/session-log/` holds mechanical per-session handovers written by the
`wrap` skill (`.claude/skills/wrap/`) — disposable, not decisions, numbered
independently; see its README. The Stop/SessionStart wiring lives in
`.claude/settings.json`, which is **checked in** — it was gitignored until
2026-08-20, so a clone got the skill without the hook that runs it. What stays
out of the repo is `.claude/settings.local.json` (machine-local) and
`.claude/.wrap-state/` (one file per session, derived from git; a tracked copy
would hand a new worktree another session's pinned baseline).

## Commands

```sh
bun install                    # install dependencies
bun test                       # run all tests
bun test tests/domain-graph.test.ts   # run one test file
bun test tests/scenarios/       # run the PJ-008 acceptance scenarios
npx depcruise src tests --output-type err   # layering rules (errors) + cycles
bun run dev:dependency-cruiser  # regenerate docs/dependency-graph.mmd
bun run docs:tools             # regenerate docs/mcp-tools.md from the MCP tool declarations
bun run typecheck              # tsc --noEmit
bun run check:migrations       # lints drizzle/*.sql for destructive DDL
bun run check:doc-comments     # finds doc comments detached from what they document
bun run check:tests-assert     # finds tests that assert nothing, or comparing two literals
bun run check:stdout          # nothing under src/ writes to stdout except the CLI
bun run check:no-tracked-symlinks  # fails if a symlink is tracked in git
bun run check:prop-classes     # INDEXED_PROPS must name exactly the IndexedString/Timestamp props
bun run check:no-stringly-typed  # no bare `string` in a core/read/write signature
bun run check:pglite-concurrency  # regression check for a known pglite-socket bug — see "Testing patterns"
bun run db:generate            # drizzle-kit generate, after editing src/db/schema.ts
bun run db:generate:custom --name=<name>   # empty hand-written migration (for AGE DDL drizzle-kit can't diff)
bun run example               # examples/full-lifecycle.sh — a research lifecycle through the CLI
bun run dev                    # the CLI (src/cli.ts)
bun run mcp                    # the MCP server over stdio (src/mcp/server.ts)
```

There is no lint script yet. `bun run build` compiles `src/cli.ts` to a
binary. `src/index.ts` is still a stub; **`src/cli.ts` is not** — it is the
full surface, reads *and* writes (`bun run dev`).

**It was read-only by construction and is not any more**, and that is the same
correction the MCP server got. Read-only was never a shipping goal; what it
produced was a record with **no way to put anything into it** except by wiring
up an agent and an MCP server. The one script that did write —
`examples/full-lifecycle.ts` — did it by calling `TenantGraph.createNode`
underneath the domain layer, which is the bypass the read-only tests existed to
prevent, in the only writer there was. The two structural tests were deleted
with the commit that added write commands, not worked around, and
`tests/helpers/read-only.ts` went with them.

**Every public verb on either surface has a command**, derived in
`tests/cli.test.ts` from `src/domain/read.ts` and `src/domain/write.ts` the way
`tests/mcp.test.ts` derives tool exposure — a verb without one must be listed in
`NO_COMMAND_FOR` with a reason. Nothing is. `labkit --help` is the command list;
this paragraph deliberately does not count them. What survives from the
read-only era, as a narrower test: **the CLI reaches the graph only through the
domain verbs**, calling nothing on the `TenantGraph` it constructs.

**Its event log is passed in, not defaulted, on both halves.** `SessionCore`
falls back to `inMemoryEventLog()`, which in a process that exits after one
command is an array nothing ever wrote to. On the read side `labkit happened`
then reports that nothing has ever happened against a full database; on the
write side a verb commits its graph changes durably while the event describing
them dies at exit — durable state with no record of the act that caused it. Both
are confidently wrong rather than empty. `main()` builds one `pgEventLog()` over
the connection the graph already has and hands it to both.

**The CLI is where attribution stopped being a mock.** `src/attribution.ts`
predicted that a real `GitContextProvider` would be the first subprocess under
`src/`; `gitContext` is it, and `personContext` names the user. The MCP server
keeps the stubs, because *which agent* and *which session* are facts the
protocol does not carry. `--author` overrides the username, because a script
driving LabKit is not the account it runs under.

**`--db <dir>` and `LABKIT_HOME`** name the directory holding `.labkit/` —
the project root by another route. `derivePort` hashes that path, so a temporary
directory gets its own file *and* its own port, which is what makes
`examples/full-lifecycle.sh` hermetic. `LABKIT_DB_URL` still wins over both.

**`src/mcp/server.ts` reads *and writes*** (`bun run mcp`). It was read-only for
one batch of work and that is not a design position: a record nothing can write
to has nothing in it. Read and write handlers are handed different surfaces, so
neither can reach the other's verbs, and
`tests/mcp.test.ts` asserts every public verb on either surface is exposed or
listed in `NOT_EXPOSED` with a reason. **`docs/mcp-tools.md` is the tool list**;
this paragraph deliberately does not count them.

`bun test`'s exit code means what it says: **0 is a clean run, non-zero is a
failure.** It returned 99 on a passing suite until PGlite 0.5.7 (2026-08-24)
fixed the WASM teardown interaction behind it.

`bun run example` (`examples/full-lifecycle.sh`) had the same defect in its
predecessor and is where the lesson below was learnt. `full-lifecycle.ts` exited
99 on a success, so this file told everyone to ignore its exit code and read the
output instead — and the script had been dead since `af5a1d2` deleted the views
it read back through, dying at `relation "labkit_t1.claim" does not exist` for
221 commits. The rule was added *the same day, after the break*, by the commit
whose subject was closing out the last verification step. Declaring the exit code
meaningless left the genuine failure with no watcher either.

The shell version keeps what that cost bought: **0 means it worked and nothing
else does**, it asserts on the answers rather than on whether the commands ran,
and each assertion is one a person could check by hand. It is hermetic —
`--db` points it at a temporary directory removed on exit — so it can neither
touch a working database nor contend with one. It also **drives the CLI and
nothing else**, where `full-lifecycle.ts` wrote by calling
`TenantGraph.createNode` underneath the domain layer: a writer that put nodes on
the record no verb had recorded making.

The general lesson, which cost more than the script did: **a rule that tells
readers to ignore a signal removes the only watcher that signal had.** If a
signal is unreliable, fix it or delete it — do not annotate it.

Note also that `$?` after a pipeline reports the *last* command's status, so
`bun ... | tail` will happily report success that isn't there. This has now
caught someone twice: the second time with `${PIPESTATUS[1]:-$?}`, which is
**bash** — this shell is zsh, where it is lowercase `pipestatus` — so the
expression fell through to `$?` and reported `wc -l`, passing a fix that was
dead code.

**The pipe costs the diagnosis as well as the status, and that half is easier to
walk into.** `bun test | tail -5` keeps the pass/fail counts and throws away
every `(fail)` line, so a run reporting 23 failures leaves you unable to name a
single failing test — or to tell a real regression from a teardown cascade.
Redirect to a file and read the file: `bun test > run.log 2>&1`. This is a fact
about the pipe, not about that incident.

**Nothing runs these for you** — there is no CI workflow and no git hook. Before
committing, run `bun test`, `bun run typecheck` and
`npx depcruise src tests --output-type err`; add `check:migrations` if you
touched `drizzle/`, `check:tests-assert` if you touched tests,
`check:prop-classes` if you touched a `*Props` interface, and
`check:no-stringly-typed` if you touched a signature in `src/domain/`. Do not pipe
`bun test` — that trap is above, and is still live.

## Architecture: two persistence halves, deliberately not one

The domain has ~14 entities (Question, LineOfEnquiry, EvidenceUnit,
Evidence, Claim, Decision, Criterion, CriterionEvaluation, Gate, Review,
Artefact, Computation, Task). Only **`Tenant`** (`src/db/schema.ts`) is a
relational Drizzle table — it's the persistence/isolation boundary, not a
scientific entity (see PJ-003 for why `Tenant`, not `Project`). Every other
entity is a node in **one Apache AGE graph per tenant**, because provenance
traversal and dependency propagation are the actual point of this domain —
forcing them into FK tables would just reimplement graph traversal as
recursive CTEs.

`src/db/` is layered, not a hub — each module has one job, and the
dependency direction is enforced by `npx depcruise src tests --output-type err`
(violations only; `bun run dev:dependency-cruiser` redraws
`docs/dependency-graph.mmd`):

| module | job |
| --- | --- |
| `client.ts` | `LabKitDB` (the connection seam) + `bootstrapSession` |
| `agtype.ts` | agtype parsing, identifier validation, Cypher clause/quoting helpers |
| `cypher.ts` | `CypherRunner` + column decoders — typed Cypher execution |
| `domain.ts` | what LabKit's entities *are*: labels, `*Props`, `NODE_TYPES`, `EDGE_SCHEMA`, `INDEXED_PROPS` |
| `graph.ts` | `TenantGraph` — the domain-typed verbs |
| `provisioning.ts` | per-tenant graph schema reconciliation |
| `tenant.ts` | resolving a slug to a `TenantContext` |

`domain.ts` imports nothing from `src/db/`; it's pure types and data, read by
both `graph.ts` (to type and validate writes) and `provisioning.ts` (to decide
what to create). Its **string taxonomy** — `IndexedString`,
`Timestamp`, `IdentityString`, `ReadOnlyString<T>`, `Prose` — says what LabKit
*does* with each stored string, so a reader learns it from the declaration
instead of auditing every Cypher query. All five are plain aliases and constrain
nothing; the one with a machine consequence is `INDEXED_PROPS`, which
`provisionTenantGraph()` loops to build a non-unique functional index per
matched property, and which `check:prop-classes` holds to the annotations. Two
copies of one fact, kept because they fail silently in opposite directions — a
missing entry is a sequential scan nobody sees, a spurious one an index nobody
reads. Generating the table from the types is the honest end state. `NODE_TYPES` is one entry per node label carrying its
natural-id `prefix` and its optional `validate` — the four parallel per-label
tables it replaced are not coming back. It also carried `viewColumns` until the
per-tenant CQRS views were removed; see "No relational read side" below.

All graph access goes through `TenantGraph` (`src/db/graph.ts`), constructed
per-tenant as `new TenantGraph(ctx, db)`. Never touch AGE directly:

- `query(cypher, columns, params)` — the read surface. `columns` is
  `{ returnedName: decoder }` (`vertexProps`, `edgeProps`, `vertex`, `edge`,
  `path`, `scalar`, `agtypeValue`, `optional` — all from `src/db/cypher.ts`).
  That one declaration produces both the SQL `AS` clause AGE requires and the
  row type, so callers never hand-write `"(n agtype)"` or call `parseAgtype`
  themselves. Params are bound as agtype, never interpolated.
- `createNode(label, props)` — `label` selects the property shape via
  `NodePropsByLabel`, so passing another label's props is a compile error.
  Stamps a short natural ID (`COMP_123`, prefix from `NODE_TYPES[label].prefix`)
  in the same round trip; strips AGE's internal graphid before returning. That
  graphid must never reach a caller outside this file.
- `createEdge(fromId, edge, toId)` — resolves both endpoints' labels from
  their natural-id prefix, validates the `(fromLabel, edge, toLabel)`
  combination against the authoritative `EDGE_SCHEMA` table, and is
  idempotent: calling it twice with the same three values is a no-op, not a
  duplicate edge (enforced by a real `UNIQUE (start_id, end_id)` Postgres
  index per edge label — see "AGE-specific gotchas" below).

A compound domain verb must run inside `graph.inTransaction(fn)` — everything
it writes commits together or none of it does. Earned by external review of
S-3c (PJ-020), by negative test in each case: `replaceAnalysis()` invalidates the superseded
output *before* recording the replacement, and since S-3c invalidating an output
withdraws the criterion evaluations that cited it, so a failure between the
halves left an earlier failure no longer deciding its check and no corrected
check in existence. `reverify()`, `replaceAnalysis()` and `recordAnalysis()` use
it, and so do `reinterpret()` and `amendDesign()` — every compound verb now
does. It is re-entrant by depth, so a composed verb does not nest `BEGIN`. Note
this is a transaction boundary, not an escape hatch: no caller gains the ability
to issue Cypher this class would not otherwise run.

There is deliberately no raw-string escape hatch on `TenantGraph`. If a query
needs a shape the decoders don't cover, add a decoder to `src/db/cypher.ts`
rather than reintroducing one.

`TenantContext` (`{ tenantId, graphName }`) comes from
`resolveTenantContext(db, slug)` (`src/db/tenant.ts`) — the CLI/MCP/bootstrap
boundary resolves a tenant once; below that boundary, every function takes a
resolved context, there is no "tenant omitted" mode.

## The domain service layer (`src/domain/`)

Two different things are called "domain", deliberately. `src/db/domain.ts` is
the domain *as expressed in graph structure* — labels, edge schema, property
shapes. `src/domain/` is the domain *as it matters to a researcher*:

```
src/db/        knows nodes and edges
src/domain/    knows research actions
src/mcp/       knows researcher/agent language
```

`ResearchSession` (`src/domain/session.ts`) is **verb-first**. There is
deliberately no `createClaim()`/`createEvidence()` — those are persistence
operations wearing domain names, and exposing them pushes ontology knowledge
back up to the caller. One verb may write many nodes and edges:
`recordAnalysis()` writes a computation, an evidence unit, an output artefact,
and one evidence plus one claim per conclusion.

**Verbs are added when a scenario needs them, not in anticipation.** The
current set is what PJ-008's S-11, S-17, S-3, S-4, S-1, S-7, S-12, S-5, S-8,
S-3b, S-3c, S-10, S-9, S-14 and S-18 required. Return types are derived one-per-bullet from a scenario's
"Afterward" questions
rather than designed — if a bullet has no natural home in the types, the API
is wrong, not the bullet.

A verb that composes others records **one** event, not one per step
(`openEnquiry` is `pose` + `pursue` and emits only `openEnquiry`). The event
stream is a record of research actions; a researcher who opened an enquiry did
one thing, and a log that decomposes it describes the implementation instead.

`src/domain/events.ts` is the **execution-context seam**: every state-changing
verb flows through one choke point that stamps it from an injected
`CommandContext` — a `Clock` and an `AttributionContext`. Time was the first
aspect of a command's execution context to be injected and never the only one
there is; PJ-009 §3's argument for building the seam early (the API discipline
is what is hard to retrofit, not the field) applies unchanged to *who ran this*,
and PJ-031 is where it was applied.

Two consequences worth knowing before touching this:

- **A surface holds no query state, so it is cheap to construct per command.**
  `src/mcp/server.ts` builds a `WriteSurface` per tool call over one shared
  graph and one shared sink, which is how attribution and `git_hash` come out
  per-command without any verb taking a context parameter. The sink is
  constructed by `main()` and passed in — **not** defaulted inside a surface. A
  per-call surface defaulting its own log fragments the stream silently, and
  `tests/attribution.test.ts` is the guard.
- **The sink is durable, and attribution is what earned it.** It was in-memory
  from PJ-009 §3 until PJ-032, on the honest grounds that nothing read the
  stream — every historical answer comes from the graph, asserted with a
  provably empty log. Attribution (PJ-031) was the consumer that changed it:
  who ran a command is not reconstructable from the graph at all.
  `pgEventLog()` (`src/domain/event-store.ts`) writes `public.labkit_event` on
  **the same connection as the graph**, which is what makes an event commit with
  the writes it describes. `inMemoryEventLog()` is still the default and is what
  every test uses.
- **Every write verb runs inside `inTransaction`**, because an event has to
  commit with its writes. That was not true before PJ-032: all 18 `emit` calls
  sat *after* their closure returned, and ten verbs had a transaction that the
  event was outside of. A side effect worth knowing — three tests used to assert
  that an interrupted verb leaves an unreachable orphan, and now assert it
  leaves nothing.

The rule that keeps the sink honest, and it did not change:

> Events explain *how state changed*. The graph explains *what the current
> research state is*.

Don't answer a "what is true now" question from the event log. Nor a "what was
true then" one: S-1 asks what was known at the moment a question was sharpened,
*after* later evidence has arrived, and it is answered from durable state — the
sharpening freezes the findings it was taken in light of onto the decision. The
scenario asserts it with an empty event log open beside it. See PJ-008 row Z for
the level above that, which is not answerable and has not been made so.

Two layering rules are enforced as `dependency-cruiser` **errors**, not
conventions — `npx depcruise src tests --output-type err`:

- `tests/scenarios/` may not import `src/db`. A scenario asserts a
  researcher's intent can be carried out through research verbs alone; if it
  needs the persistence layer, that's a finding to record, not something to
  route around. `tests/helpers/` is exempt (harness, not caller).
- `src/db` may not import `src/domain`, so the graph model can't come to
  depend on today's verbs.

### Changing the graph model

New labels and edges are earned by a scenario, not designed up front. The bar
PJ-009 set, and the reason `CONSUMES` cleared it while inference supersession
did not:

1. A service query must return a **wrong answer** without the relationship —
   demonstrated by running the test against the old traversal, not argued
   from an ugly query path.
2. An **empty** result is not a wrong one (PJ-011 §5). It is *unanswerable*,
   which is true of any question the model has never been asked, and any
   missing feature manufactures one. Only a confidently incorrect answer
   shows the model claiming something it cannot support. The same rule read
   from the other side: **a refusal needs something real to refuse.** S-5's
   decline-rather-than-guess pattern applies to a verb a caller would
   otherwise use wrongly; inventing a verb in order to reject its arguments
   manufactures a refusal exactly as a missing feature manufactures an empty
   result (S-10, PJ-019). Where no such verb exists, the caveat travels with
   a report a reader already asks for.
3. The new edge needs a **reader, not just a writer**. An edge that is
   written and never queried is the dead-code shape PJ-007 found in
   `buildAsClause`.
4. A predicted gap that fails to materialise is a **result**. PJ-008's §3
   ledger keeps such rows — see row B, and row A, which PJ-008 called its
   strongest single prediction and which S-3 refuted. The ledger distinguishes
   three kinds of unfinished row — `open` + owned (an unbuilt discriminator is
   named, marked `°`), `open` + unowned (every named probe built, a new one
   needed), and `boundary`; only the middle kind is a gap in the method. See
   its §3 legend.
5. When two models both fit, **record both and pick neither** (row V). Do not
   ship API for an undecided model either: a speculative verb written to
   probe row V was removed rather than left in place.

A relationship can still be **earned after being implemented prematurely** —
but the evidential sequence has to be reconstructed explicitly, by deleting the
edge and demonstrating the wrong answer that returns. S-7 wired `IMPLEMENTS`
before showing what it prevented, then showed it afterwards: with the edge
gone, an amendment that moves a prespecified comparison reports itself
*mechanical*. Implementing first is the wrong order; leaving the evidence
unreconstructed is the actual defect.

Ask of every verb that mints something: **does the act record what it
produced, or only what it acted on?** Four scenarios in unrelated regions have
hit it — S-1 sharpening a question, S-7 amending a design, S-12 narrowing an
interpretation, S-3c replacing a defective check — and all four needed
*different* remedies: a new edge, nothing at all, a new edge again, and a field
on a return type. That is why it stays a review heuristic and not a
relationship. S-3c adds the sharper form of the question: **ask it of a verb's
return type, not only of its writes.** `replaceAnalysis()` wrote its replacement
into the graph correctly and withheld the reference, which blocked a scenario
outright rather than merely degrading an answer. See PJ-008 row AB.

Ask also **when** a relationship is written, not only what it connects. A
prespecified check nobody ran must still count against the finding it
qualifies, so `QUALIFIES` is written when the analysis is recorded and not when
the check is evaluated — the same edge minted at the later moment cannot
express the case the scenario exists for (S-3b, PJ-016).

**Identity is never wording** — and its other half, **which record is this
answer about?** The second is PJ-030: a reference denoting one record while the
verb answers about another. `tests/subject-identity.test.ts` holds the whole
argument in one file and is worth reading before touching a report or a verb
signature.

**No bare `string` in a signature in `core.ts`/`read.ts`/`write.ts`**, enforced
by `bun run check:no-stringly-typed`. A parameter either names a record — a
`Ref` — or carries a value, in which case it takes one of `src/db/domain.ts`'s
taxonomy aliases. The taxonomy is what makes the rule satisfiable: without
somewhere to put `pose(question: Prose)` there would be no answer for it.

**A handle is a branded string: `Ref<K> = string & { [KIND]: K }`.** It *is* the
natural id, and the brand exists only at compile time. It was `{kind, id}` for
one day, and both of that shape's failure modes shipped in the commit that
introduced it: a handle bound as a Cypher param matched nothing (params are
`Record<string, unknown>`, so `{ id: gate }` type-checks), and
`left.enquiry === right.enquiry` was reference equality — always false,
type-correct, and it turned a contradiction into a dissociation until S-5 caught
it. Neither is expressible now.

**The branded form has one failure mode of its own, and it is the mirror
image.** A `string | Ref` union is invisible at runtime, so
`typeof subject === "string"` is true for *both* arms — `whatDependsOn` sent
every handle off to be looked up by logical name and threw `no artefact named
"ART_21"`. **Discriminate on the prefix, never on `typeof`**: `isRefOfKind()`
(`src/domain/report.ts`) asks whether an id's prefix names the label a kind
expects, which is the same question `ref()` asks when minting and the same one
`createEdge` has always asked of an endpoint.

`ref(kind, id)` **refuses a mismatch** — `ref("gate", "CLM_1")` throws. That is
what replaced the `kind` field, and it checks more: the field only recorded what
a caller *said*, and could contradict the id beside it.

**Every handle in a report is a `Ref`, and every verb takes one.** A value read
out of a report goes straight back into a verb — `gateStatus().gate` into
`designHistory()` — with no re-wrapping. Reports carry `{handle, wording}` pairs
where a reader needs the text (`{claim, asserts}`, `{criterion, requires}`,
`{work, objective}`, `{evidence, states}`); the handle is never a bare string
and the wording never stands in for it.

**A verb that mints something returns what it minted.** `recordAnalysis`,
`replaceAnalysis` and `reverify` all return their claims. This is the
`does the act record what it produced, or only what it acted on?` heuristic, and
it has now caught seven things — the last three because a caller could not name
a claim without describing it.

Six unrelated regions have had to decide the first form — claims (S-5), interpretations (S-12), criteria (S-3b), evaluations
(S-3c), execution inputs (S-10, caught by review after shipping wrong) and
artefacts (S-9, where a regenerated part carries the name of what it replaces).
Three of the six got it right first time because someone asked at the time, so
the rule is not "we keep failing at this" but **every new comparison is a fresh
chance to fail at it**: when you write an equality test between two records, say
out loud which field carries identity.

A claim has its own handle, `ClaimRef`. Two stages of one programme can assert
the same sentence about different endpoints, and merging them reports a claim
that is simultaneously supported and challenged when each separately has a clean
answer (S-5).

**No verb resolves wording.** They take handles; `claimsAsserting` is the one
place text becomes a handle, it returns *every* match, and it refuses to pick.
The CLI resolves there and so do the tests (`tests/helpers/claims.ts`). One
consequence worth knowing: `whySupported` can no longer answer about a
proposition nobody has claimed — there is no handle for one — so *"has anyone
claimed this?"* is `claimsAsserting` returning empty, which S-4 and S-1 assert.

Prefer structure in the **query** over structure in the **stored model**.
S-3's four gate states and per-criterion itemisation are computed, not
stored, so there is no `Gate.status` field to maintain and no value anyone
can set to "passed". Stored shape is where change gets expensive; queries are
free to be wrong and re-run.

**Do not cull unused labels or edges during domain discovery** (PJ-011 §6).
Every label is provisioned into every tenant up front, so declared-but-never-
walked structure is a computable map of where the model has untested claims —
**There is no such example at label granularity.** As of S-18 every label in
`EDGE_SCHEMA` has both a writer and a reader, and every node label is created
by some verb — `DEFERS` was the last unwalked edge, and `CHALLENGES` before it;
`PROMOTES` arrived with both. That is the outcome the policy exists to allow,
twice over.

**There is one at endpoint-pair granularity, and the distinction was not being
made until row AD's review found it.** `PRODUCES` has readers in abundance, and
every one of them ends at an `Evidence`; the single traversal reaching an
`Artefact` starts at a `Computation` (`write.ts`'s `outputArtefactOf`). So
`PRODUCES: ["EvidenceUnit", "Artefact"]` — written by `recorded()`, carried
through every tenant — **has a writer and no reader**. A label's entry in
`EDGE_SCHEMA` is a list of endpoint pairs and each pair is a separate claim
about the domain, so "the label is walked" is the wrong unit to check.

Named rather than culled, which is the policy working: an unwalked pair is a
computable map of where the model has an untested claim, and an *unnamed* one is
a map nobody has. Contrast it with `EvidenceUnit.role` — one writer, no readers
— which was **not** given the same protection and had a tenth value declined,
because that policy covers labels and edges as claims about the domain and a
property value is not one. The two are the same shape at different levels and
the policy's answer differs; that contrast is the informative part.

**The type now carries that fact, so this paragraph does not have to be found
first.** `role: ReadOnlyString<EvidenceUnitRole>` says in the declaration that
nothing reads it — see the string taxonomy in `src/db/domain.ts`, whose whole
purpose is that *what LabKit does with a stored string* should be readable
where the property is declared rather than reconstructed by auditing every
Cypher query.

Keep the policy anyway, for what it caught on the way out. `DEFERS` had a
reader that could report `closure: "deferred"` and no writer, so the branch was
unreachable — and when S-14 finally entered it, the branch was **wrong in two
ways**: it reported `open: false` for a question deliberately left open, under
a token naming a state nothing could produce. Unwalked structure is a
computable map of where the model has untested claims, and that claim was
untested and false. A cull would have deleted the map along with the error.

This protects **labels and edges**, which are claims about the domain. It does
not protect query conveniences with no consumer — the per-tenant CQRS views
were removed on exactly that distinction (see "No relational read side").

### When a deferral stops being acceptable

Recording two models and picking neither is the right move often enough that
the stack of deferred rows grows on its own. PJ-012 named the failure mode it
risks and PJ-013 found it still unaddressed:

> the model stays technically undecided while the code quietly encodes one
> reading anyway.

Two rules, so this is checkable rather than remembered:

1. **At most one confirmed wrong answer ships green at a time, and clearing it
   is the next thing built.** A deferred row that records a *demonstrated*
   wrong answer — not an empty result, not an ugly query — is a live defect
   with a comment on it. One is a considered trade; two means the trade stopped
   being considered. **A row whose severity is widened by the change that
   cleared another row is nominated too, demonstrated or not** — otherwise
   clearing one row can quietly make a second worse while the rule that would
   have caught it stops applying, which is exactly what happened to row X when
   S-3b cleared row V (PJ-017 §3). Which row, if any, is currently
   `demonstrated` is in PJ-008 §3's index table and nowhere else. A checker
   held two copies of that status to each other until 2026-08-22; the copies
   were deleted instead, and a fact in one place needs no checker.
   Row AD held it for a few hours on
   2026-08-21: `recordObservations()` minted no `EvidenceUnit`, so a question
   worked on through observations alone reported itself as one nothing had ever
   been run against. It was found by S-9b and cleared the same day, which is the
   rule working at the speed it was written for. Before AD, row V was cleared by
   S-3b (PJ-016) and row X — nominated under
   exactly that widening rule, then demonstrated and cleared by S-3c (PJ-018) —
   was the last. The nomination rule worked end to end: a row made worse by
   another row's fix was named, built and closed, and the four scenarios X spent
   unowned are the measure of what the rule is for.
2. **Every deferred row names the scenario that would settle it.** A row that
   cannot name one is not deferred, it is unresolved and unowned, and it should
   say so in its own cell. "Record both and pick neither" is a decision about
   *models*; it is not a decision to stop looking for the discriminator.

## Tenant provisioning is reconciliation, run every time

There's no `ALTER GRAPH` DDL the way there's `ALTER TABLE` — evolving a
tenant's AGE graph structure (new label, new edge, new index) is
the application's job. `resolveTenantContext()` calls
`provisionTenantGraph()`, which — inside one transaction guarded by a
transaction-scoped `pg_advisory_xact_lock(tenantId)` — unconditionally
ensures the graph, every `NODE_LABELS`/`EDGE_LABELS` entry, every natural-id
index and every edge-uniqueness index exist.
This runs on *every* `resolveTenantContext()` call, deliberately, not gated
behind a version check — an earlier version added a `schema_version` gate as
a performance optimization and it was reverted (PJ-005) because it silently
stopped tenant resolution from self-healing drift. Don't reintroduce that
kind of gate without a measured cost driving it.

**No relational read side.** Every tenant used to get one SQL view per node
label, reconciled on each `resolveTenantContext()`. Nothing ever read them, and
nothing could: `TenantGraph` has no raw-SQL escape hatch, so every domain and
scenario read goes through `cypher()`. They were removed after eight scenarios
without a reader — 13 `CREATE OR REPLACE VIEW` statements per tenant per
resolution, plus a standing non-additive migration problem (a view's columns
can't be removed or reordered in place) held open for no consumer. This is not
a reversal of the no-cull policy: that policy protects unused *labels and
edges*, because a declared-but-unwalked edge is a claim about the domain. A view
claims nothing. The MCP/CLI read layer was the case for bringing them back and
it has since been built without them — every read goes through `cypher()` and
none wanted a relational projection. `git show 51b70d6:src/db/provisioning.ts`
has the implementation if one is ever earned;
`provisionTenantGraph()` and `dropTenantGraph()` (`src/db/provisioning.ts`)
are the only exports there. The class that does the work,
`TenantGraphProvisioner`, is **module-private** on purpose — it takes no lock
and opens no transaction itself, so `provisionTenantGraph()` is the only
entry point. Tests exercise reconciliation through `resolveTenantContext()`,
the same path production uses, never by calling internals directly.

"Ensures ... exists" means additive structure only: indexes are checked by
name (`IF NOT EXISTS`), labels by existence. There is deliberately no story
yet for a non-additive schema change (renaming a label, reshaping a
property that already has data) — see PJ-005's "Judgment calls."

## Connection/backend layering

`connectDb(projectRoot)` (`src/db/connect.ts`) picks a `DbBackend`
(`src/db/backend.ts`):

- **PGlite + leader election** (default): PGlite is single-writer, so
  multiple local processes race a PID lockfile; the winner opens the real
  PGlite file and serves it over `pglite-socket`'s Postgres wire protocol,
  everyone else (and the primary itself) talks to it as a plain `pg.Client`.
  Only the primary calls `runMigrations()`, exactly once, before serving.
- **Direct Postgres** (`LABKIT_DB_URL` env var set): no election, connects
  straight to a real Postgres. Migrations are *not* run by this backend —
  that's an out-of-band deploy step by design (see PJ-004).

`bootstrapSession(db)` (LOAD/search_path) must be called by every new
session regardless of backend — it's session-scoped Postgres state and
can't be migrated away, unlike the one-time `CREATE EXTENSION` bootstrap in
`drizzle/0001_age_bootstrap.sql`.

## Migrations

`drizzle/` mixes `drizzle-kit generate`-produced files (currently just
`0000`, the `tenants` table) with hand-written `--custom` ones (`0001`
extension bootstrap, `0002` global natural-id sequences/functions) in one
journal, applied together via `runMigrations()`
(`drizzle-orm/pglite/migrator`). Custom migration files use
`--> statement-breakpoint` between statements — required because PGlite's
prepared-statement protocol can't execute a file containing multiple
semicolon-separated statements in one call; `drizzle-kit generate --custom`
does not add these automatically, you must.

There is no persistent database yet (still pre-first-deploy). Until that
changes, migrations get edited/regenerated *in place* rather than stacked —
see the "License to rewrite history" note in
`docs/project-journal/004_tenancy_implementation_plan.md`. Once a real
database exists, that stops being true and this note should be updated.


## AGE-specific gotchas (see `.claude/skills/postgres-age/SKILL.md` for the full reference)

`pglite-age` is a genuine compile of Apache AGE's own C source (pinned at
branch `PG18`, tag `v1.7.0-rc0`), not a reduced WASM-only subset — see the
skill doc's "Overview" for how that's established and PJ-006 for why it
mattered. Working gotchas:

- **`MERGE` for relationships is broken** — creates an edge with
  `start_id`/`end_id` both `0`, never actually connecting the two nodes
  (WASM/pglite-age-specific, not stock AGE — see the skill doc).
  `createEdge()` uses explicit `MATCH`-then-`CREATE` instead, backed by a
  real `UNIQUE (start_id, end_id)` index as the actual concurrency
  guarantee (a losing concurrent `CREATE` hits Postgres error `23505`,
  which `createEdge()` catches and treats as success).
- No whole-map `CREATE (n:Label $props)` — expand to `{k: $k, ...}` per key.
- **A `RETURN` name that is a SQL reserved word breaks the AS clause** —
  `RETURN d, from` becomes `AS (d agtype, from agtype)` and fails in the SQL
  parser (`42601`, `scanner_yyerror`, not `cypher_yyerror`). Alias it:
  `RETURN d, from AS origin`.
- **A camelCase `RETURN` name silently decodes as `null`** — worse than the
  reserved-word case above, because nothing fails. The AS clause is unquoted
  SQL, so Postgres folds `basisOut` to `basisout` while AGE keys the row by
  the name the Cypher `RETURN` used; the column arrives present and `NULL` for
  every row, and a decoder reads that as "nothing matched". Cost a wrong
  diagnosis once, blamed on `OPTIONAL MATCH` (S-3c). `buildAsClause()` now
  **refuses** such a name, so this is a compile-time-ish error rather than a
  debugging session; alias in the query (`RETURN basisOut AS basisout`) or
  name the variable lower-case. Labels and property keys are unaffected —
  they are quoted, and `CriterionEvaluation`/`natural_id` are fine.
- **`OPTIONAL MATCH` is not the fragile thing it looks like.** Multi-hop
  patterns bind, and so do patterns extending a variable that an earlier
  `OPTIONAL MATCH` bound — both verified directly against this backend when
  the case-folding bug above was mistaken for an AGE limitation. Don't
  restructure a query around a limit that isn't there.
- **No `NOT (pattern)` predicate in `WHERE`** — `WHERE NOT (e)-[:R]->(:X)` is a
  syntax error (`cypher_yyerror`), not merely unsupported. Fetch the candidate
  and filter in TypeScript, as `whySupported()`'s `restingOn` does. Watch the
  precedence trap next door too: `WHERE a IS NULL OR a = false AND NOT ...`
  binds the `AND` tighter than the `OR`, so parenthesise before assuming a
  filter means what it reads like.
- **No edge-type alternation at all** — `[:A|B]` is a syntax error (Postgres
  `42601`, `cypher_yyerror`), not just the variable-length `[:A|B*1..3]`
  form. Chain explicit `MATCH`/`OPTIONAL MATCH` per type, or use a
  single-type `[:TYPE*1..5]` for variable length.
- Every AGE label (vertex or edge) is a real Postgres table
  (`ag_catalog.ag_label`), so plain SQL indexes/constraints/reads can target
  it directly — this is how natural-id uniqueness and edge uniqueness both
  work, with no `cypher()` call involved.
- **Always schema-qualify explicitly** — `ag_catalog.` for AGE catalog
  functions, `src/db/schema.ts`'s `LABKIT_SCHEMA` constant for LabKit's own
  `tenants` table and natural-id functions. Don't rely on `search_path`
  ordering to resolve an unqualified name.

## Testing patterns

Two kinds of test, with different rules.

**Acceptance scenarios** (`tests/scenarios/`) are PJ-008 corpus entries built
as executable conversations. They may import only `src/domain` — never
`src/db` (enforced; see "The domain service layer"). `tests/helpers/scenario.ts`
is the harness that hands them a ready session target.

Every "Afterward" answer is asserted **twice**: once from the value the
operation returned, once from a query issued afterwards. "Afterward" means
reconstructible from durable state, not present in a return value the caller
happened to keep — `scenario.current()` exists to open a second reader over
the same graph for exactly this.

Scenario conversations must not name a node or edge label in a Researcher or
Agent line. Needing one means the vocabulary leaked and the scenario is
failing its own premise (PJ-008 §2).

**Everything else** (`tests/*.test.ts`) tests the persistence layer directly
and may import `src/db` freely. `tests/reconciliation.test.ts` covers
additive provisioning of a *new* edge label against an already-provisioned
tenant, through `resolveTenantContext()` — the production path — never
provisioning internals.

`tests/helpers/db.ts`'s `setupTestDb()` spins up one `PGlite` instance,
runs migrations, and starts a `PGLiteSocketServer` once per file, in
`beforeAll`. Application-code test files (`tests/domain-graph.test.ts`,
`tests/agtype.test.ts`) never import `@electric-sql/pglite`/`pglite-age`/
`pglite-pgvector` themselves — they only ever see a `LabKitDB`-shaped
`pg.Client`, the same production talks through.

**Each test opens its own fresh connection** (`testDb.openClient()` in
`beforeEach`, closed in `afterEach`) — never share one connection across a
whole file. `@electric-sql/pglite-socket` has a confirmed, open upstream
concurrency bug
([electric-sql/pglite#1046](https://github.com/electric-sql/pglite/issues/1046) —
see the postgres-age skill's "Upstream filing" and PJ-006): two connections
racing, where one errors, can permanently corrupt the connection(s)
involved. Corruption stays contained to the connection that hit it, so a
fresh connection per test contains the blast radius even though the
underlying bug isn't fixed. `scripts/check-pglite-concurrency.sh`
(`bun run check:pglite-concurrency`) regression-checks this — see the
script's header for its (inverted) exit-code meaning.

A test that needs to exercise "a query loses a race and hits a constraint
violation" should do it deterministically — mock the DB layer to inject the
error at the right point (see `domain-graph.test.ts`'s `createEdge treats a
23505 from the CREATE step as success` test) — not via `Promise.all()`
against two live connections, which this backend can't reliably support.

`afterEach` drops every AGE graph and truncates every remaining table
outside `pg_catalog`/`information_schema`/`ag_catalog`/`drizzle` with
`RESTART IDENTITY CASCADE`, via a dedicated admin connection kept open for
the whole file. This resets `tenants.id` every test but deliberately does
*not* reset the natural-id sequences (`drizzle/0002_natural_ids.sql`) —
those are standalone `SEQUENCE`s, and natural ids are scoped globally per
entity-type (PJ-004 decision #3), not per-tenant or per-test. Don't assert
a specific natural-id value across more than one test in the same file for
this reason — assert on the prefix/shape instead.

`tests/leader-election.test.ts` races three concurrent `connectDb()` calls
against a shared `.labkit-test-tmp` directory to prove the PGlite backend's
election/socket-sharing actually works. It's a live, unresolved instance of
the pglite-socket bug above (see PJ-006) — flaky, and not fixable the way
the other tests were, since it deliberately needs genuine concurrent
connections to prove what it proves.

**The suite's *other* flakiness is not that bug, and attributing it there cost
two investigations.** Intermittent `graph "labkit_t1" does not exist` and
`Connection terminated unexpectedly` bursts look like the socket defect and are
not: a test's legitimate work crosses bun's fixed **5000ms** ceiling, bun's
timeout **does not cancel the test body**, and the abandoned test's late
`scenario.end()` then resets the database and closes the *next* test's
connection. Nothing hangs — 59,086 queries were tracked across a failing run
with zero unfinished.

**What pushes a test over is its own query count, not provisioning.** This
paragraph said the cost was `provisionTenantGraph()` reconciling on every
`begin()` and `current()`. That was written sixteen minutes before `6eeeb92`
cut reconciliation from ~80 round trips to three, and nobody updated it —
so it misdirected every investigation after it, including two of this repo's
own. **Profiled 2026-08-24**, and every figure in this section is of that date:
a steady-state provisioning call is **6 queries, 1-4ms**; the cold one is 83
queries and happens **once per file**; provisioning is 8-18% of query time in
the files that actually fail.

The predictor is **queries per test**. Files cluster from 6 to ~280 and
individual tests reach ~380, which is the band that straddles 5000ms once
per-round-trip latency degrades under load — and that threshold effect, not one
broken test, is why 7-15 *different* tests fail each run.

**The per-round-trip figure everyone quotes is `311 queries / 4.955s` ≈ 16ms,
measured 2026-08-21 and not since.** It is not today's rate and should not be
used as one. That run's own note says its dominant cost was
`provisionTenantGraph()` re-checking ~38 labels at one round trip each — the
exact work `6eeeb92` deleted hours later — so 16ms is an average over a query
mix that no longer exists, biased in a direction nobody has measured.
Re-measure before relying on it rather than carrying it forward.

Two costs the old sentence never named:
`reset()` in `tests/helpers/db.ts` is ~35-40ms a call and **29%** of suite query
time against provisioning's 18%, and it lands on the *test's own clock* in the
handful of files that call `begin()`/`end()` inside a test body rather than from
hooks. Bun's hook and body clocks are separate — a slow `beforeEach` reports
`a beforeEach hook timed out`, and every failure this repo has recorded says
`timed out after 5000ms`, the body wording. So in the files that set up from
`beforeEach`, setup cost is not the mechanism.

**Three changes have been made against it and none moved the failure rate.**
Measured 2026-08-24, twelve runs each, ABBA-interleaved under saturated CPU:
cutting query counts ~30%, moving setup off the per-test clock, and booting one
PGlite instead of 44. All three bought wall time — 5%, 7% and **40%** — and left
the failure median where it was. Making the suite faster does not make it less
flaky, because the ceiling is crossed by whichever test is unlucky rather than
by the slowest one.

**Before profiling, ask what the profiler cannot see.** `LABKIT_TRACE`
instruments the `LabKitDB` seam and therefore cannot observe anything before a
connection exists. WASM boot was 44-110s of a ~200s suite and invisible to it,
so three rounds of hypotheses were all downstream of the largest cost. `docs/TASKS.md` carries the method and what has been refuted; session-log
entries 022, 024 and 026 carry the numbers.
