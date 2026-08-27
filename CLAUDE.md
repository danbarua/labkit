<!-- ┌──────────────────────────────────────────────────────────────────────┐ -->
<!-- │ DO NOT MODIFY UNLESS EXPLICITLY REQUESTED                            │ -->
<!-- │ This section is pinned. Cruft below it may be pruned; this may not.  │ -->
<!-- └──────────────────────────────────────────────────────────────────────┘ -->

# DX Principles

Read this before you add anything.

Every rule below was earned by someone in this repository doing the opposite,
and each names the incident so you can weigh it rather than take it on trust.
They are about *how* to work here, not about the domain — the domain starts at
"What this is".

## Measure it, or don't write it

If a claim can be tested in under two minutes, test it before you write it down.
Cite the date beside anything you measured.

**The tell:** you are about to write a sentence containing a number, a version,
or a mechanism — "X requires Y", "this costs N ms", "the API does Z".

Four in one week. `entities.roles.exclude` was taken from the docs as the way to
stop drizzle-kit emitting a `CREATE ROLE`; reading the installed bundle showed it
is consumed only by the introspection path and cannot reach a schema-file
generate. `pgTable.withRLS()` was reported as the current API; it does not exist
in the version pinned here. "`LOAD 'age'` fails for a non-superuser, so every
Cypher query fails" was written into three files and is false on a server that
preloads AGE. And a per-round-trip figure was carried forward for days after the
work it averaged had been deleted.

## A check that cannot fail is not a check

Before trusting a check, make it red on purpose. A test with no failing input
and a script that cannot report a failure are the same thing wearing different
clothes.

**The tell:** you are adding an assertion, and you have not seen it fail.

`check:no-tracked-symlinks` printed `OK: no tracked symlinks.` and exited 0 on a
machine with no `git` — the command failed, a `|| true` swallowed it, and the
absence of a tool read as a clean result. It was found by running the gate in a
container, not by review, and it would have been green in CI while checking
nothing. Earlier, `tests/leader-election.test.ts` ran a three-way race, printed
the results and asserted **nothing at all**, while being cited in this file as
proof that election worked.

## A silenced signal is not an absent one

Ignoring something does not make it stop happening; it makes it stop being
counted. If a signal is unreliable, fix it or delete it — do not annotate it.

**The tell:** you are writing a `.gitignore` line, a `|| true`, a skip, or a
sentence telling readers to disregard an output.

`*.bun-build` was gitignored, so nobody saw `bun build --compile` leave a
61MB copy of the bun binary behind on every successful run. Thirty-two of them
reached **1.9GB** in the repo root before anyone read a directory listing. And
`examples/full-lifecycle.ts` once exited 99 on success, so this file told
everyone to ignore its exit code and read the output instead — the script then
died at a missing relation and stayed dead for **221 commits**, because
declaring the signal meaningless left the real failure with no watcher either.

## Generate into the running program, not into the tree

A generated file committed beside the code it describes reads as something worth
guarding, and the guards arrive.

**The tell:** you are about to `git add` a file a script produced.

`docs/mcp-tools.md` was checked in so its diff would show an API change. It
acquired a test asserting it matched its generator, then a CI filter needing a
load-bearing exception so that one file kept building, and then — reported from
other repos — agents proposing a parity document for the CLI surface, tests
asserting the two agree, and a gate over all of it. None of that was ever about
whether the tool list was correct, which `labkit://docs/tools` cannot get wrong.
Deleting it removed 1,055 lines. A 134KB dependency-graph SVG went the same way
on 2026-08-21.

## Delete the reason, not the exception

When a derived list needs a hand-written exception, the exception is usually
telling you something else is wrong. Fix that instead.

**The tell:** you are adding an allowlist entry, an exclusion, or a paragraph
explaining why one thing is special.

`check-all.ts` excluded one script by name, with a paragraph explaining why its
exit code was inverted. The paragraph was the signal: the script was fine and
its **name** was wrong. Renaming it out of the `check:` namespace deleted the
exclusion rather than documenting it. The same shape recurred with the CI
path filter, which needed one exception so a generated document kept building —
and the exception was a smell worth more than the test that caused it.

## State belongs in one place, and prose is not it

If a sentence would be wrong next week because something changed, it does not go
in a document. Statuses, counts, "the newest entry is N" — that is state, and it
belongs in the thing itself: the code, the index table, `git log`.

**The tell:** check the tense. A sentence about how the code *is* goes stale; one
about what *changed* does not. That makes it a grep rather than a judgement call.

Every documentation defect this repo has found was state written into a
sentence. None was a bad argument; the arguments have all held. It deleted a
checker rather than adding one — `check:ledger` existed only to police a copy
that should not have existed. Prose goes wrong in a second way no test can
catch: a comment can be **true and still name the wrong reason**. Releasing the
database between MCP tool calls was justified here as "otherwise no other agent
could work the project", which is true, and not why it matters — a person at a
terminal wants the file far more often than a second agent does. An outside
reader found that, not a test.

**Dated records are exempt and must stay exempt** — `docs/project-journal/`,
`docs/session-log/`, `docs/consumer-contract/`. They say their date and are
measurements of it, so they cannot go stale. Do not "correct" them.

