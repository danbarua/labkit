# 046: the MCP wiring surface

**Session wrap, 2026-08-26, on `feat/one-binary`.** Not a decision record —
`src/cli/commands/serve.ts` argues the subcommand's shape and `README.md`
carries the wiring itself.

One entry for one unit of work. It began as a review finding about the README's
wiring, went through three review rounds on `fix/readme-tenant-wiring` (PR #34,
**to be closed unmerged**), and ended with Dan's decision to ship one binary —
which retired most of what those rounds had fixed. Splitting it across two
numbered entries described one surface twice.

Open as **PR #35**.

## Goal

Get the MCP wiring right. Started as: the README's own examples contradicted its
`LABKIT_TENANT` advice. Ended as: one binary, `labkit mcp`, so the wiring has
nothing in it to get wrong.

## Changed

Landing on **`feat/one-binary`** (PR #35):

**`1338176` — one binary.**

- `src/cli/commands/serve.ts` **new** — the `mcp` subcommand, registered
  outside `registerReads`/`registerWrites` and taking the program rather than a
  `Run`.
- `src/cli/program.ts` — registers it.
- `src/mcp/server.ts` — `main()` no longer returns.
- `scripts/smoke-binary.sh` — an MCP arm.
- `package.json` — `bun run mcp` goes through the CLI.
- `README.md` — the wiring section rewritten against the binary: four lines, no
  paths, no environment.

**`e077a58` — the sweep says what failed, not only which step.**

- `scripts/check-all.ts` — the step runner tees rather than inheriting stdio,
  and a digest of each failed step prints under the summary table. See Verified.
- `docs/session-log/` — 047 folded into this entry.

**`4b83b21` — run what CI runs, here, and raise a ceiling nobody chose.**

- `scripts/test-in-docker.sh` **new** — `cloudbuild.test.yaml`'s steps in the CI
  image, `--cpus`/`--memory` defaulted to a worker's 2/8g.
- `package.json` — `test:in-docker`, and `test` gains `--timeout 20000`.
- `CLAUDE.md` — both, including what the new script does not do.

Abandoned on `fix/readme-tenant-wiring`, and worth knowing it happened: four
commits correcting the README's wiring for a deployment the binary then
replaced. The two conclusions that survive are in the README that ships here —
the `user`-scope warning and the `LABKIT_TENANT` clarification.

## Verified

- `bun run check` — all 16 pass.
- **The compiled binary driven as an MCP server over stdio**, from a scratch
  directory with `LABKIT_HOME`, `LABKIT_DB_URL` and `LABKIT_TENANT` all unset:
  34 tools listed, `.labkit/` created in the working directory, a write and a
  read back through it.
- **The new `check:binary` arm was run against the reinstated bug before being
  trusted**: red with `main()` returning, green with it not.
- `bun run build` — 448 modules, 77MB, one executable.

**The `check-all.ts` digest was built after a red CI build sent Dan scrolling**
past a `biome migrate` notice and a depcruise *warning*, both of which look like
the failure, to find two test names ~190s up. The summary knew which step failed
and did not say what in it. It now prints a digest per failed step, capped at
twenty lines.

Its patterns are this repo's own vocabulary — `(fail)`, `FAILED:`, `error TS`,
dependency-cruiser's `error`, biome's `×` — and all four shapes were checked
against real output rather than assumed, including three genuine `(fail)` lines
from an earlier run. Verified end to end by breaking a check script and a type
at once: both were named under the table.

The tee that makes it possible keeps the old property intact — output still goes
straight through as it arrives, because a sweep that swallowed a failing test's
diagnosis would cost the thing you actually needed.

## Open

**The first run of the compiled binary found a bug, and nothing else could
have.** `labkit mcp` connected and exited **0 with no output**: `src/cli/cli.ts`
ends with `process.exit(await main())`, and the server's `main()` resolved as
soon as the transport was connected — correct while `src/mcp/server.ts` was its
own entry point, wrong the moment it became a subcommand.
`tests/mcp-stdio.test.ts` spawns the server as a *module* and still passed. Only
the shipped artefact was broken, which is the same condition that let three
`$bunfs` bugs hide behind each other.

**`check:stdout` is now more load-bearing than it was.** A stray `console.log`
in any CLI module reaches the MCP protocol channel, where before only
`src/mcp/` did. The check is static and unchanged; what changed is the blast
radius of the thing it guards.

**The subdirectory case survives and is documented rather than fixed.** With
`LABKIT_HOME` unset the record lands where the client starts the server, so a
launch from `packages/foo` puts `.labkit/` there. The reviewer's proposal for
this — `LABKIT_HOME` set must exist, unset walks *up* for an existing `.labkit/`
and creates only at cwd — is not built. It crosses into `src/db/connect.ts`,
and Dan chose the binary first. Its argument is worth keeping: the walk would
only ever *discover*, never decide where to create, which is a different
property from the implicitness three review rounds removed.

**Also unbuilt from that proposal:** `src/db/backend.ts`'s
`mkdirSync(lockDir, { recursive: true })` manufactures whatever path
`LABKIT_HOME` names, so a typo produces a fresh empty record rather than an
error. It is loud today only when the parent is unwritable.

**PR #34 should be closed unmerged**, not merged and then rewritten.

**From the three abandoned rounds, still true and still unfixed:** an
explicitly-set `LABKIT_HOME` naming a path that does not exist is
*manufactured* by `mkdirSync(..., { recursive: true })`, so a typo yields a
fresh empty record rather than an error. Loud today only when the parent is
unwritable.

**The first red CI build, and it found a real property of the suite.** A
`beforeAll` calling `openScenario()` timed out at 5807ms on a Cloud Build
worker. It reported as *two* failures and is one: `scenario` was never assigned,
so `afterAll` threw `undefined is not an object (evaluating 'scenario.close')`.
Bun also says *"a beforeEach/afterEach hook timed out"* when the hook is a
`beforeAll`, which sends a reader hunting for a `beforeEach` that does not
exist.

**Answered two ways, and only one of them worked.**

`bun run test:in-docker` runs CI's steps in CI's image at a worker's resource
shape. **It did not reproduce the failure** — green at 2 cpus and at 1, with
Postgres alongside as CI does. It closes the *environment* half of "works on my
machine"; the speed half it only approximates, because a shared-core `e2`
throttled to a sustained baseline is not a full local core under quota. Recorded
in CLAUDE.md so nobody trusts it further than it goes.

So the ceiling moved instead: **20000ms, chosen**, where 5000ms was bun's
default and nobody here picked it. Booting WASM inside a hook is legitimate work
and a machine slow enough to exceed five seconds at it is not reporting a hang.
Measured before relying on it: `--timeout` does cover hooks — a 6.5s `beforeAll`
fails at the default and passes at 20000 — so the margin-measuring method
CLAUDE.md documents survives, from a higher start.

**That last one is a judgement, not a fix, and easy to reverse.** It trades a
slower report on a genuinely hung test for not failing on a slow machine. The
alternative — per-hook timeouts — would touch forty-two files to say the same
thing.

## Next

PR #35 awaits review; **PR #34 wants closing unmerged**.

Then `docs/TASKS.md`: the `connect.ts` discover-not-create change and the
require-`LABKIT_HOME`-to-exist change belong in its loose-ends group, and the
documents group still holds the CLAUDE.md stale-prose sweep and
`docs/persistence-spikes.md` becoming `docs/persistence.md`. The suite's CI
headroom deserves a row of its own.
