# 054: the suite's margin, reproduced at last

**Session wrap, 2026-08-27, on `fix/in-docker-timing-arm`.** Not a decision
record — the measurements are in `scripts/test-in-docker.sh`'s header and on
issues #53 and #54.

Open as **PR #67**. A new entry rather than more of 053: that entry's subject
merged in PR #61.

## Goal

Two things, in order. Move work tracking off `docs/TASKS.md` and into GitHub
issues, with labels for each section the file had grown and the `open question`
shape borrowed from `agent-bus`. Then take the three suite-margin issues Dan
asked about — could they be handed to a background agent? — and answer that with
measurement rather than a guess.

## Changed

Merged in **PR #61**: `docs/TASKS.md` deleted, eleven issues, six labels; then
`open question` and `domain model`, and the three PJ-008 §3 open rows imported
as issues.

**`eb79f08`** (PR #67) — `scripts/test-in-docker.sh`'s header carries the
measurements below and names the timing arm.

## Verified

Everything here was run in Docker, so nothing local changed — Dan's constraint,
because exo is on bun too and a dependency switch would have to be verified for
them and not only here.

**#54 — bun 1.4.0 still ignores `bunfig.toml`'s `[test] timeout`.** Both
versions fail a 6.5s `beforeAll` at ~5.0s with the config present, and both pass
it with `--timeout 20000`. **Control:** with the config deleted, 1.4.0 fails
identically — so the config makes no difference either way rather than the
fixture being insensitive to it. `check:test-ceiling` stays; a bun bump would
not break the ceiling.

**#53 — reproduced.** Real suite, CI image, at the old 5000ms ceiling:

| `--cpus` | tests | wall | failures |
| --- | --- | --- | --- |
| 2 (the default) | 398 | 78s | 0 |
| 1 | 398 | 85s | 0 |
| **0.5** | **388** | 195s | **2** |

At 0.5 it is the CI failure exactly — `a beforeEach/afterEach hook timed out`,
8178ms, in `tests/subject-identity.test.ts`, with ten tests never reaching the
runner.

**Margin, which is #52's question:** at `--cpus=0.5` with today's 20000ms
ceiling, **0 failures, 398 tests, 180s**. At 0.25 and the old ceiling, three
failures including a hook at **28513ms**. The 0.25 arm at today's ceiling was
still running when this was written.

## Open

**`--cpus` caps quota, not speed, and that is the whole reason two years of
"works on my machine" held.** Two cores of an M1 Max are several times the
throughput of two e2 vCPUs, so `LABKIT_CI_CPUS=2` — chosen to be
*worker-shaped* — was a machine much faster than the worker. The tool modelled
the worker's core **count** and not its **speed**.

**Two corrections fall out, and both were previously written down wrong here.**
The suite is **not CPU-bound** — 2 → 1 costs seven seconds — so core count was
never going to be the lever, which is why raising and lowering it did nothing.
And an `e2-standard-2` is **not** shared-core: it has two dedicated vCPUs, so
the gap is per-core throughput and not burst credits. I asserted the shared-core
version to Dan mid-session before checking it.

**#52's premise is wrong in the useful direction.** It says the raised ceiling
*is not headroom*. At the constraint that reproduces CI's original failure, the
suite runs clean at 180s — the raise did real work rather than papering over.
Headroom runs out between 0.5 and 0.25 CPU.

**The default stays at 2 on purpose.** 0.5 is this laptop's calibration; there
is no portable number, and changing the default would silently redefine what
"CI-like" means on every other machine to chase a figure that is only right
here.

**Not delegated, and the reason is worth keeping.** Dan asked whether the three
could go to a background agent. #54 turned out not to be a task at all — a
five-minute measurement whose trigger had just become testable. #53 would have
been agent-suitable *only* with the refuted-hypothesis list in its briefing,
since CLAUDE.md records eight investigations already closed on this exact
flakiness. Doing #53 first made #52 nearly free, where running all three in
parallel would have burned Cloud Build minutes answering a question #53
dissolved.

## Next

PR #67 awaits review. When the 0.25 arm at the 20000ms ceiling lands, #52 gets
its comment and can probably be closed on the evidence rather than worked.

Then the digest work: #62 is the open question that blocks it, and #66 is the
one after.
