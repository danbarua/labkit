# 061: an agent signs before it writes

**Session wrap, 2026-08-28, on `feat/register-session`.** Not a decision record
— `src/attribution.ts`'s `SessionRegistry` and `src/mcp/server.ts`'s
`requireRegistered` carry the argument, and issues #83-#86 carry the design.

## Goal

Give the MCP server a way to know which agent is on the other end, and refuse
writes until it does.

## Changed

**`1446885`** — `register_session`, the write gate, and the prose both would
otherwise have made stale.

- `src/attribution.ts` — `SessionRegistry`, `sessionRegistry()`,
  `registeredSession()`. The file's header claim that the MCP server keeps both
  mocks, narrowed: it keeps one, and `git_hash` stays forty zeros for a reason
  the header now states.
- `src/mcp/tools.ts` — `SESSION_TOOLS`, a third category beside `TOOLS` and
  `WRITE_TOOLS`. In `WRITE_TOOLS` it would have gated the tool that opens the
  gate; declared inline in `server.ts` it would have escaped every enumeration
  in `tests/mcp.test.ts`.
- `src/mcp/schemas.ts` — `registeredSessionSchema`, and a note saying why it is
  the one schema `Exact<>` does not hold to an interface: it mirrors nothing.
- `src/mcp/server.ts` — the registry as a **required** argument to
  `buildServer`, `requireRegistered` inside `respond` so a blocked write reaches
  the operator's stderr, and `main()` owning the one real registry.
- `src/mcp/docs.ts` — a third section, so `labkit://docs/tools` cannot omit a
  tool.
- `tests/` — four gate tests in `mcp.test.ts`; `mcp-smoke.test.ts` registering
  over the wire rather than seeding the registry; `mcp-stdio.test.ts` driving
  both halves against a really spawned server; `subject-identity.test.ts`
  updated for the new signature.
- `CLAUDE.md` — the same stale claim as `attribution.ts`'s.

Working tree clean. Open as PR **#87**, closing #84 and #85.

**Not in the range, because they are not commits:** issues **#83** (parent),
**#84**, **#85**, **#86** created and linked as GitHub sub-issues, and the E4
measurement posted to **#81**.

## Verified

`bun run check` — **all 19 passed**, `bun test` 55.3s.

**The refusal test was seen red before it was written.** Replacing the gate call
with `void session` — mutation confirmed by `git diff --stat`, not assumed —
gives `20 pass, 1 fail`, on `a write before register_session is refused`.

**Registered writes are asserted from the event stream**, not from the tool's
reply: attribution rides on the event and nowhere else, so that is the only
place the claim is observable.

Two failures on the first full sweep, both worth recording because both were
predicted and one was not:

- `tests/mcp-stdio.test.ts` met the gate the moment it existed — the integration
  test arriving for free, as designed.
- `check:doc-comments` caught `requireRegistered` inserted **between `respond`'s
  doc comment and `respond`**. Exactly what that check exists for, and it would
  have shipped.

**E4, measured separately** against `@modelcontextprotocol/sdk@1.30.0` on bun
1.4.0, three arms with a positive control: an omitted `sessionIdGenerator` is
stateless (no `Mcp-Session-Id`, and a reused transport throws); a supplied one
mints an id and enforces it (400 without, 200 with). Recorded on #81.

## Open

**#86, `labkit mcp --read-only`.** Independent of this. It *hides* rather than
refuses, and the distinction is the rule worth keeping: *not yet* refuses and
names the remedy, *not here* hides because there is no remedy to name.

**`mockSessionContext` after this.** The gate stops it reaching an event, but it
is still the fallback inside `registeredSession` and still used directly by
`tests/mcp-smoke.test.ts`. Whether it has a remaining `src/` caller worth having
was not checked — #80's genre.

**#81's `Observed`/`Claimed` aliases are not built.** That issue's own open
question — the grade belongs to the *provider*, not the field — is unresolved,
and this work creates the `Claimed` route without needing the types.

**HTTP is not addressed and cannot be until a session id exists.** Per E4, a
registration would have nowhere to live on the SDK's default transport.

## Next

`gh pr view 87`. Then **#86**, which is small and touches the same registration
loop in `buildServer` — one flag on the `mcp` subcommand, `main(tenant,
{ readOnly })`, and a `tools/list` assertion derived from `TOOLS`/`WRITE_TOOLS`
rather than a hand-written list of names.

Decide one thing while there: whether `register_session` is itself visible in
read-only mode. In a server that cannot write, a registration can never affect
an event, so a visible tool is one whose effect is unobservable.
