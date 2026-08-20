# 004: npm-era config cruft cleared, and the consumer-contract protocol built

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

Eight commits, all this session, range clean — no other session's work in it.

```
 .gitignore                                   |    6 +
 bun.lock                                     |  226 +-
 docs/consumer-contract/001_design_brief.md   |  236 +
 docs/consumer-contract/002_stage_a_packet.md |   93 +
 docs/consumer-contract/003_stage_b_packet.md |   77 +
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

Working tree clean. `4ed03ef`, `3820d62` and `b27f82d` are ahead of
`origin/feat/domain-consumer`.

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
  eighteen bold sentences.

Not run: `bun examples/full-lifecycle.ts`.

**Why the combined code run mattered.** The two sessions had each verified one
half against the other's stale side — the review session tested the new lockfile
with the old `package.json`, this one the new `package.json` with the old
lockfile. Both results true; neither covered what shipped. That failure mode is
*created* by clean division of labour, not prevented by it, and separate
worktrees make it easier to fall into.

## Open

- **Stage A is running as this entry is written** — three `omp` processes,
  `anthropic/claude-opus-5`, `openai-codex/gpt-5.6-sol` and `xai-oauth/grok-4.6`,
  all at `--thinking high`. Outputs not yet produced, so nothing has been read.
  They land as `010`/`011`/`012`, committed verbatim before any cross-reading.
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

Collect the three Stage A outputs from the background run and commit them
verbatim as `010`, `011`, `012` **before** reading across them. Then `git push`.
`003_stage_b_packet.md` stays sealed until all three are committed; revealing it
early destroys the ablation permanently.
