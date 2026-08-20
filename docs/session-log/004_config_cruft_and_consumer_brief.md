# 004: npm-era config cruft cleared, and the consumer-contract probe run

**Session wrap, 2026-08-20, on `feat/domain-consumer`.** Not a decision record —
see `docs/project-journal/023_capture_cheaply_promote_before_citing.md` for why
a consumer is the next probe, and `docs/consumer-contract/001_design_brief.md`
for the protocol itself. First entry written from the `labkit-domain-consumer`
worktree.

## Goal

Clear "the old js .json config hell cruft" and the dead allow-install entries,
then draft the brief for the cold-context designers PJ-023 called for — and act
on the external review of that brief.

## Changed

Sixteen commits, all this session, range clean — no other session's work in it.

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
 docs/consumer-contract/022_stage_b_analysis.md |  105 +
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

**H1 survives.** Four candidates pass: attribution (all three, distributed across
four unanimous clusters rather than forming one — row S); ordering of belief over
time (all three, three different vocabularies — row Z); bitemporality (D1, and
strictly stronger than row Z); and what a reconstruction was reconstructing (D2,
row F, in almost PJ-021's own words by someone who had never heard of row F).

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

Working tree clean. Eleven commits ahead of `origin/feat/domain-consumer`.

## Verified

Code verification ran on `1631f3c`, the last commit touching code. The four
later commits are documentation only.

- `bun test` → **188 pass, 0 fail**, 611 expect() calls, 20 files, 77.14s.
- `bun run typecheck` → clean.
- `npx depcruise src tests --output-type err` → **0 errors**, 2 orphan warnings
  (`src/index.ts`, `src/cli.ts`, both known stubs).
- `bun run check:migrations` → OK.
- `node_modules/.bin/drizzle-kit --version` → v0.30.6, executes.
- Deletion-verify on `allowScripts`: removed the block, `bun install`, esbuild
  0.19.12 still present and its binary still runs.
- Leak audit for the Stage A packet: grep over PJ-008 §1 for backticked and
  ontology terms — 3 hits, all in glosses or the closing section, 0 in the
  eighteen bold sentences. Audit of what designers actually received: 0 hits,
  73 lines.
- Leak audit of the synthesiser's prompt for provider and model strings: **0**.
- Attribution gap checked against `src/db/domain.ts`, not recalled: thirteen node
  labels, none denoting a person, agent or role; `EvidenceUnitRole` is a kind of
  enquiry activity. Gate states confirmed as
  `never-evaluated | incomplete | blocked | satisfied`.

Not run: `bun examples/full-lifecycle.ts`.

**Why the combined code run mattered.** The two sessions had each verified one
half against the other's stale side — the review session tested the new lockfile
with the old `package.json`, this one the new `package.json` with the old
lockfile. Both results true; neither covered what shipped. That failure mode is
*created* by clean division of labour, not prevented by it, and separate
worktrees make it easier to fall into.

## Open

- **Nothing has been implemented, and bar 3 has not been applied.** Four
  candidates pass the representation bar; none has been tried as query semantics,
  then relationship, then noun. Row P was resolved in the query after two builds
  predicted it needed structure.
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

`git push`. The exercise is complete; nothing further is owed to it.

The next thing that would earn a model change is a **demonstration, not another
designer**. The cheapest is D2's: a scenario where a reader acts on
`whatDependsOn()` reporting something unaffected and is wrong — query semantics,
the tier where row P was resolved, and the third catch on that verb.

The four bar-2 candidates need the stage after this one: the contract implemented
as a thin read surface that has to answer something it cannot. Attribution is the
strongest and the one this read-only protocol structurally could not validate,
since authority, assignment and ownership are write-side.