## When these conflict with a task

They do not override an instruction. They override your instinct to add
something while carrying one out. If a rule here genuinely blocks the work, say
so in a sentence and ask — do not quietly build the thing.

<!-- END PINNED SECTION -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## First, in a fresh clone or worktree

```sh
bun install
```

**Nothing else in this file works until that runs, and the failure does not name
its cause.** A worktree starts with no `node_modules`, so `bun run typecheck`
and `bunx depcruise src tests --output-type err` — two of the three gates — fail
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
- **Git hooks, which have to be turned on: `bun run dev:install-hooks`.** Hooks
  are not cloned and `core.hooksPath` is per-repository config, so a fresh clone
  or worktree has none and says nothing about it.

  There is one, `.githooks/pre-push`: it refuses a push to a branch whose pull
  request GitHub has already merged or closed. Such a push **succeeds and
  reaches nothing** — a squash merge takes the branch as it stood when the merge
  commit was cut, and `git merge-base` cannot see that, so the state comes from
  `gh`. It happened three times in two days, the third time taking a
  `CLAUDE.md` restructure and a measurement with it. The hook **refuses rather
  than passes when `gh` is missing**, because a hook that goes quiet when its
  tool is absent is the `|| true` this repo has been bitten by; every refusal
  names `git push --no-verify` and the two commands that recover the work.

  Not a reversal of `ce97456`, which removed the previous `.githooks/`: that
  hook regenerated a committed artefact inside someone else's commit, and the
  objection was to writing. This one writes nothing.

## The one rule about documents

See **State belongs in one place** in the pinned header. One consequence worth
spelling out here: other documents may write `row F` and nothing else about it.
If a reader wants its status they grep one table.

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

### Where the live counts are

**The live counts of anything countable are in the code, not here** —
`NODE_LABELS.length` and `EDGE_LABELS.length` in `src/db/domain.ts`, the tool
list in `src/mcp/tools.ts`, the scripts in `package.json`. This paragraph used
to carry those numbers and was wrong about them repeatedly.


**The domain's API as one reviewable page is `labkit://docs/tools`** — every MCP
tool, what it takes and what it returns, rendered from the tool declarations on
every read by `src/mcp/docs.ts`. It is stored nowhere, so it cannot disagree
with the tools.

**A checked-in copy existed until 2026-08-26 and is worth knowing about, because
the failure was a genre and not a file.** `docs/mcp-tools.md` was committed so
its diff would show an API change, kept honest by an assertion in
`tests/mcp.test.ts`, refreshed by a `docs:tools` script. The assertion's only
failure mode was "someone regenerated late"; catching it cost a build that had
to run on documentation, and a `docs/**` CI filter that needed a load-bearing
exception — which breaks silently the first time someone renames a file.

What settled it was what the arrangement *invited*: agents proposing a parity
document for the CLI surface, tests asserting the two agree, and a gate over all
of it. A generated file checked in beside the code it describes is an invitation
to that. Generate into the running program, not into the tree.

### The dependency graph

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
not a case for regenerating it forever. `bunx depcruise-fmt -T dot` over the
cruise JSON recovers one if a person wants it.

It is **not a gate** and never was: `bunx depcruise src tests --output-type err`
is. Generation lives in `scripts/update-dependency-graph.sh` rather than a
`package.json` one-liner because the one-liner was a pipeline, and `$?` after a
pipeline reports the last command's status — a crashed `depcruise` used to yield
an empty SVG and a success code.

### Talking to the user

**Do not use this repo's shorthand when reporting to the user.** `§5`, `bar 4`,
`D2`, "the rungs", the ledger status words and the row letters are compression
that pays between documents and costs on sight. Say *"we showed it gives a wrong
answer"*, not *"it clears §5"*. A glossary makes documents readable and does
nothing for a sentence in a reply — the user hit unexplained shorthand three
times in one session, twice after it was noticed and once in the same message
that announced the glossary.

### What the other documents are for

`docs/persistence.md` is how persistence works, and holds the dated AGE probe
findings that used to be `docs/persistence-spikes.md` — read those before
changing tenancy, natural ids or provisioning. They lived at the top of
`examples/full-lifecycle.md` until 2026-08-25, above an example nobody scrolled
far enough to reach, and in their own file until 2026-08-27.

`docs/GLOSSARY.md` is a pointer table for the shorthand this repo uses across
documents — `D2`, `§5`, `bar 4`, the rungs, the ledger status words. It defines
nothing itself; every entry names where the real definition lives, because a
second copy is a second thing to go stale. Read it if a token in a journal entry
means nothing to you; `D1`/`D2` in particular mean two unrelated things
depending on the document.

`docs/TASKS.md` is the **work queue** — actionable items only. It carries no
statuses, verdicts or counts; PJ-008 §3's index is authoritative on what the
model knows, and standing facts and gates are in this file.

### The dated records

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

### Working alongside another session

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

## Commands

