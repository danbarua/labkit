# 004: Clearing the npm-era config cruft

**Session wrap, 2026-08-20, on `feat/domain-consumer`.** Not a decision record —
this is toolchain hygiene, no domain model was touched. The first entry written
from the `labkit-domain-consumer` worktree.

## Goal

"Clean out the old js .json config hell cruft", then "delete the unused allow
install packages entries from package.json".

## Changed

Two commits, both this session, range clean — no other session's work in it.

```
 .gitignore        |    6 +
 bun.lock          |  226 ++--
 package-lock.json | 3188 ------------------------------
 package.json      |    5 -
```

- **`9109790`** — deleted `package-lock.json` (3,188 tracked lines) and ignored
  it. The two committed lockfiles were contradicting each other: the npm one
  pinned drizzle-kit **0.30.6**, `bun.lock` pinned **0.18.1**. Nothing read the
  npm one — no CI exists, no script or doc references it, `npx depcruise` runs a
  binary out of `node_modules` without consulting it. Ignored as well as deleted
  so an accidental `npm install` cannot resurrect a second source of truth.
- **`1631f3c`** — re-locked drizzle-kit to 0.30.6 and removed the whole
  `allowScripts` block. The lockfile change was a **correction, not a bump**:
  `package.json` declares `^0.30.6`, which `0.18.1` does not satisfy.

Working tree clean. Branch is 2 ahead of `origin/feat/domain-consumer`,
**unpushed**.

**One `npm install` explains all of it**, which is worth more than the three
symptoms separately. Someone bumped `package.json` to `^0.30.6` and ran *npm*:
that updated `package-lock.json`, and added `allowScripts` entries describing
the tree npm resolved. `bun install` was never run, so `bun.lock` stayed at
0.18.1, the `es5-ext@0.10.64` entry went stale, and the block correctly
described a tree bun had never built. Not three oversights — one install with
the wrong tool.

`allowScripts` turned out **wholly** dead, not one line stale:
`@lavamoat/allow-scripts` is where that field comes from and lavamoat is not
installed; bun's equivalent is `trustedDependencies`
(`node_modules/bun-types/bun.d.ts:9402`), which this `package.json` never used.

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

Not run: `bun examples/full-lifecycle.ts`.

**Why the combined run mattered.** The two sessions had each verified one half
against the other's stale side — the review session tested the new lockfile
with the old `package.json`, this one tested the new `package.json` with the old
lockfile. Both results were true; neither covered what shipped. That failure
mode is *created* by clean division of labour, not prevented by it, and separate
worktrees make it easier to fall into.

## Open

- **I deleted my own wrap state file.** Cleaning the 18 foreign state files the
  worktree inherited, I identified "mine" from the newest transcript in the
  worktree's project dir (`4657ab2a…`) and kept that. The Stop hook then passed
  `be5374e7…` — this session kept its id across the move. The hook recreated it
  with a correct baseline (`26a5866`), so the outcome was benign and arguably
  right, but the reasoning was wrong: **the hook's argument is the authority on
  the session id, not the transcript directory.** `4657ab2a…` is still there,
  inert (same baseline, empty entry).
- `package-lock.json` is **still tracked on `main`** and arrives there when this
  branch merges. Correct under the docs-on-`main` / code-on-branch split, noted
  so it isn't a surprise.
- This branch is 1 behind `main` (`3c44e01`, a session-log entry).

## Next

Push (`git push`), then start the consumer work: contract-first, per PJ-023's
closing section — cold-context agents design the researcher-facing read surface
from the research questions and the journals **without** being shown the graph
ontology, then the thinnest read-only MCP/CLI adapter behind it. The adversarial
PJ-001 reading runs alongside, not instead.
