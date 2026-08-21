# 004: config cruft cleared, the consumer probe run, session.ts split, rows Z and F probed

**Session wrap, 2026-08-20 to 2026-08-21, on `feat/domain-consumer`.** Not a decision record —
see `docs/project-journal/023_capture_cheaply_promote_before_citing.md` for why
a consumer is the next probe, and `docs/consumer-contract/001_design_brief.md`
for the protocol itself. First entry written from the `labkit-domain-consumer`
worktree.

## Goal

Clear "the old js .json config hell cruft" and the dead allow-install entries,
then draft the brief for the cold-context designers PJ-023 called for — and act
on the external review of that brief. The session then ran the whole exercise,
split `session.ts`, closed row Z, and probed row F.

## Changed

Forty-seven commits, range clean apart from `8299ecb` and `3b769c0` (dependency
graph regenerations, committed by the user) — no other session's work in it.

```
 .gitignore                                   |    6 +
 bun.lock                                     |  226 +-
 docs/consumer-contract/001_design_brief.md   |  236 +
 docs/consumer-contract/002_stage_a_packet.md |   93 +
 docs/consumer-contract/003_stage_b_packet.md |   77 +
 docs/consumer-contract/010_stage_a_claude.md |  824 +
 docs/consumer-contract/011_stage_a_gpt.md    | 1026 +
 docs/consumer-contract/012_stage_a_grok.md   | 1248 +
 docs/consumer-contract/020_synthesis_blinded.md |  447 +
 docs/consumer-contract/021_mapping_and_scoring.md |  150 +
 docs/consumer-contract/013,014,015_stage_b_*.md |  ~900 +
 docs/consumer-contract/022_stage_b_analysis.md |  113 +
 docs/consumer-contract/023_post_review_standing.md |  150 +
 docs/consumer-contract/prompts/*.md          |  110 +
 docs/consumer-contract/024_vertical_slice_results.md | 130 +
 tests/consumer/vertical_slice.test.ts        |  230 +
 .dependency-cruiser.cjs                      |   12 +
 docs/session-log/004_*.md                    |  113 +
 package-lock.json                            | 3188 -------------------
 package.json                                 |    5 -
```

**Config hygiene** (`9109790`, `1631f3c`). Deleted `package-lock.json` (3,188
tracked lines) and ignored it; re-locked drizzle-kit to 0.30.6; removed the whole
`allowScripts` block.

