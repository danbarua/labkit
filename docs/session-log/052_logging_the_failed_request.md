# 052: the failed request, logged beside the error

**Session wrap, 2026-08-27, on `feat/log-failed-requests`.** Not a decision
record — the argument is in `src/request-log.ts`'s header, which is where a
reader of that file will want it.

Open as **PR #47**. A new entry rather than more of 051: that entry's subject
merged in PR #45.

## Goal

Dan, smuggling a feature in alongside the worktree fix: when a command fails,
log the request that failed. *"Error happened: can figure out what the caller
was trying to achieve by walking the stack trace. What was the input that caused
the error? Needs capture."*

His two answers to the questions put to him: **boundary at the composition
root**, DTO = the user request as parsed; and **truncate prose**, on the grounds
that `Prose` is *"a string labkit reads and writes, never applies logic to"*.

## Changed

**`a8ebef6`** — `src/request-log.ts` new; wired into `src/cli/cli.ts`'s catch
and `src/mcp/server.ts`'s `respond()`; ten tests; CLAUDE.md.

## Verified

`bun run check` — all 18. Ten tests, weighted toward the logger's **own**
failure modes, because the subject is a diagnostic: one that throws on its input
or hangs on a cyclic object turns a reported error into an unreported one. Both
covered, plus SQLSTATE surviving and stdout staying empty.

**Negative control run:** raise the limit past every fixture and disable the
cycle guard — three go red.

Driven live before any test was written: `labkit why CLM_999` against an empty
record emits one line naming `argv` and the error.

## Open

**The type Dan named is the right one and cannot be inspected.** `Prose` is
exactly the class to cut, and `src/db/domain.ts` declares
`export type Prose = string` — a plain alias, erased before any of this runs.
All five taxonomy members are. So the rule became his own aside made literal:
*if len > TRUNCATE then truncate()*.

**That is defensible for his reason, and the first run falsified the strong
version of it.** The header first said *"prose is the only class that can be
long"*. A `--db` argument is a filesystem path — not in the taxonomy at all,
because it is never stored — and went over the limit immediately. The claim is
now the weaker true one: a bound on **output** which, among *domain* values,
coincides with the prose line. That correction came from running the thing once,
not from review.

**It does not reverse the rule it appears to.** `unwrapped()` and
`src/db/trace.ts` refuse to log bound parameters because an error *message*
reaches the calling agent verbatim as `isError: true`. The distinction is the
**stream** — message to the agent, request to the operator's stderr — and
`respond()` logs and *rethrows* so nothing an agent sees has changed.

**Not built, and worth knowing before someone asks for it:** there is no
sampling, no level, and no way to turn this off. It fires only on a failure,
which is rare and is the moment someone wants it, so a switch would be a knob
for a cost nobody has measured. `LABKIT_TRACE` is the precedent for adding one
if a volume problem ever shows up.

## Next

PR #47 awaits review.

Then the digest work, which has been queued since PR #44 merged:
`docs/digest-design.md` §8 — the §2 scenario, a promoted and closed answer whose
claim is held to a failed or never-run criterion, with the scenario picking the
bucket.