```sh
bun install                    # install dependencies
bun test                       # run all tests (embedded PGlite)
bun run test:pg                # the same suite against a real Postgres + AGE container (docker/postgres)
bun run test:in-docker         # what Cloud Build runs, in the CI image, on a worker-sized machine
bun test tests/domain-graph.test.ts   # run one test file
bun test tests/scenarios/       # run the PJ-008 acceptance scenarios
bunx depcruise src tests --output-type err   # layering rules (errors) + cycles
bun run dev:dependency-cruiser  # regenerate docs/dependency-graph.mmd
bun run typecheck              # tsc --noEmit
bun run check                  # test + typecheck + depcruise + every check:* — the pre-commit sweep
bun run check:all-checks       # every check script must introduce itself in one plain sentence
bun run check:format           # biome formatting — `bun run format` writes
bun run check:lint             # biome lint — rules that are off are off by name, in biome.jsonc
bun run check:migrations       # lints drizzle/*.sql for destructive DDL
bun run check:doc-comments     # finds doc comments detached from what they document
bun run check:tests-assert     # finds tests that assert nothing, or comparing two literals
bun run check:test-ceiling     # nothing runs the suite as a bare `bun test`
bun run check:test-teardown    # a test file that opens a scenario must also reset the database
bun run check:stdout          # nothing under src/ writes to stdout except the CLI
bun run check:no-tracked-symlinks  # fails if a symlink is tracked in git
bun run check:prop-classes     # INDEXED_PROPS must name exactly the IndexedString/Timestamp props
bun run check:no-stringly-typed  # no bare `string` in a core/read/write signature
bun run check:orm-unwrapped    # every drizzle handle is used inside unwrapped()
bun run db:generate            # drizzle-kit generate, after editing src/db/schema.ts
bun run db:generate:custom --name=<name>   # empty hand-written migration (for AGE DDL drizzle-kit can't diff)
bun run example               # examples/full-lifecycle.sh — a narrated lifecycle, for reading
bun run check:cli             # scripts/smoke-cli.sh — the same path, asserted
bun run check:binary          # builds bin/labkit and drives it against a fresh database
bun run dev                    # the CLI (src/cli/cli.ts)
bun run mcp                    # the MCP server over stdio -- `labkit mcp`, src/cli/commands/serve.ts
```

Formatting and linting are both biome — `bun run format` writes,
`check:format` and `check:lint` are in the sweep.

### Exit codes, and the script that told everyone to ignore its own

`bun test`'s exit code means what it says: **0 is a clean run, non-zero is a
failure.** It returned 99 on a passing suite until PGlite 0.5.7 (2026-08-24)
fixed the WASM teardown interaction behind it.

`bun run check:cli` (`scripts/smoke-cli.sh`) is where the lesson below was
learnt, by its predecessor. `examples/full-lifecycle.ts` exited 99 on a success,
so this file told everyone to ignore its exit code and read the output instead —
and the script had been dead since `af5a1d2` deleted the views it read back
through, dying at `relation "labkit_t1.claim" does not exist` for 221 commits.
The rule was added *the same day, after the break*, by the commit whose subject
was closing out the last verification step. Declaring the exit code meaningless
left the genuine failure with no watcher either.

**0 means it worked and nothing else does.** It asserts on the answers rather
than on whether the commands ran, it is hermetic (`--db` into a temporary
directory removed on exit), and it **drives the CLI and nothing else** — where
`full-lifecycle.ts` wrote by calling `TenantGraph.createNode` underneath the
domain layer, putting nodes on the record no verb had recorded making. It is the
only thing that runs the CLI process against a real database.

**`bun run example` is the other half of that split, and it is for reading.** It
was one script until 2026-08-25, and being both made it neither: it captured
every answer into a variable and printed `ok <label>`, so someone running
something called *example* watched fifteen assertions pass and learnt nothing
about what LabKit is or what a command prints. It now shows each command as
typed with its real output. The two are expected to diverge — the example shows
a happy path a person would follow; the check is free to assert an absence, a
bucket boundary or a refusal, which nobody wants narrated.

The general lesson, which cost more than the script did: **a rule that tells
readers to ignore a signal removes the only watcher that signal had.** If a
signal is unreliable, fix it or delete it — do not annotate it.

### Shell traps in this userland

**`\s` is not a character class in BSD `sed` or `grep`, and this userland is
BSD.** It does not error — it matches a literal `s`, so a substitution silently
does nothing. Cost a wrong measurement on 2026-08-25: a comparison meant to
prove biome had not reflowed any comment stripped no indentation, compared
indented text against indented text, and reported 38 differences that were not
there. `[[:space:]]` is the portable form. The same applies to `\d`, `\w` and
`\+`.

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

### CI

**CI runs the gates on pull requests to `main`, and nothing else runs them for
you** — there is no git hook, and a commit that is not in a PR is checked by
whoever typed it. `cloudbuild.test.yaml` runs `bun run check` and
`bun run test:pg` on Google Cloud Build; `infra/ci/` is the terraform, and its
README carries the one step terraform cannot do (connecting the repo to Cloud
Build, in the console, in the same region).

**`test:pg` is why CI exists.** `bun run check` is a command anyone can type;
`test:pg` needs a container, is excluded from the sweep deliberately, and had no
watcher at all until the trigger existed.

### The check sweep

