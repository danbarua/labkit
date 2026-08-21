# 004: config cruft cleared, the consumer probe run, session.ts split, five ledger rows moved

**Session wrap, 2026-08-20 to 2026-08-21, on `feat/domain-consumer`.** Not a decision record —
see `docs/project-journal/023_capture_cheaply_promote_before_citing.md` for why
a consumer is the next probe, and `docs/consumer-contract/001_design_brief.md`
for the protocol itself. First entry written from the `labkit-domain-consumer`
worktree.

> Shorthand in this entry — `D1/D2/D3`, `§5`, `bar 4`, the rungs, the ledger
> status words — is glossed in `docs/GLOSSARY.md`.

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
(Designer 2, row F, in almost PJ-021's own words by someone who had never heard of row
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

**The dependency graph was made self-maintaining** (`1679b88`) and then
**un-made** (`ce97456`, at the user's call) — see below. What follows is why it
was built, kept because the reasoning against it only makes sense against the
reasoning for it. It is what that staleness prompted. It had been hand-regenerated three times in this history and
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

**A rule made checkable** (`e868aac`, `8c61ac5`). `demonstrated` becomes a
ledger status rather than a kind described only in the ownership legend, and
`bun run check:ledger` fails when a second row carries it. CLAUDE.md's
one-wrong-answer-at-a-time rule has had a precondition the ledger could not mark
for eleven scenarios, so whether it was engaged could only be settled by reading
prose — row K's failure mode, and row K's trigger sat fired through three
external reviews.

*The first version had the same blind spot as the defect class it closed.* §3
records every status twice, index table and the row's own cell, and the check
read only the table — so it passed while row AD carried `demonstrated` in the
table and `open` in its cell, hours after the status was invented. Caught by
`labkit-review`. The consequence is worse than a stale word: reconciling two
disagreeing sources by trusting the prose and editing the table would leave the
check passing with **zero** demonstrated rows while one shipped green. It now
checks that the two agree, which found two more nobody had reported — row **P**
`resolved`/`open`, four scenarios stale, and row **Y** carrying a qualifier in a
column that is a vocabulary.

*And a third copy, in CLAUDE.md* (`1cee3a5`). It said **"no item on the ledger's
index is now known-open"** three paragraphs above **"Row AD is currently that
one"** — the first sentence written on `main` when it was true, surviving the
edits that made it false, in the file every agent reads first. Reported by
`labkit-review`, who wrote it. Recorded with the limit that produced it: a green
`check:ledger` means the ledger agrees with *itself*, never that CLAUDE.md's
paragraphs are current, and machine-checking narrative prose is deliberately not
attempted. There is a merge hazard — `main` carries the original sentence, so a
resolution keeping `main`'s line restores the contradiction silently and the
check still passes.

*And neither check could say whether it had passed* (`a3fca8c`). `check-ledger`
printed *"no demonstrated wrong answer is shipping green"* — a finding in the
ledger's private vocabulary, leaving the reader unable to tell if that was the
good outcome. Reported by the user on a check written the same day, which is the
shortest gap in this session between writing something and it being unreadable.
Both now follow `check-migrations`' existing convention: **pass or fail in the
first three characters, then plain words**. "Known bug" replaces "demonstrated
wrong answer" in the output — the ledger keeps its own term, which distinguishes
a proved wrong answer from an absence, but a command line does not carry the
ledger's context. Failure paths rewritten and checked by injection, since that is
when they are read.

The pattern, third instance: **the check was verified for correctness by
injection and never once for legibility.** Same shape as the split being verified
as behaviour-preserving and not as documentation-preserving.

Row P's closing paragraph turned out to be a **fired condition**: *"if it is a
defect, something else will have to demonstrate it."* S-9b did. That is the third
such condition to fire unread (K, Z, P), and it is exactly what the check cannot
help with — recorded in the row rather than left to make the check look more
capable than it is.

*The seam measurements that justified the split* are kept here because they are
the reasoning rather than the outcome: 28% comments and 6% blank, so 1,927 code
lines across 62 members, ~31 each; read/write partitions perfectly, 18 write
verbs against 14 read verbs with **no member doing both**; the shared core is
exactly five helpers; `emit` has 18 callers and every one is a write.
dependency-cruiser could not find the seam (it saw one node) but can enforce one
afterwards, which is the main argument for bothering.

**Row AD closed** (`37c8a06`, `17b9976`, `5d730a1`). The wrong answer S-9b
found, cleared the day it opened. `recordObservations()` now mints the
`EvidenceUnit` PJ-001 says must exist — `ADDRESSES` to the enquiry, `PRODUCES`
to the evidence. **One node, two edges, no migration.**

*The blast radius was the only prediction carrying risk, and it held at the
floor.* The ledger cell had feared the fix "touches every read that walks the
unit". One read changed and exactly one test broke. Every other query reaching an
`EvidenceUnit` arrives through `Evidence -SUPPORTS|CHALLENGES-> Claim`, which
observation evidence has neither of, or through a required `USES -> Computation`
an observation unit does not have. Declining to mint a fake `Computation` is
load-bearing twice — honest, and what kept the fix from altering the reproduction
verdict and the support count.

*The transaction is not there because a test failed.* The fix **creates** the
hazard: after it, a torn write leaves precisely the invariant being removed,
durably and indistinguishable from the eighteen scenarios of records that predate
it. Deletion-verified — with `inTransaction` removed the negative test fails,
`write.ts` restored byte-identical.

*`PRODUCES` goes to the evidence and not the artefact*, unlike `recorded()`,
because there the artefact is an analysis output the unit created and here it
**is** the observation record. Predicted in `029` as the wrong answer I would be
tempted by, and named in the code so the asymmetry reads as deliberate. Out with
`labkit-review` for a second opinion — it is the kind of thing that reads right
to whoever just wrote it.

*Found on the way out:* `EvidenceUnitRole` has nine values, one writer and no
readers. Adding `"observation"` was declined — vocabulary with no consumer, and
the no-cull policy covers labels and edges, not property values. Left as a
finding; what would settle it is a reader.

**Three more from review, after the row was closed** (`8afdd39`). The
`PRODUCES` question got **reframed** rather than answered: "does this read
right" is the question whose answer is always yes to whoever wrote the code, and
*name the read that goes wrong* is checkable. No read goes wrong either way,
because nothing walks `EvidenceUnit -PRODUCES-> Artefact` — so CLAUDE.md's claim
that every `EDGE_SCHEMA` label has a writer and a reader is true per **label**
and false per **endpoint pair**, and an entry *is* a list of pairs. Named rather
than culled, beside `EvidenceUnitRole`, where the same shape gets the opposite
answer.

**A backfill was recorded as owed and then withdrawn** — the user challenged it
and was right. There is no persisted data anywhere: the only database is a
gitignored scratch directory, and migrations are rewritten in place until first
deploy, so **first deploy happens with the fix already in the code** and the
records the backfill would repair can never exist. An obligation conditional on a
subject that cannot exist is not an obligation — the same shape as *a refusal
needs something real to refuse*. Removed from CLAUDE.md rather than softened; see
`030`.

The transferable line: **the build verified the fix against every record it
could create, and had no way to think about records it could not.** Every test
here constructs its own world, so the suite is structurally blind to data it did
not write. That is not a gap in the tests; it is what tests are — so the backfill
was unreachable by any test at any coverage, and reachable only by someone
reasoning about the fix instead of running it.

Pair it with the opposite result from the same session and neither ordering is
the lesson. Consumer probes 2 and 3 stayed **green** after their own defects were
fixed, and only injection proved it — execution caught what reading missed.
The backfill went the other way. The pairing is the finding: a defect where the
code is correct about everything it can see is invisible to execution, and a
claim about what running code does is invisible to reading.

**And the caveat, so this does not read as an advertisement: the habit costs
roughly double.** Neither session accepted the other's verification, so most
facts here were established twice. That only paid because the artefacts were
written precisely enough to re-derive cheaply — the unwalked-pair claim was
checkable in four commands because it named the file and the line, while row F's
missing verdict needed a reviewer to notice because nothing named it at all. The
mechanism is not scepticism; it is **scepticism against work that made itself
checkable**. Against work that has not, the same six rounds produce six
arguments. That is the case for the predictions-first protocol, more than any
single finding in this log.

**Row O closed** (`8b6deb9`, `d33734a`, `17f21b4`). Deferred since PJ-008,
taken up on an **external challenge** rather than a prediction of this project's
own. `INVALIDATED_BY: Artefact → Review` — one edge label, one endpoint pair, no
noun, no migration.

*The wrong answer.* `replaceAnalysis()` validated `because: ReviewRef` and wrote
it nowhere, so `whySupported()` reported a superseded finding's reason from any
review of the unit. With a critical review and a confirming one on one analysis
it reported *"numbers check out; independently recomputed the same values"* as a
reason the work was retracted. Two worlds differing only in which review the
researcher acted on were byte-identical to the whole read surface.

*The cell was wrong about its own row.* It described **ambiguity** with several
reviews; the defect was **absence** with one. Two reviews only make it visible.
Every scenario before this had at most one review per analysis, so the read was
right by coincidence in every world the corpus contained — which is how the
deferral survived eleven scenarios.

*The refuted prediction changed the design.* `031` predicted an existing label
would take a new endpoint pair, and `BASED_ON` reads almost perfectly. Row **AA**
is a live boundary recording that `BASED_ON` already carries two senses, so a
third would have widened a boundary row while closing an open one — firing the
nomination rule on the same commit. A general preference lost to a specific fact
recorded four scenarios earlier by someone who would not be present for the
build, which is PJ-025's thesis showing up in a build.

*The challenge, scored as a prediction with a different author.* **Wrong about
the experiment** — it proposed invalidating the causal review, and `invalidated`
belongs to `Artefact` alone while `ReviewProps` is `{ verdict }`. **Right about
the reasoning**, decisively: the cell deferred on grounds its own verified-state
line contradicted. Recorded as a verdict, not a shrug.

*Row T is orphaned*, predicted before the build. Its only named owner was O, and
`INVALIDATED_BY` carries no properties — so T contributed nothing and has no
owner. Not handed the event-sink phase as a substitute: an unbuilt phase is not
a scenario.

*A hazard I walked into.* The scenario file was built through a chain of
scratchpad copies and string replacements, and a stale `expect(a).toEqual(b)`
survived alongside its own replacement — so a passing fix read as a failure. The
same string-replace hazard this session opened with.

**Rows S and T refuted, row F reframed** (`489d103`, `d87d0c5`) — three user
observations, none of which any amount of building would have produced.

*"We're not building an app for users. You can't ask **who** because there is no
**who** with AI agents."* Row S was `023`'s **strongest** consumer finding: all
three cold designers required attribution, and `021` framed it as *"World A:
Alice took the decision; World B: Bob took it"*. That framing is the error.
Alice and Bob are not two values of a missing property — they are two instances
of a kind of entity the domain does not contain. What the question reaches for is
provenance, and the model already carries it: **S-8b** shows two analyses
differing only in the agent configuration they consumed are separated by
`reproducibilityOf()`, and the configuration carries dependants like any other
input. Row L's `CONSUMES`, nothing added. First consumer requirement refuted
**below** bar 4, which never asks whether the contract was right to require the
thing. H1 drops three → two.

*"Edges cannot carry properties — well, DB tables can."* Row T's **title was
false**, and CLAUDE.md's own AGE notes had said so through four cold reviewers
and eleven scenarios. Then: *"what's stopping you from just adding a
parameter?"* Nothing was — and `buildPropertyClause()`'s own comment already
called itself the shape "createNode()/**createEdge()** already build on".
Added, though not through that helper: it names parameters after keys, and this
query binds `$from`/`$to`, so a property called `from` would silently rebind the
source node. Adding it surfaced the row's real content — `createEdge()` is
create-if-absent, so a repeat call **drops** properties, and an upsert would let
callers race under a contract promising retries are free.

*"What you're describing is a versioned domain entity."* Row F spent the whole
arc asking where the `Artefact → Artefact` edge was. The missing thing is one
level down: **an artefact has no identity apart from its content.**
`logical_name` is wording, which S-9 refused as identity; `content_hash` is the
bytes; so there is nothing two artefacts can be two *versions of*. That
reconciles S-9 (two artefacts may share a name without being the same thing) with
S-9b's designer (a reconstruction must remember its target) — both are right, and
a versioned entity is what makes them both right. Same shape as row O: the writer
knows, the verb never asks, the reader infers wrongly. **Not built** — a genuine
new noun, and S-9b cleared bar 4, not §5. What the reframe buys is a
discriminator naming a *shape* rather than a remedy.

**The pattern across all three: a row can be wrong about itself, and re-reading
it is not enough to notice.** T contradicted a document in the same repo. S was
built on a premise about actors nobody had checked against the actual actors. F
named its remedy and called it the problem. All three survived cold review, and
all three fell to someone asking what the row *said* rather than what it needed.

**A glossary, because `D2` means two different things** (`bc4e6f8`). Asked
"WTF is D2?" and the answer is Designer 2 — defined on line 10 of a document that
then uses it 218 times, and nowhere else. Every other document, this entry
included, used it cold. Worse: `D1`/`D2` are *also* `Decision` nodes in PJ-001's
and PJ-003's ASCII diagrams — same token, unrelated referent, same repo, nothing
saying so.

`docs/GLOSSARY.md` is **pointers, not definitions** — a gloss plus where the real
definition lives. A second copy of a definition is a second thing to go stale,
which this week produced a doc comment on the wrong function, a ledger status
disagreeing with itself, a CLAUDE.md sentence outliving its truth, and a row
whose title contradicted a document beside it. A glossary restating definitions
would have been the fifth.

**Third time in one session the user hit unreadable shorthand, and the third was
in the message announcing the glossary that fixed the first two.** The sequence:
`check-ledger` printing "no demonstrated wrong answer is shipping green"; then
`D2` used cold nine times in this entry; then *"S-9b cleared bar 4, not §5"* in a
reply, one message after the glossary landed.

The glossary was the wrong fix, or rather an incomplete one — it makes
**documents** readable and does nothing for a sentence in a reply, which is where
the user actually meets the vocabulary. That is a habit, not a missing file, so
CLAUDE.md now says plainly: do not report to the user in this repo's shorthand.
Say *"we showed it gives a wrong answer"*, not *"it clears §5"* (`e5e1765`).

The general shape, and it is the same one as `check-doc-comments` and
`check-ledger` both shipping with the blind spot of the class they closed:
**noticing a general problem and fixing only the instance is how the instance
recurs** — and a fix aimed at the wrong surface looks like a fix until the
problem happens again somewhere the fix does not reach.

**The dependency query stops overstating itself** (`c8e6362`, `80c605b`), and
the demonstration found something larger than the fix.

*The wrong answer.* A two-stage pipeline — raw series, calibration, trend
analysis. `whatDependsOn(raw)` names the calibration claim and omits the trend
claim that rests on the raw data through it. Populated, confident and short; an
empty answer would at least look like ignorance. A reader working the list
invalidates the raw data and leaves the trend claim standing on it.

*The remedy is the answer shape and nothing else*, as `022` §4 predicted:
`DependencyReport` names the routes walked and carries `complete: false` as a
**literal type**, so completeness cannot be read off it and cannot be widened
into a flag by accident. The coverage assertion `023` §4 forbids stays unbuilt.

*The cause is a missing verb, not a missing edge.* `recordAnalysis({ from })`
accepts only observations handles and `recordObservations()` is the only source
of one — so **an analysis cannot read another analysis's output**. A second
stage can only be recorded by re-entering the intermediate as fresh
measurement, which breaks the chain in the record while it holds in the world.
Fifteen scenarios never needed a second stage. Now its own queue item, because
the remedy is a verb and wants its own demonstration.

*Three failures of my own, during the flake hunt.* The third is the one worth
carrying: **three consecutive runs failing the same four tests was written up as
deterministic, and two further runs then gave 0 and 3.** Three identical samples
is not determinism. It should have been re-tested before it was recorded, and
for a few minutes it made a problem look solved that was not — the same shape as
`024`'s reviewer concluding from reading that a re-run would not matter.

*A fourth, and it is the same shape as the third.* I compared a change against a
baseline measured **hours earlier under different machine load**, concluded it
made things worse, and nearly reverted a change I then measured as three times
better — before a paired test showed it was neither. Sibling Claude sessions run
`bun test` on this machine at load ~6 on 10 cores. **One confident wrong finding
and very nearly a second in the opposite direction, from the same uncontrolled
variable.** Paired A/B is the only design that survives it.

*And two mechanical ones.* A glob excluding
`leader-election` used both `tests/*.test.ts` and `tests/**/*.test.ts`, which
**duplicates five paths** — those files ran twice in one process against shared
module state, and the result briefly looked like evidence that
`leader-election` was innocent. And a commit message carried backticks inside
double quotes, so the shell ran `bun test` *inside the commit command*. Both are
in `TASKS.md` as warnings rather than only here.

*Two things worth keeping.* S-9b's shape detector fired on a change with nothing
to do with row F — it guards the report's shape and cannot tell which field
arrived, which is what it is for; updated, not loosened. And the first version
of the completeness test asserted the wrong direction: `false` is assignable to
`boolean`, so the guarantee worth having is that a report *claiming*
completeness does not typecheck. TypeScript said so via an unused
`@ts-expect-error`.

**The flake, farmed out to three parallel agents** — and the most useful result
was the refutation of my own finding.

*What I had claimed.* Bare `bun test` fails ~50% of runs; passing the 26 files
"explicitly" gave 0 failures across 8 runs; at that rate a 1-in-250 coincidence,
so the difference must be real and must be bun's runner.

*Why it is wrong.* **Bun treats arguments as substring filters matched against a
fresh discovery walk, not as paths.** `bun test consumer` — a bare word that is
not a path at all — runs both consumer files. So 26 "explicit paths" selected
the same 26 files, by the same walk, in the same single process. The two arms
were **the same invocation**.

*And the error is not "n too small".* The arithmetic was fine. **I computed a
p-value against a control I never established**, because the two commands looked
different on the command line. Statistics cannot rescue a comparison whose arms
are the same thing.

*What the agents established.* Bun's runner is cleared — bare `bun test` stayed
a single process for 185s, sampled at 0.25s, no `--test-worker` children, and
`--parallel`/`--isolate` are opt-in. And a **load confound** is real and was
never controlled for: sibling Claude sessions run `bun test` concurrently on
this machine, load ~6 on 10 cores, throughout the hours the original data was
gathered. That agent found it while watching `ps` for something else entirely.

*What replaced the dead finding, and it is sharper.* **The block is finite.**
The slowest `describe` in the suite is 3.61s with **nothing between 4s and 6s**,
so a 5000ms timeout is a 10-25x outlier against a test's own normal rather than
creeping slowness; and three bare runs at `--timeout 20000` gave 0 failures
(n=3, no paired control — suggestive only). Something stalls **more than 5s and
less than 20s, then clears** — contention that resolves, not a wait for a reply
that never arrives. `tenants.id` restarts at 1 every test, so every file
contends on the **same** `pg_advisory_xact_lock` key.

*Both agents then landed, and the mechanism is settled — my "finite block" was
wrong too.*

**Nothing hangs.** 59,086 queries tracked start-to-finish across a run that
reproduced 11 failures: **zero** unfinished, and a watchdog polling for anything
outstanding over 3s never fired once.

**A test's legitimate work crosses bun's fixed 5000ms ceiling.** One timing-out
test issued **311 sequential queries** summing 4.955s against a 4.979s wall
span — 99.5% real round trips, no idle. The dominant cost is
`provisionTenantGraph()` re-checking thirteen node labels and twenty-odd edge
labels, one round trip each, on **every** `begin()` *and* every `current()`.

**A teardown race turns one timeout into a cascade.** Bun's timeout does not
cancel the test body — the abandoned test keeps running, and its late
`scenario.end()` resets the database and closes a connection that by then
belongs to the *next* test. Traced at log-line granularity in two files
independently. That is the whole `graph does not exist` story this repo had
attributed to an upstream socket defect.

**Refuted with evidence:** advisory-lock contention (346 acquisitions, max
38ms), pglite#1046 desync as primary (247/247 clean closes), FD exhaustion (flat
86-92), WASM heap growth (declining at the failure point), `afterAll` not
awaited (gaps all positive), and bun's runner (single process, no children).

**A fix was tried and refuted.** FIFO connection ownership plus `current()`
reusing its context. Paired A/B under shared load: **FIX 2/4/0, BASE 2/0/0.**
Reverted. It **bundled two independent changes**, so it says nothing about
either half — recorded as the error it is.

*Kept from the same investigation:* `inTransaction()` double-decremented its
depth counter when `COMMIT` threw, leaving it at -1 and silently inverting
re-entrancy for the life of the object; and a failing `ROLLBACK` replaced the
error that caused it. Latent, never observed firing, demonstrated then fixed
(`0db47eb`).

*Three documents asserted a cause now known wrong* and were corrected —
`TASKS.md`, CLAUDE.md's testing section, and `tests/helpers/db.ts`'s own header,
which is the one that misled two investigations.

**Gated query tracing, and the provisioning cost it measured** (`626cfef`,
`6eeeb92`, `7d5e3ca`).

*The tracer ships because the investigation built it twice.* `src/db/trace.ts`
wraps the `LabKitDB` seam — a one-method interface everything already goes
through — and is **off unless `LABKIT_TRACE` is set**, returning the object it
was handed so a disabled trace costs one env read at construction. Asserted by
*identity*, not behaviour: a wrapper that merely behaved the same would still
allocate and still branch per query. It records the two things that settled the
flake — **in-flight queries past a threshold** (the only way to produce "nothing
hung", since a query that never finishes never writes a completion line) and
**per-connection counts and durations**. Parameters are never logged; they carry
propositions and verdicts, and a trace file gets pasted into issues.

*Then it answered a question written in 2026.* PJ-005 removed a `schema_version`
gate and said **"measure first if this ever needs revisiting."** Tracing one
scenario file: **2,448 queries, 1,086 of them (44%) provisioning bookkeeping**,
across fourteen reconciliations that each found nothing to do — 78 round trips
per call. The note was answered by a tool built to answer something else.

*The fix reads AGE's catalog once instead of asking 78 times.*
`ag_catalog.ag_label` joined to `ag_graph` gives every label in one query;
`pg_indexes` scoped to the tenant's schema gives every index in another. DDL
only for what is missing. **30% fewer queries overall, 69% fewer provisioning
queries**; three round trips in the steady state instead of eighty.

*And it is emphatically not the gate PJ-005 reverted.* That gate skipped
reconciliation when a stored version matched, so drift stopped being repaired
the moment the number agreed. This reads the **actual** catalog every single
time; it just asks in one question. Nothing is remembered between calls, and
`reconciliation.test.ts` — which provisions a new edge label against an
already-provisioned tenant through the production path — still passes.

*Writing to AGE's tables was considered and declined.* AGE's bulk-import advice
concerns inserting **data rows** to bypass Cypher, which is not what this path
does. `create_vlabel` does catalog bookkeeping *and* creates a table; hand-rolling
it would couple us to AGE internals for a cost paid once per tenant.

*It does not fix the flake and is not claimed to* — it lowers the pressure that
puts a test within reach of the 5000ms ceiling. Two runs after: 2 failures then
0, wall times 132s and 74s. Same flake, same load variance.

*One self-inflicted wound.* The perf change inserted a new doc comment **above**
the existing one on `reconcile()`, and I committed before reading
`check:doc-comments`, which had already failed. Fourth instance of that defect,
second of mine — and the first caught **in the act** rather than months later,
which is the argument for the check.

**Row AE — demonstrated and resolved the same hour** (`0b2bbb3`, `e6e6293`).
The missing verb S-11c exposed, taken from gap to fix.

*The wrong answer.* `recordAnalysis({ from })` took only observations handles, so
a two-stage pipeline had one recordable form: re-enter the intermediate as if it
were fresh measurement. Stage two then reported **`reproducible: true`** while
resting on a raw series the record itself called `unverifiable` — the field
CLAUDE.md says "must not quietly say otherwise", saying otherwise. §5 cleared.

*The fix, at rung 2, and the cheap candidate was enough.* `from` accepts an
`AnalysisRef`; `CONSUMES: Computation → Artefact` carries it, because that edge
already existed and already meant *this run read that*, and an analysis output is
an `Artefact` like any other. **No new edge, noun or migration.** The obvious
remedy — a verb for "stage two reads stage one" — was not needed.

*What it does not fix, asserted rather than implied.* `whatDependsOn()` is one
hop and still stops at the stage-one claim. S-11c's omission had **two causes
stacked** — a severed chain *and* a short traversal — and this fixed only the
first. `routesWalked` and `complete: false` already stop the short answer reading
as complete, which is what that caveat was built for.

*Four hookify rules added* (`.claude/`, gitignored), each from something that
happened today: committing while `check:doc-comments` was failing; a backtick in
a double-quoted `-m` executing `bun test` inside the commit; overlapping globs
yielding five duplicate paths; `git add -A`. All warn, none block.

**Three queue items cleared** (`33756c4`, `21cd68f`, `6cd8d4b`, `1eab282`).

*`whatDependsOn()` walks the pipeline.* Iterative, not a variable-length
pattern: the chain alternates `CONSUMES` and `PRODUCES` and AGE has no
edge-type alternation. Visited-set rather than a depth cap, so a cycle
terminates without truncating a long pipeline. Still `complete: false` —
transitive is not complete.

*A read-only CLI* — `known`, `why`, `affects`, `enquiry`. **Read-only
structurally**: it builds a `ReadSurface`, never a `ResearchSession`, so no
write verb is in scope. The test derives the forbidden list from
`WriteSurface.prototype` rather than hardcoding it, so a verb added later is
covered without anyone remembering. Prose by default, `--json` for programs;
`affects` prints the open-world caveat inline, where someone acts on it.
Verified end to end against a seeded record. Clears one no-orphans warning.

*Row F bit — in the reporting, not the model.* `reproducibilityOf()` took parts
by **reference** on the way in, with a comment arguing a name-keyed map "would
merge exactly the two things this scenario exists to keep apart" — and reported
bare **names** on the way out. An original and its regeneration under one name
put the same string in `exact` *and* `differing` at once; a reader working from
`exact` would conclude the control reproduced. Fixed at rung 1 with
`{ part, name }`. **Row F stays open** — the *report* lacked identity, not the
artefact.

The guard existed, was argued for in writing, and was applied to one direction
only. Seventh region to hit identity-is-never-wording, and the first **inside a
function written to respect the rule**.

## Verified

Run on `80c605b`, the final commit.

- `bun test` → **235 pass / 0 fail**, 30 files, 82.6s on the final run. Still
  intermittently unstable: runs give 0-2 failures with wall times
  between 74s and 135s. Mechanism known (below), fix outstanding. Formerly
  reported as **cause unknown**. Bare `bun test` fails about
  half of runs. Every failure begins with a **5-second timeout** — a hang, not
  an error — and the `graph "labkit_t1" does not exist` errors are fallout from
  a test abandoned mid-flight. Every file passes in isolation.
  **My "the instability is in the invocation" finding is refuted** — see below
  and `docs/TASKS.md`. What replaced it: the block is **finite** (>5s, <20s,
  then clears), bun's runner is cleared, and a load confound is real and
  unquantified.
  Three consecutive full runs failed a *different* test each time — first
  `domain-session`, then two consumer probes, then `domain-session` again — with
  `graph "labkit_t1" does not exist` as the error. Every implicated file passes
  twice in isolation. That is a teardown race, the pglite-socket family CLAUDE.md
  documents, and it is now hitting more than `leader-election`. **Worth its own
  look**: the containment strategy is one connection per test, and a teardown
  race is a gap in that strategy rather than an instance of it.
- `bun run typecheck` → clean.
- `npx depcruise src tests --output-type err` → **0 errors**, 2 orphan warnings
  (`src/index.ts`, `src/cli.ts`, both known stubs).
- `bun run check:doc-comments` → clean (the check added this session).
- `bun run check:ledger` → **no demonstrated wrong answer is shipping green**,
  and no row's status disagrees with itself. Verified by injection both ways —
  flipping AD's cell back to `open` fails and names both lines, marking a second
  row `demonstrated` fails the count — ledger restored byte-identical each time.
- `bun run check:migrations` → OK.
- Deletion-verify on row AD's transaction: removed `inTransaction`, the negative
  test fails; restored byte-identical.
- Deletion-verify on row O's edge: removed the `createEdge`, both S-11b tests
  fail and the confirming verdict returns as a retraction reason; `write.ts`
  restored byte-identical.

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

- **Row AD is closed, so nothing is currently shipping a demonstrated wrong
  answer** — and `bun run check:ledger` says so rather than a paragraph.
  Recorded below as it stood when found, because the deferral history is the
  part that gives it weight.
- **One confirmed wrong answer was shipping green, and it was not row F's.**
  Ledger row **AD**: `recordObservations()` mints no `EvidenceUnit`, so a
  question worked on through observations alone reports itself `untested` —
  *"one nothing has ever been run against"* — while a sibling question worked on
  through `recordAnalysis()` reads `unresolved`. S-9b's seventh test asserts the
  wrong answer on purpose, with the assertion it *should* make in a comment
  beside it. Three cold reviewers flagged the missing unit and three scenarios
  found no harm beyond a reader's; this is the fourth and the first to produce a
  wrong answer. CLAUDE.md permits one such row and requires clearing it next.
- **An instrument inherits its author's model of the defect, and that model is
  the thing that just failed.** Both checks written this session had the blind
  spot of the class they closed: the doc-comment scan could not see one-line
  comments, and its first repair stranded a fresh comment in the gap;
  `check-ledger` read one of two copies of a fact whose failure mode is copies
  drifting. The same sentence explains the three fired conditions — a ledger's
  conditions are written by someone who will not be the one reading them.
- **Two stale copies in one CLAUDE.md paragraph, needing different defences.**
  `labkit-review`'s was written true and falsified later by someone else's edit,
  which is what "withdrawing a claim means finding every place it was made"
  already covers. Mine was **born** describing a thing I had changed two commits
  earlier — announcing a new status in the vocabulary that status replaced. That
  one wants the writer to check they are writing in the vocabulary they just
  changed, and no existing rule says so.
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

1. **The suite flake — mechanism known, fix not.** The target is the
   **provisioning cost**: full label reconciliation on every `begin()` and
   `current()` is what puts a test within reach of the 5000ms ceiling at all.
   Named and unbuilt: drive `begin()`/`end()` from `beforeEach`/`afterEach` so
   bun's timeout cannot interleave two tests; short-circuit provisioning for
   `current()` (provably less work, untested alone); raise the ceiling (works,
   hides). Evidence in `docs/TASKS.md`.
   **Provisioning is now 69% cheaper** (`6eeeb92`) which lowers the pressure
   without removing the ceiling. Use `LABKIT_TRACE=all` rather than rebuilding
   instrumentation — that is what it is for.
2. ~~**The suite flake.** Investigated at length and **not solved.**~~ What was
   bought: the wound-clock probes are now their own file (`7352a5f`), halving
   the cascade's blast radius, and the failure is localised to how bun is
   invoked rather than to any test. Evidence and both of my wrong turns are in
   `docs/TASKS.md`. The obvious workaround — an explicit file list in
   `bun run test` — is recorded and deliberately **not taken**: it would make
   the suite green without making it correct.
   Next probe for whoever picks it up: **find what blocks for 5-20s and then
   clears.** Every failure starts with a 5s timeout and the database errors are
   downstream, so chasing `graph does not exist` is chasing the symptom. Prime
   suspect is `pg_advisory_xact_lock` in `provisionTenantGraph()`, which every
   test contends on under the same key. Control for machine load: sibling
   sessions running `bun test` invalidated an earlier dataset.
2. ~~An analysis cannot read another analysis's output~~ — **done**, row AE.
3. ~~`whatDependsOn()` is one hop~~ — **done**.
4. ~~The thin read-only CLI~~ — **done**. What remains of that phase is the MCP
   adapter proper; the CLI is the same four reads through a different door.
5. **Row F and row T** still need demonstrations. S-9c bit the *report*, not the
   model — an artefact still has no identity apart from its content, and row T
   needs a discriminator it has never had. over the frozen contract. Four reads,
   two durable worlds each, before the read is written.

**Row F is the expensive one and is not next.** Its discriminator now names a
shape — *a scenario in which the record must distinguish a new version of a
thing from a new thing, and gets it wrong* — but it needs a genuine new noun and
S-9b cleared bar 4, not §5.

`open` + unowned is down from four rows to **two** (F and Y/AA aside): O closed,
S and T refuted.

Row T is **orphaned** and its cell says so: its only named owner was row O, and
if O is settled by a plain `Decision → Review` edge, T loses that owner. It is
not handed the event-sink phase as a substitute — an unbuilt phase is not a
scenario.

Row F needs no new probe — it needs the adapter phase's reconstruction-provenance
read to fail against real state, per `023`'s own sequencing.

**The hook and the SVG are gone** (`ce97456`). Documentation that rewrites
itself inside someone else's commit costs more than it buys: it put a generated
artefact in every code commit's diff, and the byte-stability work existed to stop
that being noise rather than to make it useful. The SVG went for its own reasons
— 134KB and 1,444 lines in which a moved edge is invisible, against 3KB of
mermaid that renders on GitHub and diffs. `bun run dev:dependency-cruiser`
regenerates by hand; `npx depcruise-fmt -T dot` recovers an SVG on demand. The
script's per-stage error checking survived, since the pipeline-`$?` trap does not
care how many outputs there are.

**Both journal entries are written** (`2be5cb1`), at the user's direction.
**PJ-025** — a condition recorded where nobody re-reads it is not a mechanism;
rows K, Z and P all fired unread, and the cause is that a ledger's conditions are
written by someone who will not be the one reading them. **PJ-026** — a
predictions document may state what will happen and what would refute it, and may
not rank the outcomes by how impressive they would be; `027` is left unedited
with its offending sentence in place, as the evidence.

The record of what those entries were, before they existed:
the three fired conditions (K, Z, P — each reading *"if X, then this row moves"*
with X happening unnoticed), and the rule that a predictions document may not say
in advance which outcome would be more impressive, for which `027` is the
evidence.

A third was reported to the user as a gap and **is not one**: the ledger needs no
convention for a refuted *challenge*, because a challenge is a prediction with a
different author. Rows A and B keep refuted predictions because someone committed
to an outcome before the build and the record says what happened; who committed
changes the attribution line and nothing else. Recorded on row O in `TASKS.md`
with the write-up bar that matters more — **say what the challenge got wrong, not
that it was wrong.**

**Still waiting on a decision, not on work:** whether `whySupported` +
`checksFrom` want their own module inside `read.ts` — 359 lines, straddling
claims and criteria, deferred during the read/write split and still nothing
depending on it.

~~Whether the SVG earns its 134KB~~ — **decided**: the SVG and the pre-commit
hook that regenerated it were both removed (`ce97456`). `docs/dependency-graph.mmd`
is regenerated by hand via `bun run dev:dependency-cruiser`.

~~`package-lock.json` still tracked on `main`~~ — **not true any more**: it is
gone from `main`.

*This section was stale when Dan read it, which is the failure a handover is
supposed to prevent.* An entry rewritten all day accumulates settled questions
in the one part a reader trusts to be current — and nothing checks it, because
`check:ledger` deliberately does not read prose. `close-entry.sh` (`b71b2be`) is
the structural answer: close an entry when the work it describes is finished,
rather than carrying its open questions forward into work they no longer
belong to.
