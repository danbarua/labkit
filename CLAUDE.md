# LabKit

A research control plane. It records why a computation was run, what evidence
resulted, what claims depend on it, and what is still unresolved. It is not an
experiment tracker — W&B and MLflow own metrics, run logs and sweeps.

The shape is three verbs in three tenses:

- `labkit now` — what stands: what is blocked, what the priorities are.
- `labkit why <handle>` — the causes behind one record.
- `labkit is <handle> <state> --because` — assert a new present.

`labkit --help` is the command list. `labkit://docs/tools` is the MCP tool
list, rendered from the declarations on every read.

## Setup

```sh
bun install
```

Nothing else works until that runs, and the failure does not name its cause: a
fresh worktree has no `node_modules`, so `typecheck` and `depcruise` fail with
`TS2688: Cannot find type definition file for 'bun'`, which reads like a
TypeScript problem and is not one.

## Commands

```sh
bun run check          # test + typecheck + depcruise + every check:* -- run this before committing
bun test               # the suite, against embedded PGlite
bun run test:pg        # the same suite against real Postgres + AGE in docker
bun run typecheck
bun run format         # biome writes; check:format and check:lint are in the sweep
bun run build          # compile bin/labkit
bun run dev            # the CLI
bun run mcp            # the MCP server over stdio
bun run db:generate    # after editing src/db/schema.ts
bun run bonsai:record  # rebuild .labkit-bonsai from the probe scripts
```

## Layout

```
src/db/       nodes and edges. All graph access goes through TenantGraph.
src/domain/   research actions. Verb-first: no createClaim(), only recordAnalysis().
src/mcp/      the agent surface.
src/cli/      the terminal surface. A composition root, nothing else.
```

`src/db/domain.ts` is the domain as graph structure — labels, edges, property
shapes. `src/domain/` is the domain as it matters to a researcher.

A session is assembled in one order: `connect → bootstrapSession → migrate →
resolveTenantContext → scopeToTenant → domain`.

Every write verb runs inside a transaction, so its event commits with the
writes it describes.

## Tests

`tests/scenarios/` and the Bonsai probe scripts are both the acceptance suite.

Scenarios are researcher conversations as executable tests. They may import
`src/domain` and never `src/db` — enforced by dependency-cruiser. A scenario
that needs the persistence layer has found a missing verb.

A scenario line must not name a node or edge label. Needing one means the
storage model has leaked into the vocabulary a user speaks.

Everything else in `tests/` tests persistence directly and may import `src/db`
freely.

Two layering rules are dependency-cruiser errors, not conventions:
`tests/scenarios/` may not import `src/db`, and `src/db` may not import
`src/domain`.

## Rules

**If there is a relationship between A and B, that is an edge.** Not
conditional on a reader existing. A relationship the act names is written when
the act is recorded, and the handle is in hand at that moment. Recovering it
later by matching prose is how a read side ends up guessing.

**Ask of every verb that mints something: does the act record what it produced,
or only what it acted on?** Ask it of the return type too.

**Identity is never wording.** A handle is a branded string. Discriminate on
the prefix, never on `typeof`. No verb resolves wording; `claimsAsserting`
returns every match and refuses to pick.

**A comment says what the code does, and what would trip a reader.** Nothing
else. History goes to git. No dates, issue numbers or incidents in code, help
text or tool descriptions.

**The vocabulary is the user's.** A new read earns a verb a researcher would
say, not a flag naming how the answer is stored.

**Do not use this repo's shorthand when reporting to the user.**

## Platform traps

These cost real debugging time. Load the skill before you need it, not after:

- `.claude/skills/postgres-age` — Apache AGE and Cypher: the forms the grammar
  rejects, the ones that return a silent wrong answer, agtype decoding, RLS.
- `.claude/skills/bun-runtime` — `bun build --compile` and `$bunfs`, PGlite,
  drizzle, biome, and the BSD/zsh shell traps.
- `.claude/skills/mcp-in-context` — driving the MCP server, and the SDK's
  sharp edges.

One that has caught people repeatedly and is worth knowing now: **never pipe
`bun test`.** `$?` after a pipeline is the last command's status, and `| tail`
throws away every `(fail)` line, so a run reporting 23 failures leaves you
unable to name one. Redirect to a file and read the file.

## Work

`gh issue list` is the queue; the ship-labkit project board carries status and
priority. The pull request body is the work log.
