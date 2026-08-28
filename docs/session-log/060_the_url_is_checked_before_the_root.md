# 060: the URL is checked before the root

**Session wrap, 2026-08-28, on `fix/db-url-before-project-root`.** Not a
decision record — `src/db/connect.ts`'s own header carries the argument for the
ordering, and `tests/project-root.test.ts`'s last `describe` says why it asserts
on which error rather than on success.

## Goal

Clear the one thing on the critical path before spiking an HTTP MCP server in a
container: how coupled `resolveProjectRoot()` is, and whether it belongs at the
composition root.

## Changed

**`7e922e5`** — `connectDb` takes `projectRoot?: string` and resolves the
default inside the body, after `LABKIT_DB_URL` is checked.

- `src/db/connect.ts` — the signature, and a header paragraph on why the order
  is load-bearing and what the old one cost.
- `src/cli/commands/serve.ts` — its claim that the server reads `LABKIT_HOME`
  once per tool call, narrowed to the embedded path, which is all it is true of
  now.
- `tests/project-root.test.ts` — a `describe` for *when* the question is asked,
  and a note in the header saying that last block is the exception to "these
  cases cost no database".

Working tree clean. Open as PR **#82**.

**Not in this range, because it happened in the other worktree:** this tree was
created as `spike/webapp` off `b315a8b`, with the four hookify rules copied in,
`bun install` run, and `.claude/.wrap-state/` seeded. `bun run check` was 19/19
here before any work started, which is what makes a green run below mean
something.

## Verified

`bun run check` — **all 19 passed**, `bun test` 56.5s.

**The regression test was seen red first.** Reverting only the two lines of the
signature — mutation confirmed with `git diff --stat`, not assumed — gives
`20 pass, 1 fail`:

```
expect(message).not.toContain("LABKIT_HOME");
Received: "LABKIT_HOME names a directory that does not exist: …/labkit-root-qVgS1p/not-here"
```

The pre-fix behaviour was measured directly before any of this was written:
with `LABKIT_DB_URL` set and `LABKIT_HOME` naming a missing directory,
`connectDb()` threw the `LABKIT_HOME` error without reaching the connection
string.

`test:pg` not run locally; it runs in CI on this PR, `src/db/**` being one of
its triggers.

## Open

**The spike itself, and four experiments written down but not run.** They are
the deliverable rather than the app:

1. **Tenant.** Two HTTP clients both land in `main(tenant = LABKIT_TENANT ??
   "labkit")` — one tenant per process. Result goes to #49.
2. **The GUC under a pooler.** `scopeToTenant` uses `set_config(…, false)` and
   `SET ROLE`, both session-scoped, on the stated premise that production
   resolves one tenant per process. PgBouncer in *transaction* mode breaks that
   premise. The policy reads `current_setting` without `missing_ok`, so the
   claim is that a lost GUC **raises rather than leaking** — and that is read
   off the schema, never observed. Highest-value experiment here: raising is
   the loud outcome, wrong-tenant rows the catastrophic one, and either result
   is a finding.
3. **Attribution.** Two clients write; `labkit_event` should show identical stub
   attribution for both, which turns #81 from a typing question into a defect.
4. **`Mcp-Session-Id`.** What the SDK does with it by default, which feeds the
   session-identity question that stdio answered for free by being 1:1.

**Read-only gating is a finding, not the mode to run in.** Experiment 3 needs
writes, so the experiments run with both surfaces exposed; gating is
demonstrated separately as a registration variant.

**The spike's database must be a third name.** Not `labkit_tests`, which
`reset()` truncates — a concurrent `test:pg` run would eat it silently — and not
`labkit`, which is deliberately the name a destructive default must never reach.
`docker/postgres/` stays untouched: its rule is that the image adds only what a
developer would otherwise type by hand, and a spike is not that.

## Next

Wait for **#82** to merge, rebase `spike/webapp` onto it, then wire
`StreamableHTTPServerTransport` in a script under `scripts/` rather than in
`src/` — `buildServer(withSurfaces)` is already exported and transport-free, so
the spike may need no `src/` change at all, which is what keeps "deleted or kept
on its own merits" honest.

Host first, container second. The binary is the precedent: three bugs sat hidden
one behind the other and only running it found them, so add one variable at a
time.