*One `npm install` explains all of it.* Someone bumped `package.json` to
`^0.30.6` and ran **npm** — updating `package-lock.json` and adding
`allowScripts` entries for the tree npm resolved — and never ran `bun install`.
So `bun.lock` stayed at 0.18.1 (violating `package.json`'s own range), the
`es5-ext@0.10.64` entry went stale, and the block described a tree bun had never
built. Not three oversights, one install with the wrong tool. `allowScripts`
turned out **wholly** dead, not one line stale: it is `@lavamoat/allow-scripts`'
field and lavamoat is not installed; bun's equivalent is `trustedDependencies`
(`node_modules/bun-types/bun.d.ts:9402`), never used here.

Nothing else at the root was cruft, checked rather than assumed:
`docker-compose.yml` is live (the real-AGE reference platform for the
postgres-age skill and `examples/full-lifecycle.md`), `.dependency-cruiser.cjs`
and `drizzle.config.ts` back their scripts, `drizzle/meta/*.json` is
drizzle-kit's journal, and all four `scripts/` targets exist.

**Consumer-contract protocol** (`d54e920` then `4ed03ef`). Revision 1 went to
external review before running and was rebuilt. Four pre-run defects, recorded
in the brief rather than quietly fixed:

1. The reading bar was **circular** — the probe finds what the model cannot
   express, under a rule saying inability to express earns nothing. Now three
   bars: an unavailable answer earns a *candidate*; a paired-world test promotes
   it to evidence when two states the contract must distinguish are identical in
   durable state; survivors meet the unchanged change bar.
2. The withholding line **leaked more than admitted**. Revision 1 called PJ-008
   §1 "researcher language, written before any model existed" — false. Verified:
   story 9's gloss names `Artefact`/`Evidence`/`Question`/`Decision` and
   `RecoveredArtefact`, story 12's argues Evidence and Claim are separate, and
   §1's closing "The shape these describe" is a process diagram in the
   ontology's own terms (that third one the review missed; checking found it).
   The **bold sentences alone are clean — zero backticked terms across all
   eighteen**, which is what Stage A now uses.
3. The instrument was **lexical and disclosed**. Now an undifferentiated
   glossary of every concept, supplied or introduced, whose load-bearing field
   is what two situations become indistinguishable without it.
4. Predictions **bundled interpretation**, rested on contaminated input, or were
   unfalsifiable. Now a preregistered H1/H0 with the rest demoted to secondary,
   each with an explicit falsifier.

Also added: the two-stage reveal (`002` Stage A, `003` Stage B), which is what
makes the second measurement possible — which concepts came from researchers'
words versus only after LabKit's design vocabulary was supplied. Panel claim
softened from independence to triangulation; scope corrected to precursor, not
the consumer PJ-023 asked for.

**Packet leak fixes** (`b27f82d`). Two found while assembling what designers
actually receive, both the shape the review had been finding. The packet's
preamble explains which glosses were stripped *by naming them*, so designers now
get only the material below the horizontal rule. And "do not design a database
or a graph API" told them the store is a graph; reworded to "storage or query
interface". Audited what is sent: zero backticked terms, no entity names, no
graph or query vocabulary, 73 lines.

**Stage A run and frozen** (`d7ab111`). Three designers, three model families,
in parallel, all exit 0 — `anthropic/claude-opus-5` (824 lines),
`openai-codex/gpt-5.6-sol` (1026), `xai-oauth/grok-4.6` (1248). Committed
**before any was read**: reading one first colours the next two, and cross-
reading is supposed to happen against fixed text. Each file carries a provenance
header above a rule; everything below is unedited stdout.

**Synthesis and mapping** (`5c2cf1f`, `022d362`). A fourth cold process
clustered the three designs semantically, blinded to model identity and given no
brief, no predictions, no ontology and no statement of purpose. Then this session
mapped its clusters onto the domain and ran the paired-world tests — the step
that needs someone who knows the model, deliberately separated from the step that
does not.

**H1 survives** — on three after review, not the four claimed at the time:
attribution (all three designers, distributed across four unanimous clusters
rather than forming one — row S); ordering of belief over time (all three, three
different vocabularies — row Z); and what a reconstruction was reconstructing
(D2, row F, in almost PJ-021's own words by someone who had never heard of row
F). Bitemporality was demoted by the contract-necessity bar.

Predictions: **2 held, 2 refuted, 1 half**. The useful failure is the prioritised
worklist — predicted at least one designer would ask, and all three independently
*forbade* it, reaching S-14's decision unprompted.

**Stage B run and analysed** (`b0547e2`, `850ad4c`). Each designer got its own
Stage A design back plus PJ-001's constraints — reconstruction was needed because
`--no-session` leaves fresh processes with no memory. Protocol vocabulary was
stripped first: the packet's heading read "The Stage B question", which tells a
designer it is in a staged experiment and invites a performed revision.

**The ablation demonstrably works.** Designer 3 had no concept of a *decision*
until Stage B supplied one — *"Adds Decision. Does not split Claim"*, caused by
one sentence of PJ-001. `Decision` is among the load-bearing thirteen; a cold
designer never reached for it from eighteen researcher statements. That is both
the proof the split measures something and a caution about how much of PJ-001's
should/should-not list is ontology in behavioural clothing.

**No new bar-2 candidate.** All four from `021` arose at Stage A, uncontaminated.
One new candidate at the query-semantics tier: D2's requirement that an absent
dependency path never be reported as independence — row I applied to propagation,
and the third catch on `whatDependsOn()`.

**Second external review, acted on** (`9bc584c`). Four corrections, two of them
defects in documents committed earlier the same day; both verified against the
files before being accepted.

- **A preregistered protocol deviation, unnamed until now.** The brief says
  synthesise across all six documents after Stage B; what ran was a
  three-document synthesis with the mapping *before* Stage B. The realised design
  is arguably better — it freezes the uncontaminated Stage-A reading before the
  ontology-heavy material arrives — but a deviation that turns out well is still
  a deviation. Document roles now fixed; no combined synthesis later.
- **`022`'s headline withdrawn.** It scored a *noun* — "D3 had no concept of a
  decision" — when D3's Stage A output already had every decision act and lacked
  only the word. That is the instrument revision 2 abandoned, committed inside
  the document analysing an experiment rebuilt to avoid it. Kept verbatim under a
  superseded note; telemetry promoted in its place.
- **A fourth bar**, contract necessity, between representation and change.
  Bitemporality fails it and is demoted to candidate extension. **H1 survives on
  three**, not four.
- **D2's dependency finding split in two**: open-world traversal is query
  semantics; certified completeness is preserved as a discriminator, not built.

**Prompts preserved** (`19be601`). The outputs were committed verbatim and
verified byte-identical to raw stdout — all seven. The *inputs* were not: the
assembled prompts lived only in a session-scoped scratchpad and would have died
with the session. A frozen output whose prompt nobody can reconstruct is not a
reproducible result. Kept as a recipe plus SHA-256 hashes rather than five files,
since three are 60–164KB and ~97% material already committed here; the two
irreducible pieces (the Stage B wrapper and the synthesis instruction) are there
in full.

**The vertical slice** (`d045492`) — the first code this session, and the first
thing to test the consumer claims against running software rather than prose.
Four probes in `tests/consumer/vertical_slice.test.ts`, each building **two
durable research worlds** through research verbs alone and then asking the public
read surface. Probe 1 (orientation) passes — the control, and it had to, since a
gap-hunter that finds only gaps is measuring its own construction. Probes 2, 3
and 4 establish gaps at rows **Z**, **F** and **S**.

**Reviewed by `labkit-review` before pushing, and corrected in `7b9689a`.** One
wrong claim and two weak probes, all four findings accepted, the two empirical
ones verified rather than taken:

- **Two bars were conflated.** The draft claimed a paired world was "the way
  past" PJ-011 §5. It is not — every read these probes call returns a *correct*
  answer in both worlds. They clear `023`'s **bar 4**; **none clears §5**. That
  matters: CLAUDE.md permits at most one confirmed wrong answer green at a time
  and requires clearing it next, so three §5 failures deferred together would
  have been a rule violation written into the entry the rule keys off.
- **The natural-id channel.** The draft said the record could not say which
  history produced it — **false**. `whatIsKnown()` returns
  `QuestionStanding { question, asks }`; sorting by the id recovers both orders
  exactly (`Q_1,Q_2` versus `Q_3,Q_4`), and the draft discarded that field. The
  accurate claim is that no *modelled* read exposes it. A fourth cheat channel,
  now demonstrated rather than depended on.
- **Probes 2 and 3 detected nothing.** Both would have stayed green after their
  defects were fixed. Now verified by injection — `as_of`,
  `reconstructionTarget` and `decidedBy` added to running code one at a time,
  each failing its probe, `session.ts` restored byte-identical each time.
- **Probe 3 was also incoherent**: both worlds shared a `contentHash`, but under
  S-9 that field *is* artefact identity, so world A was a successful
  reproduction rather than a distinct artefact — and the tautology was the exact
  shape PJ-021 deleted a row F boundary test over. Rewritten as a single-world
  fact about the write surface.

Probe 4 keeps its ranking — inexpressible-on-write is more severe than
unreadable — but the pairing is demoted to illustration; the severity is a
single-world fact. Probe 1 is restated affirmatively: it proves the harness *can*
return unequal answers, without which the other three equalities would be
uninterpretable.

Two anti-fake measures. `tests/consumer/` may not import `src/db` — a new
dependency-cruiser **error**, verified by making it fire and then restoring,
because a probe with graph access could report a distinction no consumer could
ever make. And the clock is fixed: a read that separates two worlds only because
wall-clock time moved has distinguished the test runs, not the research states.

**Nothing in the domain model changed.** No rung of the change bar climbed.

**One more correction, recorded on the reviewer's own suggestion** (`95bd263`).
The reviewer who proposed the detector test reached its finding by *reading* the
probes and said not re-running the suite did not matter. It did: *"these would
stay green after a fix"* is a claim about what running code does, and became a
fact only when the three fields were injected and the three failures observed.
Until then it had the property it was convicting the probes of. Placed beside the
injection table in `024`, not here — the session log is disposable and this
explains why the table exists.

Two shapes, kept apart deliberately rather than tallied as one:

- **a silent negative read as a fact about the world** — a tool returning empty
  and the emptiness taken as evidence. Three instances today: the camelCase
  `RETURN` column, a single-line grep for a wrapped blockquote, and nine passing
  hook tests around a condition that did not exist;
- **an argument presented as a demonstration** — one instance, and the only one
  where the instrument caught the person holding it. This is the failure the
  vertical slice exists to detect, which is why lumping them would have buried
  the interesting part.

**`session.ts` split on the read/write seam** (`bc2db7b`) — the last work of the
session, and behaviour-preserving: **no test changed**.

```
core.ts      306   graph, clock, sink, nine shared helpers
write.ts    1314   18 verbs + 15 write-only helpers, and emit
read.ts     1406   14 verbs + 5 read-only helpers
session.ts    79   facade -- 32 delegating one-liners, no logic
```

Cut on a seam the domain already asserts rather than on size. Three things the
measurement changed:

- **Nine core helpers, not five.** Transitive closure through the five
  direct-shared ones pulled in `findingFor`, `enquiriesClaiming`,
  `enquiryAddressedBy` and `withdrawalOf` — the last of which a regex pass had
  called read-only.
- **`emit` sits on the write side, not in core.** All 18 callers are writes, so
  core ownership would have let a read stamp an event. Now it structurally
  cannot.
- **The facade is a usage affordance only.** `findReferences` reported 113
  references across 19 files and **every one outside `src/domain` is a test** —
  `src/cli.ts` empty, `src/index.ts` a hello-world. Both halves are exported, so
  a read-only adapter that never constructs a `WriteSurface` cannot write.

Two dependency-cruiser **errors** lock it in, each verified by injecting a
violating import, watching it fire, and restoring byte-identical: reads and
writes may not import each other; core may not import a surface. That
enforcement was the argument for splitting rather than merely reading a long
file — an unenforced shared core becomes a junk drawer.

Delegation is `readonly x: Surface["x"] = (...args) => ...` rather than 32
restated signatures, so a signature cannot drift and each line names its half.

**The LSP cannot refactor** — it is read-only (`findReferences`,
`incomingCalls`, `documentSymbol`, no rename or code actions). It was the right
instrument for *checking* the move, and confirmed the regex-derived call graph
before any code moved. Unlike the earlier Cypher-string case, these are symbols,
so it could see them.

Twenty-five commits ahead of `origin/feat/domain-consumer`, nothing held back.

**The dependency graph is now self-maintaining** (`1679b88`), which is what that
staleness prompted. It had been hand-regenerated three times in this history and
was stale in HEAD twice on 2026-08-20 alone; the user committed the post-split
regeneration as `3b769c0` mid-session.

- `.githooks/pre-commit` — tracked, regenerates and stages the SVG **only** when
  a commit touches `src/` or `tests/`. Enable per clone or worktree with
  `git config core.hooksPath .githooks`; the hook travels, the config does not.
  On `main` the directory does not exist yet, so git runs no hook until the
  branch merges — safe degradation.
- **Not a gate.** `npx depcruise src tests --output-type err` is the gate. The
  hook never blocks a commit, not on missing graphviz and not on generation
  failure: a refused commit over a diagram is worse than a stale diagram, and
  the staleness is announced.
- `scripts/update-dependency-graph.sh` — generation moved out of `package.json`
  because **the one-liner was a pipeline**. `$?` after a pipeline reports the
  last command's status, so a crashed `depcruise` left `dot` reading empty input,
  writing a valid-but-empty SVG, and reporting success. CLAUDE.md documents that
  trap under "Commands"; automating it would have made an occasional silent
  failure routine. Each stage is now checked separately and nothing moves into
  place without a closing `</svg>`.
- The hook warns when unstaged `src/`/`tests/` changes exist, because generation
  reads the working tree rather than the index — a partial stage yields a
  diagram describing code the commit does not contain. Reported, not fixed.

**Imports pruned** (`31a6196`) — 71 unused names removed from the three split
modules, 37 of them from `core.ts`. The split had copied `session.ts`'s whole
import block into each file; safe, since `noUnusedLocals` is off, but each header
now states what its module actually depends on.

**A windable clock, and row Z narrowed by it** (`93ef2ba`). `024` claimed a
pinned clock meant the harness *structurally* could not evaluate row Z.
**Withdrawn** — wrong twice: `{ now: () => "..." }` is a frozen value with a call
signature rather than a clock, and the limit was the fixture's.

Wound, the answer is observable rather than argued. **Of the six places a write
verb reads the clock, exactly one reaches the graph** — `evaluateCriterion`,
stamping `CriterionEvaluation.evaluated_at`. `reverify`, `acceptAsUnresolved`,
`amendDesign`, `replaceAnalysis` and `reinterpret` stamp only the event stream,
which is not durable state. Probe 5 winds sixty days across an evaluation and a
closure: the evaluation keeps its instant — the wound one, not the start — and
the closure keeps nothing.

So **row Z is narrower than `024` said: evaluations are ordered, decisions are
not**, and `Decision` carries closure, deferral, amendment, promotion and
withdrawal — every act by which belief moves. A frozen clock could not have shown
it, because every stamp was identical. It also says a `decided_at` would be a
smaller change than "add time to the model" implied. Still bar 4, nothing built.

`tests/helpers/clock.ts` names three clocks for three jobs — frozen when a read
must not see time, auto-advancing when stamps must differ but not matter,
windable when the interval is the subject — because picking the wrong one
quietly weakens a test. The paired-world probes keep the frozen one deliberately.

**The hook fired twice on its own**, correctly, both commits having changed the
graph. First production use.

**Both graph forms kept** (`623b0b0`), on the user's reading that they serve
different readers — `docs/dependency-graph.svg` for a person in a browser, where
graphviz's edge routing is what makes a graph this dense legible, and
`docs/dependency-graph.mmd` for an agent reading text: 3KB against 134KB, and it
**diffs**, so a moved edge is visible where 1,444 lines of generated SVG hide it.

**One `depcruise` run renders both**, via `depcruise-fmt`. Two independent
cruises would make agreement a matter of luck; one analysis makes disagreement
impossible, and it is cheaper — the analysis is 0.6s of the 0.9s.

**graphviz is now optional rather than required**: without it the mermaid graph
is still maintained and only the SVG goes stale, announced on stderr. That closes
the portability gap without giving up the human-readable form.

**On "the graph shouldn't update on every code commit"** — checked rather than
assumed. What gets *committed* already moves only when the module structure does,
because output is **byte-stable across runs** and an edit touching no import
yields an **identical graph** (both verified). So compare-then-stage is exact: a
comment-only commit regenerates, matches, and stages nothing.

Gating the *run* on a heuristic was declined deliberately. "Only when files are
added or moved" would have missed the import pruning in `31a6196`, which removed
an edge with no file added or renamed — a cheap gate would have skipped it and
left the graph stale, which is the failure the hook exists to prevent. ~1s per
src commit to never be wrong beats guessing which edits are structural.
`depcruise --output-type mermaid` needs no binary, renders on GitHub, and is
**3KB against the SVG's 135KB** — 261 lines versus 1,447, so readable diffs
rather than a blob on every code commit. Recorded as the option not taken, since
PJ-007 cites reading the SVG. Given the hook now commits it automatically, the
size argument is stronger than it was.

**The doc comments the split moved** (`456d013`, `1cbda1d`, `2ca30d7`). An
earlier repair restored six comments someone noticed. A scan comparing every
member's preceding doc block against `a449392:src/domain/session.ts` found the
shift was **total**: the slicer took spans declaration-to-next-declaration, so
every doc travelled with the member above it. `reverify()` carried
`criteriaGoverning`'s, `acceptAsUnresolved()` carried `reproductionOf`'s S-10
rationale, and the earlier repair had *duplicated* rather than moved —
`whatIsKnown`'s doc existed twice.

*The instrument was wrong before the code was.* The first scan missed one-line
docs, because `doc_span` required `*/` on the line above; the first repair
attempt then stranded a fresh comment on top of one it could not see, and was
reverted. Restored verbatim rather than rewritten, on `labkit-review`'s
argument that restoration has a checkable postcondition and rewriting has none.

`scripts/check-doc-comments.ts` (`bun run check:doc-comments`) keeps the
invariant, and it is narrower than "matches `a449392`", which expires the moment
a doc is legitimately edited: **a doc block must be followed by something it can
document.** It immediately found a third instance in `src/db/domain.ts` — the
S-18 build inserted `PROMOTES` between `CHANGES` and its doc, so the edge meaning
*a decision withdrew or replaced this* had been sitting under `REVERIFIES`'
explanation since `a449392`. Three edits, three files, two of them this session's.

**Row F probed** (`409b53d`, `46b87aa`, `fa3d2f6`, `c636533`, `6281aa3`).
Predictions first, then `tests/scenarios/s9b_rebuild_or_fresh_work.test.ts`,
seven tests. **Nothing in `src/` changed** — that is the result.

Rung 2 held, against the prediction that it would not: `reverify()` already
records a rebuild as an act with a target, and prevents the one wrong answer
available (`whySupported()` reporting a proposition rebuilt once as resting on
two independent findings — S-10's wrong answer at the artefact level). It then
**refuses the case the contract requires**, a rebuild that concludes nothing,
because it re-checks a *conclusion*. Ladder paused at rung 3.

**A rule made checkable** (`e868aac`). `demonstrated` becomes a ledger status
rather than a kind described only in the ownership legend, and
`bun run check:ledger` fails when a second row carries it. CLAUDE.md's
one-wrong-answer-at-a-time rule has had a precondition the ledger could not mark
for eleven scenarios, so whether it was engaged could only be settled by reading
prose — row K's failure mode, and row K's trigger sat fired through three
external reviews. Verified by injection: marking row O `demonstrated` fails the
check and names both rows; the ledger restored byte-identical.

*The seam measurements that justified the split* are kept here because they are
the reasoning rather than the outcome: 28% comments and 6% blank, so 1,927 code
lines across 62 members, ~31 each; read/write partitions perfectly, 18 write
verbs against 14 read verbs with **no member doing both**; the shared core is
exactly five helpers; `emit` has 18 callers and every one is a write.
dependency-cruiser could not find the seam (it saw one node) but can enforce one
afterwards, which is the main argument for bothering.

## Verified

Run on `6281aa3`, the final commit.

- `bun test` → **207 pass, 0 fail**, 22 files.
- `bun run typecheck` → clean.
- `npx depcruise src tests --output-type err` → **0 errors**, 2 orphan warnings
  (`src/index.ts`, `src/cli.ts`, both known stubs).
- `bun run check:doc-comments` → clean (the check added this session).
- `bun run check:ledger` → row AD is the one demonstrated wrong answer.
- `bun run check:migrations` → OK.

**One run reported 199 pass / 1 fail and it was not a regression.** Reproduced by
running `tests/leader-election.test.ts` alone three times: pass, pass, fail. That
is the live pglite-socket concurrency flake CLAUDE.md documents, not the change
under test. Recorded rather than re-run until green.

**The doc-comment repair was verified as comment-only**, by filtering the diff
for changed lines that are not comments — empty in all three commits. The
postcondition for `456d013` is stronger and was checked with a script: every
member's doc block byte-identical to `a449392:src/domain/session.ts`, sole
exception `whatWasKnown`, which did not exist then.

**Detector discipline on S-9b.** Injecting `rebuiltFrom` into `whatDependsOn`'s
return fails the shape assertion in test 6; `read.ts` was restored
byte-identical afterwards (empty `git diff`). Without that, the test would have
stayed green after row F was closed — the defect external review found in the
first draft of consumer probe 3.

Earlier verification, on `1631f3c` (the last commit touching config):

- Deletion-verify on `allowScripts`: removed the block, `bun install`, esbuild
  0.19.12 still present and its binary still runs.
- `node_modules/.bin/drizzle-kit --version` → v0.30.6, executes.
- Leak audit for the Stage A packet: 0 hits in the eighteen bold sentences, 0 in
  what designers actually received. Leak audit of the synthesiser's prompt for
  provider and model strings: 0.
- Attribution gap checked against `src/db/domain.ts`, not recalled: thirteen node
  labels, none denoting a person, agent or role.

Not run at any point: `bun examples/full-lifecycle.ts`.

**Why the combined code run mattered.** The two sessions had each verified one
half against the other's stale side — the review session tested the new lockfile
with the old `package.json`, this one the new `package.json` with the old
lockfile. Both results true; neither covered what shipped. That failure mode is
*created* by clean division of labour, not prevented by it, and separate
worktrees make it easier to fall into.

## Open

- **One confirmed wrong answer is now shipping green, and it is not row F's.**
  Ledger row **AD**: `recordObservations()` mints no `EvidenceUnit`, so a
  question worked on through observations alone reports itself `untested` —
  *"one nothing has ever been run against"* — while a sibling question worked on
  through `recordAnalysis()` reads `unresolved`. S-9b's seventh test asserts the
  wrong answer on purpose, with the assertion it *should* make in a comment
  beside it. Three cold reviewers flagged the missing unit and three scenarios
  found no harm beyond a reader's; this is the fourth and the first to produce a
  wrong answer. CLAUDE.md permits one such row and requires clearing it next.
- **The ledger gained a fourth status**, `demonstrated`, for a row whose
  discriminator is built, whose wrong answer is demonstrated, and whose **fix**
  is what is unbuilt. `labkit-review` accepted it on a better argument than the
  one offered — the deferral rule already referenced this state and the
  vocabulary could not express it — with one condition, now met: something has
  to count it, or a fourth label is just a second prose condition to re-read.
- **Row F was nearly reclassified `boundary`, wrongly.** `027` predicted that
  outcome *and framed it as "a bigger result than an edge"* — a thumb on the
  scale in the document written to prevent editing results into hindsight. It
  contradicts `023`'s strong contract-necessity score, and row Z is the
  precedent against it. Recorded in `028` as considered and rejected, including
  that it nearly happened.
- **Row O's deferral was withdrawn on challenge.** `labkit-review` pointed out
  its cell defers to the event model as a *why state changed* question while its
  own verified-state line describes a *what is true now* one, and that
  `replaceAnalysis` already closes half of it. Its discriminator is a hypothesis
  to test with predictions recorded first, not a finding.
- **Row T stays `open` + unowned.** Proposing to move O and T to "owned by a
  named future build" was wrong: an unbuilt *phase* is not a scenario, and
  naming one converts "we have no discriminator" into "it's handled". If O is
  settled by a plain `Decision → Review` edge, T loses its only named owner.
- **Both self-flagged doubts were correct, and a third was worse.** The review
  confirmed probe 2 was the wrong bar and probe 3 was tautological — the two
  things this session said it was unsure about. It also found the thing not
  suspected: probe 3's shared `contentHash` made its premise incoherent.
- **A flaw in my own packet, found by the designers.** All three over-refused
  telemetry at Stage A and had to narrow it at Stage B. The freshly written
  boundary statement drew the W&B/MLflow line hard enough that three independent
  readers took it as forbidding even a pointer to an external run. A fact about
  the packet, not about LabKit — but it means Stage A's refusal sets are
  systematically too broad in that one region.
- **The synthesiser shares a model family with Designer 2.** Only three providers
  are authenticated and all three are designers, so this could not be avoided;
  blinding means it does not know which output that is, but style is recognisable
  and a nudge cannot be ruled out.
- **`promote()` turns out to be contested.** D1 requires re-execution before
  scratch can be cited; D2 and D3 permit admission by act, which is what S-18
  built. Recorded, not reopened — but last night's choice is no longer obviously
  the only reading.
- **`omp-run.sh` added to the `omp-headless` skill** (in `~/.claude/`, not this
  repo, so uncommitted). Runs omp and leaves an artefact bundle: `prompt.txt`,
  `stdout.txt`, `stderr.txt`, `invocation.txt`, `manifest.json` with SHA-256 of
  prompt, invocation and the omp binary. `--isolate` sets `--no-tools` *and* an
  empty `--cwd`. `manifest.json` records `reached_model` and
  `last_startup_phase`, which is the 4h46m hang made machine-readable — an empty
  stdout is identical whether the model returned nothing or was never reached.
  Smoke-tested; caught a real bug on first run, since macOS bash 3.2 errors on
  `"${arr[@]}"` for an empty array under `set -u`.
- **The manifest shape resembles LabKit's `Computation`/`Artefact` provenance**,
  which is suggestive and is *not* evidence — resemblance is the weakest possible
  support for a schema its own author wrote twice. One detail is worth a ledger
  line: the manifest hashes the **binary that did the work**, an actor recorded
  by identity. That is row S arriving from an unrelated direction, on the write
  side this read-only exercise structurally could not reach.
- **The `omp-headless` skill hung for 4h46m** in `phase: readPipedInput` because
  a direct `omp -p` inherits an open stdin. Fixed in `~/.claude/skills/` (not
  this repo) at the user's request: `< /dev/null` in the canonical command and
  every example, a guardrail with the evidence, the note that `--max-time` does
  not bound startup, and that isolating a child needs `--no-tools` **and** an
  empty `--cwd`.
- **Isolation is enforced, not requested.** `--no-tools` and `--cwd` pointed at
  an empty scratch directory rather than the repo — with omp's default tool set
  and `--cwd "$PWD"` a designer would have had `src/` and `CLAUDE.md` in reach,
  and the brief's "no repository access" would have been a wish. Also
  `--no-session`, and none is told the others exist.
- **Neither this session nor the review session is eligible to be a designer.**
  Both have read the whole ontology. That is why all three run as fresh `omp`
  processes carrying none of this conversation, rather than as forks or
  subagents.
- **I deleted my own wrap state file.** Clearing the 18 foreign state files the
  worktree inherited, I picked "mine" from the newest transcript in the
  worktree's project dir (`4657ab2a…`) and kept that. The Stop hook then passed
  `be5374e7…` — this session kept its id across the move. The hook recreated it
  with a correct baseline, so the outcome was benign, but the reasoning was
  wrong: **the hook's argument is the authority on the session id, not the
  transcript directory.**
- `package-lock.json` is **still tracked on `main`** and arrives there when this
  branch merges. Correct under the docs-on-`main` / code-on-branch split.
- This branch is 1 behind `main` (`3c44e01`, a session-log entry).

## Next

1. **`recordObservations()` must produce an `EvidenceUnit`** — row AD, mandated
   rather than chosen. Start at `src/domain/write.ts:201`. **Invert** S-9b's
   seventh test rather than deleting it, and re-run its shape detectors after.
   It touches every read that walks the unit — `whatIsKnown`, `whySupported`,
   `reproductionOf` — so it is a real build, not a one-line fix.
2. **Row O's discriminator**, with predictions recorded first the way row Z's
   and row F's were: an analysis retired on the strength of a review, that
   review later invalidated — does the retirement still read as resting on valid
   grounds? Needs no event sink. If the propagation query comes back *correct*,
   that is a result and O's cell can finally say why it stays unowned in terms
   of something that was run.
3. **Row S last**, and deliberately: write-side, inexpressible rather than
   unreadable, the most likely to need a real noun.

Row F needs no new probe — it needs the adapter phase's reconstruction-provenance
read to fail against real state, per `023`'s own sequencing.

**Still waiting on a decision, not on work:** whether the SVG earns its 134KB now
that a diffable form exists (the rendered comparison is published as an
artifact); whether `whySupported` + `checksFrom` want their own module inside
`read.ts`; `package-lock.json` still tracked on `main`.