Before committing, run **`bun run check`**: it runs `bun test`, `typecheck`,
`depcruise` and every `check:*` script, prints a table, and exits non-zero if
any of them failed. About ninety seconds, most of it `bun test`.

This paragraph used to be a list of conditionals — *add `check:migrations` if
you touched `drizzle/`, `check:tests-assert` if you touched tests, …* — which
is a rule held in a person's head and therefore the kind that gets skipped.
`bun run check` derives its list from `package.json`, so a `check:*` added
later is picked up without anyone editing anything.

**`check:` means green is fine and red is yours to fix.** Anything that does
not mean that needs a different prefix. There is currently no such script —
`probe:pglite-concurrency` was the one, and it went with the socket whose bug it
asked about — so the rule is standing guidance rather than a live example.

**An exclusion list is a tell.** That probe sat under `check:` and the first
version of `check-all.ts` excluded it by name, with a paragraph explaining why.
The paragraph was the signal: the script was fine and the *name* was wrong.
Renaming it out of the namespace deleted the exclusion rather than documenting
it. When a derived list needs a hand-written exception, check whether the thing
being excepted is misnamed before writing the exception down.

**The sweep does not run everything, and the one absence has a reason.**
`bun run example` is for reading rather than checking. It was two until the
concurrency probe was deleted; a second omission needs its own reason rather
than joining a habit.

**A check announces `OK:` or `FAILED:` and does not repeat its own name** —
`bun run check` already said which one is running. `FAILED:` means the check ran
and the codebase is wrong; an `ERROR:` would mean the check itself broke, which
is a different thing and none of them currently distinguish. Plain words, not
emoji, because they are what you grep for; the emoji summary is `check-all`'s.

**A check script introduces itself in one plain sentence**, and `bun run check`
prints that sentence before running it — so a reader looking at a failure from
a script they have never opened is told what it checks rather than
`check:prop-classes`. `check:all-checks` enforces the shape:

```
#!/usr/bin/env bun                 #!/usr/bin/env bash
/**                                # One sentence: what this checks.
 * One sentence: what this checks. #
 *                                 # Then the prose: why it exists.
 * Then the prose: why it exists.
 */
```

Shell has no block opener, so its sentence is a line higher. That is why
`check-all.ts` calls `summaryOf()` rather than printing a fixed line number —
the two of us picked "line 4" and then "line 2" while designing this, and both
were wrong for one of the two languages.

Do not pipe `bun test` — that trap is above, and is still live. `bun run check`
passes each step's output straight through for the same reason.

### Formatting and linting

**Formatting and linting are biome** (`biome.jsonc`). `bun run format` writes;
`check:format` and `check:lint` are both in the sweep.

**Two rules are off, by name and with their reason in the config**, which is the
form to follow if a third is ever needed — a blanket `"recommended": false` or a
wall of `biome-ignore` comments loses the difference between a finding to act on
and a rule that disagrees with a deliberate choice.

`noNonNullAssertion` is off **because its autofix breaks the build**:
`tsconfig.json` runs `noUncheckedIndexedAccess`, so `rows[0]` is `T | undefined`
and `rows[0]!` after a proven-non-empty check is the idiom the compiler asks
for. Running biome's own unsafe fix over the 148 of them produced `TS2322`s
immediately. That was the discriminator, and it is a good one: **if a lint
rule's fix contradicts the typechecker, the rule is wrong for the project, not
the code.**

`noExplicitAny` is off for two sites in `src/db/backend.ts`, both `catch (err:
any)` around the lockfile so `err.code` can be read. A caught value is `unknown`
and `Error` has no `code`, so the alternative is a cast at every use.

Two things learnt adopting it, both the hard way:

- **The config file must be `biome.jsonc`.** `biome.json` rejects comments, and
  `biome format --write` then falls back to its defaults **silently** — no parse
  error, just "Formatted N files". It re-indented 121 files to tabs at width 80
  before anyone noticed. `biome check` does report the parse error; the writing
  command does not.
- **Comments are re-indented and never reflowed.** Verified rather than assumed:
  formatting the whole repo changed 108 files and **zero** comment-text lines,
  compared with leading whitespace stripped. That matters more here than in most
  repos, because the comments are argued paragraphs.

And one thing it broke, worth knowing before writing another test that reads
source text: **a formatter can split a call across lines.** Biome turned
`write.pursue({…})` into `write` newline `.pursue({…})` in five tools, and
`tests/helpers/surface-coverage.ts`'s `\bwrite\.pursue\s*\(` stopped
matching — five verbs reported unreachable that were reached fine.

**That helper reads the AST now, not the text.** Two `check:*` scripts already
did (`check-no-stringly-typed.ts`, `check-prop-classes.ts`) and this one had
argued its way to *"the declaration is the only place the distinction survives"*
while implementing it with a regex. `publicVerbsOf` walks method declarations
and reads `private`/`protected` off the modifiers; `verbsCalledOn` matches the
call as a node, so line breaks and chaining are invisible. Derived lists came
out identical — 17 reads, 18 writes, nothing gained or lost — which is the point:
it is the same claim, made in a way a formatter cannot break. Comment-stripping
at the call sites went with it, an AST having no comments in it.

