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

Merged as **#87** (`dc09b48`), closing #84 and #85.

**`ecd8473`** — the reason `mockSessionContext` survives, on its declaration.
After the gate it reads as vestigial and would be culled on sight; it is kept
because the HTTP surface is undesigned and the spike working it out needs
something to attribute to. Open as PR **#88**.

**Its first push was refused by `.githooks/pre-push`**: #87 merged while the
commit was being written, so pushing to `feat/register-session` would have
succeeded and reached nothing. Recovered the way the hook says — a branch off
the new `main`, cherry-picked. Fourth time that failure has been prevented
rather than found afterwards.

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

**`mockSessionContext` is deliberately kept, and the reason is now on the
declaration.** It reads as vestigial and would be culled on sight — #80's genre
exactly. It survives because the HTTP surface is undesigned and the spike
working it out needs something to attribute to before it knows the real answer.
That is a bet on unfinished work with a date on it, not a claim that it is
reachable, and the comment says to ask again when HTTP lands.

**#81's `Observed`/`Claimed` aliases are not built.** That issue's own open
question — the grade belongs to the *provider*, not the field — is unresolved,
and this work creates the `Claimed` route without needing the types.

**HTTP is not addressed, and `labkit-dev-web` has named the trap it inherits.**
The registry is one closure per process, which is correct by construction over
stdio — one process, one client — and wrong over HTTP, where one process serves
many. The naive wiring gives every client the *same* `who`: first
`register_session` wins, and every other agent's writes carry that agent's
identity.

**That would be worse than the `mock-session-0` this removed**, by this work's
own argument. A uniform placeholder is worse than an empty field because empty
reads as unknown; a *plausible* value one step further reads as **verified**.
Predicted from reading two files, not run.

It is not a defect in what shipped — it is correct for the transport it ships
on. It is a constraint on the HTTP design, and it sharpens E4: the question is
no longer what the SDK does with `Mcp-Session-Id` but whether it hands the
server a stable per-client handle to key a registry off. If yes, a registry per
session id is small. If no, LabKit has to model an HTTP session itself, which
wants an issue rather than a spike commit. **Unanswered.**

## Next

**Answer the sharpened E4 question first**, because `labkit-dev-web` is wiring
the HTTP transport now and the answer changes what it builds: does
`@modelcontextprotocol/sdk` give a tool handler access to the `Mcp-Session-Id`
of the client that called it? Read
`node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.js`
and `mcp.js` for what reaches a registered tool's callback.

Then `gh pr view 88`, and **#86**, which is small and touches the same registration
loop in `buildServer` — one flag on the `mcp` subcommand, `main(tenant,
{ readOnly })`, and a `tools/list` assertion derived from `TOOLS`/`WRITE_TOOLS`
rather than a hand-written list of names.

Decide one thing while there: whether `register_session` is itself visible in
read-only mode. In a server that cannot write, a registration can never affect
an event, so a visible tool is one whose effect is unobservable.
