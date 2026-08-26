# LabKit

A research control plane: it tracks **why** a computation was run, what evidence
resulted, what claims and decisions depend on it, and what is still unresolved.

It is not experiment telemetry — W&B and MLflow own metrics, run logs and
sweeps. LabKit owns provenance, justification and dependency propagation, and
answers questions like *why does this conclusion count as supported?*, *what
breaks if this record turns out to be wrong?* and *is this gate actually
satisfied, or has nobody checked?*

The primary interface is an **MCP server**, so the caller is usually an agent.

## Running the MCP server

```sh
bun install
bun run mcp        # speaks MCP over stdio
```

That is the whole setup. On first run it creates `.labkit/` in the directory
`LABKIT_HOME` names — defaulting to the working directory — holding an embedded
PostgreSQL (PGlite, with Apache AGE for the graph), and runs its migrations.

**That directory is the database, so naming it is the only configuration that
matters.** Set `LABKIT_HOME` to your project in the wiring below. Do not rely on
the working directory: a client decides that, and a launcher that points at the
LabKit checkout puts every project's record in one place inside the source
tree — silently, since `.labkit/` is gitignored.

The file is single-writer, so a process takes an exclusive lock for the length
of a unit of work and gives it back: several agents can share one project, and
one waits briefly while another is mid-command.

Three environment variables, and all have working defaults:

| variable | default | what it does |
| --- | --- | --- |
| `LABKIT_HOME` | the working directory | which directory holds `.labkit/`. The CLI's `--db` says the same thing. |
| `LABKIT_TENANT` | `labkit` | which tenant's graph to open, within one database. |
| `LABKIT_DB_URL` | unset | connect to a real PostgreSQL instead of the embedded one. **Migrations are not run** on this path — an out-of-band deploy step by design. |

**Most projects never touch `LABKIT_TENANT`**, provided `LABKIT_HOME` differs
between them. A directory is a database, so one project is one record and the
default tenant is all of it. Tenants separate programmes that share *one*
database — a real PostgreSQL over `LABKIT_DB_URL`, or two clients pointed at one
`LABKIT_HOME`.

### Wiring it into a client

Claude Code, from the project directory you want the record kept in:

```sh
claude mcp add labkit -e LABKIT_HOME="$PWD" -- bun /path/to/labkit/src/mcp/server.ts
```

That is Claude Code's **local** scope, the default, and it is the one to use:
the entry is stored against this project alone, so the literal path `$PWD`
expands to is correct and stays correct.

Anything else that reads an `mcpServers` block wants the same two fields, with
`LABKIT_HOME` written out in full:

```json
{
  "mcpServers": {
    "labkit": {
      "command": "bun",
      "args": ["/path/to/labkit/src/mcp/server.ts"],
      "env": { "LABKIT_HOME": "/absolute/path/to/your-project" }
    }
  }
}
```

**A literal path, because a variable is only as portable as the client reading
it.** Claude Code expands `${VAR}` here; a client that does not creates a
directory *named* `${PWD}` and reports an empty record — no error, and it looks
exactly like a correctly wired new project. Measured 2026-08-26, both halves.

**Two scopes to avoid, for different reasons.**

A committed `.mcp.json` (Claude Code's **project** scope) cannot name the project
root: `${PWD}` expands to wherever `claude` was launched, so a colleague who
starts in `packages/foo` gets a record there and one who starts at the root gets
a different one. `${CLAUDE_PROJECT_DIR}` does not expand at all. Measured, both.

**User** scope applies one entry to every project you open, which makes every
directory a LabKit record — including ones with nothing to do with research. If
you do want a shared record, say so deliberately: a fixed `LABKIT_HOME` and a
`LABKIT_TENANT` per programme, which is what that variable is for.

The server is named by absolute path rather than launched with
`bun run --cwd /path/to/labkit mcp`. That form worked, and it set the process's
working directory to the **LabKit checkout** — so every client wired that way
shared one `.labkit/` in the source tree. `--cwd` was only ever resolving the
`mcp` script; naming the file resolves it without moving anything.

The server reads and writes. Nothing is exposed that the domain layer does not
already offer, and every tool is listed — with its arguments and its answer — at
`labkit://docs/tools`, which a client can fetch without leaving the session. It
is rendered from the tool declarations on each read and stored nowhere, so it
cannot disagree with the server.

### Where to start, as an agent

`known` answers *what does this programme know?* and hands back question ids.
`pursuits_of` turns one of those into the enquiry ids every recording verb
takes. From there the usual loop is `open_enquiry` → `record_observations` →
`record_analysis` → `close_enquiry`, and the reads (`why_supported`,
`what_depends_on`, `gate_status`) answer about what those put on the record.

Every handle is an opaque short id — `Q_3`, `LOE_7`, `COMP_12`, `CLM_4` — and
every verb takes handles, never wording. `claims_asserting` is the single place
text becomes a handle, and it returns *every* match rather than picking: two
lines of enquiry can assert the same sentence about different endpoints, and
they are two different claims.

## The CLI

```sh
bun run dev --help     # the CLI
bun run build          # compiles it to bin/labkit
bun run example        # a narrated lifecycle, for reading
```

It reads **and writes** — every verb the MCP server exposes has a command — and
`--json` gives the same document an MCP client gets. `--db <dir>` picks the
record; `--author` names who is acting, since a script driving LabKit is not the
account it runs under.

## Developing

`CLAUDE.md` is the guide — architecture, the traps, and why things are the way
they are. Before committing:

```sh
bun run check          # the whole sweep: tests, types, layering, every check:*
```

It derives its own list, so this line does not go stale as checks are added.
Never pipe `bun test` — `$?` reports the pipe, and the `(fail)` lines are what
you needed.

```sh
bun run test:pg        # the same suite against a real Postgres + AGE container
```

Not in the sweep, because it needs Docker. Cloud Build runs it, and
`bun run check`, on every pull request to `main`; see `infra/ci/`.

The reasoning behind the domain model is in `docs/project-journal/`, oldest
first; `docs/TASKS.md` is the work queue.

## Licence

See [LICENSE](LICENSE).