The other text-reading checks were surveyed and left alone deliberately.
`check-all-checks` reads the first four lines, which is inherently textual;
`check-doc-comments` is about comments, which are trivia the AST drops;
`check-tests-assert` and `check-test-teardown` match plain substrings
(`expect(`, `openScenario(`) that a line break cannot separate. The rule is not
*use the compiler everywhere* — it is **a pattern spanning a token boundary
needs a parser**.

## Surfaces

What LabKit *is*, from the outside: one binary, two adapters over one domain.
These lived under `## Commands` until 2026-08-27, which put the `$bunfs` asset
handover and the CLI's composition root under a heading promising a list of
things to type. A section whose subsections are named for a binary leak is not
a commands section.

### The binary, and the 1.9GB it leaked

`bun run build` compiles `src/cli/cli.ts` to a binary **from a scratch
directory** (`scripts/build-binary.sh`), and that is not tidiness:
`bun build --compile` leaves a **byte-identical copy of the `bun` binary
itself** — 61MB, `.<hash>-00000000.bun-build` — in the current working
directory on every *successful* run, and never removes it. Verified by sha256
against bun 1.3.14. The hash differs per build so they accumulate, and they are
`.gitignore`d so nothing complains; thirty-two of them had reached **1.9GB** in
the repo root before anyone read a directory listing. The staging path follows
the **CWD, not `--outfile`** — measured — so building from a `mktemp -d` that is
removed on exit leaves the leak nowhere to go. There is no flag for it.

That is also why `build` is a script rather than the `package.json` one-liner it
was, the same reason `dev:dependency-cruiser` is one.

**`bun run check:binary` proves the binary works** — it builds and drives the binary
against a database that does not exist yet, which is the case that was broken.

It was broken from the day the build script existed, in **three places, each
hidden behind the last**: drizzle's migration folder, the two PGlite extension
tarballs, and PGlite's own `pglite.data`. One root cause —
**`import.meta.url` does not name a directory on disk once the code is inside a
`bun build --compile` bundle**; it is `/$bunfs/root/…`, and nothing put a file
there. Every one was invisible to `bun test` and `bun run dev`, which read those
files off the real filesystem and work.

The fix is to hand the assets over rather than let them be located
(`src/db/migrations.ts`, `src/db/extensions.ts`) — Bun embeds a file imported
`with { type: "file" }`, and `node:fs` can read it back out of `$bunfs`.

**One asset could not stay embedded, and the reason is worth knowing before
trying again**: PGlite reads an extension bundle with `createReadStream` piped
through `zlib`, and `$bunfs` does not implement streaming. `existsSync` returns
true and `open` then fails `ENOENT` — a confusing pair. Those two tarballs are
written once to a temp file; everything else is read in place.

