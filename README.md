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

That is the whole setup. On first run it creates `.labkit/` **in the working
directory**, holding an embedded PostgreSQL (PGlite, with Apache AGE for the
graph), and runs its migrations. That directory is the database, so where you
launch the server from decides which record you are working in — the `--cwd`
in the client configurations below is what pins it.

The file is single-writer, so a process takes an exclusive lock for the length
of a unit of work and gives it back: several agents can share one project, and
one waits briefly while another is mid-command.

Three environment variables, and all have working defaults:

| variable | default | what it does |
| --- | --- | --- |
| `LABKIT_HOME` | the working directory | which directory holds `.labkit/`. The CLI's `--db` says the same thing. |
| `LABKIT_TENANT` | `labkit` | which tenant's graph to open, within one database. |
| `LABKIT_DB_URL` | unset | connect to a real PostgreSQL instead of the embedded one. **Migrations are not run** on this path — an out-of-band deploy step by design. |

**Most projects never touch `LABKIT_TENANT`.** A directory is already a
database, so one project is one record and the default tenant is all of it.
Tenants matter when several programmes share *one* database — which is the
`LABKIT_DB_URL` case, not the `.labkit/` one.

### Wiring it into a client

Claude Code:

```sh
claude mcp add labkit -- bun run --cwd /path/to/labkit mcp
```

Anything that reads an `mcpServers` block:

```json
{
  "mcpServers": {
    "labkit": {
      "command": "bun",
      "args": ["run", "--cwd", "/path/to/labkit", "mcp"],
      "env": { "LABKIT_TENANT": "my-programme" }
    }
  }
}
```

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
