# 004: npm-era config cruft cleared, and the consumer-contract brief

**Session wrap, 2026-08-20, on `feat/domain-consumer`.** Not a decision record —
see `docs/project-journal/023_capture_cheaply_promote_before_citing.md` for why
a consumer is the next probe. The first entry written from the
`labkit-domain-consumer` worktree.

## Goal

Clear "the old js .json config hell cruft" and the dead allow-install entries,
then draft the brief for the cold-context designers PJ-023 called for.

## Changed

Four commits, all this session, range clean — no other session's work in it.

```
 .gitignore                                 |    6 +
 bun.lock                                   |  226 +-
 docs/consumer-contract/001_design_brief.md |  125 +
 docs/session-log/004_*.md                  |   98 +
 package-lock.json                          | 3188 -----------------------
 package.json                               |    5 -
```

- **`9109790`** — deleted `package-lock.json` (3,188 tracked lines) and ignored
  it. The two committed lockfiles were contradicting each other: the npm one
  pinned drizzle-kit **0.30.6**, `bun.lock` pinned **0.18.1**. Nothing read the
  npm one — no CI, no script or doc reference, and `npx depcruise` runs a binary
  from `node_modules` without consulting it. Ignored as well as deleted so an
  accidental `npm install` cannot resurrect a second source of truth.
- **`1631f3c`** — re-locked drizzle-kit to 0.30.6 and removed the whole
  `allowScripts` block. The lockfile change was a **correction, not a bump**:
  `package.json` declares `^0.30.6`, which `0.18.1` does not satisfy.
- **`1eeb536`** — this entry, under its former name.
- **`d54e920`** — `docs/consumer-contract/001_design_brief.md`, the protocol for
  the contract-first consumer exercise, committed **before any designer runs**
  so its predictions cannot be edited into hindsight.

Working tree clean. Branch was pushed at `1eeb536`; `d54e920` and this entry are
ahead of `origin/feat/domain-consumer`.

**One `npm install` explains the whole config mess**, which is worth more than
the three symptoms separately. Someone bumped `package.json` to `^0.30.6` and
ran *npm*: that updated `package-lock.json` and added `allowScripts` entries
describing the tree npm resolved. `bun install` was never run, so `bun.lock`
stayed at 0.18.1, the `es5-ext@0.10.64` entry went stale, and the block
correctly described a tree bun had never built. Not three oversights — one
install with the wrong tool.

`allowScripts` was **wholly** dead, not one line stale: `@lavamoat/allow-scripts`
is where that field comes from and lavamoat is not installed; bun's equivalent is
`trustedDependencies` (`node_modules/bun-types/bun.d.ts:9402`), which this
`package.json` never used.

Nothing else at the root was cruft, checked rather than assumed:
`docker-compose.yml` is live (the real-AGE reference platform for the
postgres-age skill and `examples/full-lifecycle.md`), `.dependency-cruiser.cjs`
and `drizzle.config.ts` back their scripts, `drizzle/meta/*.json` is
drizzle-kit's journal, and all four `scripts/` targets in `package.json` exist.

## Verified

Run on the **combined** change (`1631f3c`), not on either half:

- `bun test` → **188 pass, 0 fail**, 611 expect() calls, 20 files, 77.14s.
- `bun run typecheck` → clean.
- `npx depcruise src tests --output-type err` → **0 errors**, 2 orphan warnings
  (`src/index.ts`, `src/cli.ts`, both known stubs).
- `bun run check:migrations` → OK.
- `node_modules/.bin/drizzle-kit --version` → v0.30.6, executes.
- Deletion-verify on `allowScripts`: removed the block, `bun install`, esbuild
  0.19.12 still present and its binary still runs.

Not run: `bun examples/full-lifecycle.ts`. The two doc commits change no code.

**Why the combined run mattered.** The two sessions had each verified one half
against the other's stale side — the review session tested the new lockfile with
the old `package.json`, this one tested the new `package.json` with the old
lockfile. Both results were true; neither covered what shipped. That failure
mode is *created* by clean division of labour, not prevented by it, and separate
worktrees make it easier to fall into.

## Open

- **Two questions to the user, unanswered, blocking the designer runs.** Whether
  designers are told the eighteen stories are mined from a real programme
  (legibility versus letting them reverse-engineer which were built); and
  whether all three run on the same model or deliberately different ones — three
  of one model may share blind spots, which would make agreement much weaker
  evidence than it looks. Neither is reversible once a designer has read
  something.
- **I deleted my own wrap state file.** Clearing the 18 foreign state files the
  worktree inherited, I identified "mine" from the newest transcript in the
  worktree's project dir (`4657ab2a…`) and kept that one. The Stop hook then
  passed `be5374e7…` — this session kept its id across the move. The hook
  recreated it with a correct baseline (`26a5866`), so the outcome was benign and
  arguably better than what I would have preserved, but the reasoning was wrong:
  **the hook's argument is the authority on the session id, not the transcript
  directory.** `4657ab2a…` is still present and inert (same baseline, empty
  entry).
- `package-lock.json` is **still tracked on `main`** and arrives there when this
  branch merges. Correct under the docs-on-`main` / code-on-branch split; noted
  so it isn't a surprise.
- This branch is 1 behind `main` (`3c44e01`, a session-log entry).

## Next

`git push`, then run the three designers per
`docs/consumer-contract/001_design_brief.md` §Protocol — independent, no
cross-talk, no repo access, outputs landing verbatim as `002`/`003`/`004` in
that directory before anything is read across them. Answer the two open
questions above first; both change what the designers see.