**Known upstream and unfixed**, so this is not a local oddity and there is no
version to wait for: [pglite#414](https://github.com/electric-sql/pglite/issues/414)
and [bun#15032](https://github.com/oven-sh/bun/issues/15032) are the same
`ENOENT … /$bunfs/root/pglite.data`, open since Bun 1.1.33. The asset handover
is PGlite's own documented answer for restricted environments
([bundler support](https://pglite.dev/docs/bundler-support)); the extension
tarballs are not covered there and are the part with no prior art.

**Drizzle's documented advice does not fix this**, and that was measured rather
than assumed. Its docs say to copy `drizzle/` alongside the build output — which
is right for a `dist` deployment run by Node, and insufficient here: a binary
built that way finds the folder and then dies on `pglite.data`, because two of
the three bugs are PGlite's, not drizzle's.

The general lesson, which cost three rounds of build-and-run: **each fix moved
the failure one step later rather than removing it**, and the only way to find
the next was to run the binary again. Nothing had ever run it.

### The CLI

`src/index.ts` is still a stub; **`src/cli/cli.ts` is not** — it is the full
surface, reads *and* writes (`bun run dev`). It is a composition root and
nothing else: `program.ts` assembles the commands, `commands/` declares them,
`args.ts` turns text into domain values on zod, `views/` turns reports into
pages, `session.ts` is the wrap that hands a command its surfaces, and
`commands/serve.ts` registers `labkit mcp`. That last one is **not** registered
through `runner()` and does not go through `session.ts`, which is the reason it
has its own file: `runner()` opens a database, resolves a tenant, does one unit
of work, prints a report and closes — the shape of a command that answers and
exits. The server acquires and releases per *tool call*, for as long as an
agent's session lasts, and prints nothing a person reads. It
replaced a 1435-line `src/cli.ts` whose `switch` was five hundred of them; the
port was verified by running `examples/full-lifecycle.sh` against both and
diffing the transcripts, which were byte-identical.

#### It is not read-only, and never shipped that way

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
`tests/cli/coverage.test.ts` from `src/domain/read.ts` and `src/domain/write.ts` the way
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

#### Colour is a parameter, not a global

**Colour is a `Palette` a view is handed, never a module-level global**
(`src/cli/palette.ts`). Members are named for the record's distinctions —
`settled`, `contested`, `untested`, `provisional`, `handle`, `heading`, `quiet`
— so a view says `p.contested(state)` and the colour choice lives in one file.
`PLAIN` is the identity function, so a plain run and a coloured one differ by
escape sequences and never by which branch rendered the page.

It is a parameter because of what a global would cost: `bun test`'s stdout is
not a terminal, so every fixture in `tests/cli/views.test.ts` would silently
check the uncoloured path and nothing would check the other. They now render
both and assert `stripped(coloured) === plain`.

**A handle-only answer is never coloured, even in a terminal.** The whole of a
write command's stdout is an id the next command consumes. Colouring it made
`$(labkit criterion 'x')` capture an id wrapped in escape sequences under
`FORCE_COLOR=1` — measured, not predicted — turning a documented contract into
something conditional on an environment variable. A report gets colour because a
person reads it; a handle does not, because a shell does.

Two more things the tests caught rather than review:

- **Pad before colouring, and pick the colour from the unpadded value.** An
  escape sequence has length, so padding a coloured string pads bytes nobody can
  see. The first version padded first and then matched on the padded string, so
  `"failed             "` matched no case and every gate state came out the same
  colour.
- picocolors was chosen **by measurement**: under Bun 1.3.14, `node:util`'s
  `styleText` writes escapes into a pipe and ignores `NO_COLOR` entirely, and
  `ansis` writes escapes into a pipe with no environment variables set at all.
  Either would have broken `$(labkit …)`. `--no-ansi` only ever subtracts, and
  picocolors' own `isColorSupported` is reused rather than reimplemented.

### Where the database lives

**`--db <dir>` and `LABKIT_HOME`** name the directory holding `.labkit/` —
the project root by another route. A temporary directory gets its own database
file *and* its own lock, sharing nothing with a working database, which is what
makes `examples/full-lifecycle.sh` and `scripts/smoke-cli.sh` hermetic. It used
to get its own TCP port too, from a `derivePort` that hashed the path; there is
no port any more. `LABKIT_DB_URL` still wins over both.

**With neither set, an existing `.labkit/` at or above the working directory is
found** (`resolveProjectRoot`, `src/db/connect.ts`). A client launched from
`packages/foo` used to report an empty record for a project full of work, which
matters more since one binary: an MCP client's working directory is chosen by
the editor, not the user. The walk **only ever finds, never decides where to
create** — with nothing above, the answer is the working directory exactly as
before, which is what keeps it from reintroducing the implicitness three review
rounds removed.

**`LABKIT_HOME` naming a directory that does not exist is refused.** It used to
be created, because the lock directory was made with `{ recursive: true }` — so
a typo built the whole path and yielded a fresh empty database, which reads
exactly like a project nobody has worked on. Naming a directory is a claim that
it is there. `tests/project-root.test.ts` holds both rules.

### The MCP server

**`src/mcp/server.ts` reads *and writes***, and is started by `labkit mcp`
(`bun run mcp`) — one binary since PR #35, so the entry point is
`src/cli/commands/serve.ts` and the server is a subcommand rather than a second
executable. Two 77MB binaries shipping together came to ~154MB for two copies of
one runtime. It was read-only for
one batch of work and that is not a design position: a record nothing can write
to has nothing in it. Read and write handlers are handed different surfaces, so
neither can reach the other's verbs, and
`tests/mcp.test.ts` asserts every public verb on either surface is exposed or
listed in `NOT_EXPOSED` with a reason. **`labkit://docs/tools` is the tool list**;
this paragraph deliberately does not count them.

## Persistence

**`docs/persistence.md` is the whole of it** — the two halves and why they are
two, the `src/db/` module table, `TenantGraph`, the connection and backend
layering, row-level security, tenant provisioning, migrations, and the dated
AGE probe findings. About a fifth of this file moved there on 2026-08-27,
unchanged.

Three rules from it that are worth having before you open it, because breaking
them is easy and the failure is quiet:

- **All graph access goes through `TenantGraph`** (`src/db/graph.ts`). There is
  deliberately no raw-string escape hatch; if a query needs a shape the
  decoders do not cover, add a decoder to `src/db/cypher.ts`.
- **A session is assembled in one order and it is not negotiable:**
  `connect → bootstrapSession → migrate → resolveTenantContext → scopeToTenant
  → domain`.
- **Every compound domain verb runs inside a transaction**, so an event commits
  with the writes it describes.

The AGE gotchas stay below, because those are needed before writing a query
rather than looked up afterwards.

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

### The execution-context seam

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

### The two layering rules

Two layering rules are enforced as `dependency-cruiser` **errors**, not
conventions — `bunx depcruise src tests --output-type err`:

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

#### Earning an edge after implementing it

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

#### Handles, and which record an answer is about

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

#### What a verb returns

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

#### Why unwalked labels and edges stay

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

### One PGlite for the whole suite

`tests/helpers/db.ts`'s `setupTestDb()` boots **one `PGlite` instance for the
whole suite**, on first use, and hands application code a `LabKitDB` over it.
Application-code test files (`tests/domain-graph.test.ts`, `tests/agtype.test.ts`)
never import `@electric-sql/pglite`/`pglite-age` themselves — they only see the
seam, the same one production talks through.

**`openClient()` is a labelled view onto that one session, not a connection,
and its `close()` is a no-op.** It used to open a fresh `pg.Client` per test to
contain a confirmed upstream `pglite-socket` concurrency bug
([electric-sql/pglite#1046](https://github.com/electric-sql/pglite/issues/1046),
PJ-006), where two connections racing could permanently desync one of them. The
bug **is** the socket, and there is no socket. The bookkeeping stayed so the harness reads as it did. Two consequences:
session state (`search_path`, `SET ROLE`, any GUC) is shared between tests, and
nothing here can prove state survives a *reconnect* — which it never could.

The justification inverted rather than weakened, which is the part worth
holding on to: the old rule's stated reason was fidelity to production, and
production now opens PGlite directly, so sharing the instance is the *more*
faithful arrangement.

### Running the suite the way CI does

**`bun run test:in-docker` runs what CI runs, here.** Same image, same steps as
`cloudbuild.test.yaml`, with `--cpus`/`--memory` defaulted to a Cloud Build
worker's shape (2/8g) because the resource limit is the point — this machine has
ten cores and the suite is timing sensitive. `LABKIT_CI_CPUS=1` squeezes harder.
It tests a `git clone` with the working tree copied over it, so uncommitted
changes are included *and* the container gets a real `.git`, which a bind mount
of a git **worktree** cannot give it — the `.git` file there names a host path.

**It did not reproduce the failure that prompted it**, which is worth knowing
before trusting it. The hook timeout that reddened the first CI build was green
here at 2 cpus and at 1, with Postgres running alongside as CI does. What it
closes is the *environment* half of "works on my machine" — image, dependencies,
git, the Postgres wiring. The *speed* half it only approximates: a shared-core
`e2` throttled to a sustained baseline is not a full local core under quota.

### Against a real Postgres

**`bun run test:pg` runs the same suite against a real Postgres**
(`docker-compose.yml`'s `apache/age:release_PG18_1.7.0`) by setting
`LABKIT_DB_URL` — the same variable production reads. It is `test:` and not
`check:` on purpose: `bun run check` derives its list from the `check:` prefix
and must not need docker. **Nothing runs it for you.**

It is not decoration. It is the only backend on which **two connections can be
live at once**, so anything about isolation, a session-scoped role or tenant, or
advisory locking under contention can only be *demonstrated* there. It is also a
disagreeing measurement — a `pg.Client` and a raw PGlite do not decode
identically, and a suite that only sees one of them cannot notice.

First run, 2026-08-26: **360 pass, 4 skip, 0 fail, 56s**, against 364/0/52s on
PGlite. The four skips are `tests/connection-lock.test.ts`, whose subject is the
PGlite lockfile that a real Postgres does not have. `tests/mcp-stdio.test.ts`
strips `LABKIT_DB_URL` from the servers it spawns, because it gives each one a
private directory and that variable wins over one.

### Resetting between tests

`reset()` **truncates every table outside four system schemas**, so it must only
ever point at a throwaway database. The default is one called **`labkit_tests`**,
created by the script if absent — not `postgres`, which every tool defaults to
and where a truncate would eat whatever a developer had been poking at, and not
`labkit`, which is the name a real deployment would pick and therefore the one a
destructive run must not reach by default. An explicit `LABKIT_DB_URL` is
honoured verbatim; a caller who named a database has made that decision.

A test that needs to exercise "a query loses a race and hits a constraint
violation" should do it deterministically — mock the DB layer to inject the
error at the right point (see `domain-graph.test.ts`'s `createEdge treats a
23505 from the CREATE step as success` test) — not via `Promise.all()`
against two live connections, which this deployment cannot reach at all.

`afterEach` drops every AGE graph and truncates every remaining table
outside `pg_catalog`/`information_schema`/`ag_catalog`/`drizzle` with
`RESTART IDENTITY CASCADE`, via a dedicated admin connection kept open for
the whole file. This resets `tenants.id` every test but deliberately does
*not* reset the natural-id sequences (`drizzle/0002_natural_ids.sql`) —
those are standalone `SEQUENCE`s, and natural ids are scoped globally per
entity-type (PJ-004 decision #3), not per-tenant or per-test. Don't assert
a specific natural-id value across more than one test in the same file for
this reason — assert on the prefix/shape instead.

### The lockfile tests

`tests/connection-lock.test.ts` covers the lockfile: it is taken and handed
back, a live holder is waited for and then let through, a *stale* one (a dead
PID) is reclaimed, and a refusal names the lock path and the holder. It
replaced `tests/leader-election.test.ts`, which raced three concurrent
`connectDb()` calls to prove the election worked and was **the suite's
flakiest file** — flaky precisely because it proved a concurrency property by
running a real race. Each claim is now reached deterministically. Its tests
open real `dataDir`s and so carry explicit 30s timeouts; bun's 5000ms default
is not generous enough for a test whose subject is a database starting up.

### The flakiness, and what it turned out not to be

**The suite's *other* flakiness is not that bug, and attributing it there cost
two investigations.** Intermittent `graph "labkit_t1" does not exist` and
`Connection terminated unexpectedly` bursts look like the socket defect and are
not: a test's legitimate work crosses bun's fixed **5000ms** ceiling, bun's
timeout **does not cancel the test body**, and the abandoned test's late
`scenario.end()` then resets the database and closes the *next* test's
connection. Nothing hangs — 59,086 queries were tracked across a failing run
with zero unfinished.

#### What the cost actually is

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
individual tests reach ~380, which is the band that straddled 5000ms once
per-round-trip latency degraded under load — and that threshold effect, not one
broken test, is why 7-15 *different* tests failed each run. Those figures are of
2026-08-24 and describe the suite as it was; see the re-measurement below for
what it does now.

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

#### The ceiling, and the two callers that ignored it

**The ceiling is now 20000ms and chosen, not bun's 5000ms default** (`--timeout`
on the `test` script, added 2026-08-26).

**`bun test` does not read that; `bun run test` does.** A bare `bun test`
bypasses `package.json`, so it runs at bun's default — and so did
`bun run check`, whose sweep invoked `["bun", "test"]` while every other step
went through `bun run`. The flag was added, CI went on failing at 5000ms, and
the log showed a ceiling the repo believed it had raised. `check-all.ts` routes
through the script now, so one place says what the test step is.

**It then happened a second time, in the other caller.** With the sweep fixed
the build got further and failed in `scripts/test-postgres.sh`, which also ran
`bun test` directly. Fixing callers one at a time is what produced the second
failure, so `check:test-ceiling` now refuses either spelling — the shell
`bun test` and the `["bun", "test"]` argv array that caused the original. Its
first version caught only the shell one, which would not have caught the bug it
was written for; both are in its negative control.

**`bunfig.toml` is not the way out.** Measured against bun 1.3.14, `[test]
timeout = 20000` is ignored — a 6.5s `beforeAll` fails identically with and
without it. If a later bun honours it, move the ceiling there and delete the
check. It went up because CI found the edge:
a `beforeAll` calling `openScenario()` timed out at 5807ms on a Cloud Build
worker, and the cascade — `scenario` never assigned, `afterAll` throwing
`undefined is not an object` — reported as two failures. Booting WASM in a hook
is legitimate work, and 5000ms was a number nobody here picked.

Two things this does not change. **`--timeout` covers hooks** — verified with a
6.5s `beforeAll`, which fails at the default and passes at 20000 — so the
margin-measuring method below still works, just from a higher start. And bun
says *"a beforeEach/afterEach hook timed out"* even when the hook is a
`beforeAll`, which is worth knowing before hunting for a `beforeEach` that does
not exist.

#### It stopped, and nobody knows which change did it

**It stopped happening, and the honest version is that nobody knows which
change did it.** Re-measured 2026-08-25 by the method below — five full runs
under saturated CPU on a 10-core machine — **0 failures in all five**, 352 tests,
128-147s each. Against a documented 7-15 per run, that is not noise.

What the margin actually is, same load, ceiling lowered deliberately:

| ceiling | failures |
| --- | --- |
| 500ms | 41 |
| 1000ms | 103 |
| 2000ms | 2 |
| 3000ms | 1 |
| **5000ms** (bun's default) | **0, five times** |

So roughly **2.5× headroom**, not infinite. One test still crosses at 3000ms.
A slower machine, or a few more query-heavy tests, would put it back — this is
a suite that now fits, not a mechanism that was removed. (The 500-vs-1000
inversion is the cascade being chaotic at absurd settings, not a measurement
error; do not read a trend into it.)

**Three changes were each measured against this and none moved it at the time.**
2026-08-24, twelve runs each, ABBA-interleaved under the same load: cutting
query counts ~30%, moving setup off the per-test clock, and booting one PGlite
instead of 44. All three bought wall time — 5%, 7% and **40%** — and left the
failure median where it was. The suite is now far faster than when any of them
was measured alone, and PGlite 0.5.7 landed the same day; which of those closed
it is not established and would need a bisect nobody has run. **Do not write
down a cause for this.**

**Before profiling, ask what the profiler cannot see.** `LABKIT_TRACE`
instruments the `LabKitDB` seam and therefore cannot observe anything before a
connection exists. WASM boot was 44-110s of a ~200s suite and invisible to it,
so three rounds of hypotheses were all downstream of the largest cost.

#### How to measure it again

**The method, kept because the next re-measurement needs it.** Saturate
`sysctl -n hw.ncpu` cores with busy loops, run `bun test` redirected to a file,
kill the loops, count `^\(fail\)` lines. A clean machine passes on every arm —
run-to-run wall time varied **4× on identical code** when idle, so induced load
*reduces* variance rather than adding it, and a green run on a quiet laptop is
not evidence of anything. To measure the margin rather than the rate, lower
`--timeout` instead of adding load. Do not use `grep -c … || echo 0`: grep
prints `0` **and** exits 1, so the field doubles.

**Refuted with evidence, so nobody re-investigates from scratch:** advisory-lock
contention; the pglite-socket desync bug as primary mechanism; fd/socket
exhaustion; WASM heap growth; `afterAll` not awaited; bun's runner; provisioning
cost; query count per test. Session-log entries 022, 024, 026 and 028 carry the
numbers.
