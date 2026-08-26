# 047: one binary

**Session wrap, 2026-08-26, on `feat/one-binary`.** Not a decision record —
`src/cli/commands/serve.ts` argues why the subcommand is shaped as it is.

Open as **PR #35**.

## Goal

Dan's decision, relayed by the `labkit-review` session and confirmed with him
before building: one binary. `labkit mcp` starts the server; everything else is
a CLI command.

## Changed

**`1338176` — one binary.**

- `src/cli/commands/serve.ts` **new** — the `mcp` subcommand, registered
  outside `registerReads`/`registerWrites` and taking the program rather than a
  `Run`.
- `src/cli/program.ts` — registers it.
- `src/mcp/server.ts` — `main()` no longer returns.
- `scripts/smoke-binary.sh` — an MCP arm.
- `package.json` — `bun run mcp` goes through the CLI.
- `README.md` — the wiring section rewritten against the binary.

Also carried `docs/session-log/046_...` onto this branch, since PR #34 is to be
closed unmerged and its entry would go with it.

Working tree clean at the wrap commit; pushed.

## Verified

- `bun run check` — all 16 pass.
- **The compiled binary driven as an MCP server over stdio**, from a scratch
  directory with `LABKIT_HOME`, `LABKIT_DB_URL` and `LABKIT_TENANT` all unset:
  34 tools listed, `.labkit/` created in the working directory, a write and a
  read back through it.
- **The new `check:binary` arm was run against the reinstated bug before being
  trusted**: red with `main()` returning, green with it not.
- `bun run build` — 448 modules, 77MB, one executable.

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

## Next

PR #35 awaits review, and PR #34 wants closing.

Then `docs/TASKS.md`: the `connect.ts` discover-not-create change and the
require-`LABKIT_HOME`-to-exist change belong in the queue's loose-ends group,
and the documents group still holds the CLAUDE.md stale-prose sweep and
`docs/persistence-spikes.md` becoming `docs/persistence.md`.
