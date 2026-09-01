# LabKit

<!--
  Real output, pasted from a run against a live research record (a coupled-
  oscillator dynamics research programme called Bonsai) at commit 3fec73e,
  2026-09-01. Re-paste after the record rebuild tracked in #190 step 5 —
  TASK_2 and GATE_1 will read differently once it lands.
-->

```sh
$ labkit now
Right now

Blocked gates
blocked  GATE_3  Stage 2B's readiness signal stays red; the independent package-review gate for stage-4 release is separately and additionally blocked

Blocked work
blocked  TASK_3  produce and maintain the reviewer-required gate inventory (requirement 4, ruling of 2026-08-08) verifying Stage 2B's binding guarantees are enforced in code, not just documented

Unevaluated gates
incomplete  GATE_1  the affected comparison's robustness cannot be confirmed either way; a further design iteration or an honest 'inconclusive' verdict is required

Untouched work — ready to start
planned  TASK_2  advance Stage 2A's feasibility ladder (stages 1-3, up to the full 60,000-image official KMNIST training set) to the locked stage-4 confirmatory evaluation against the untouched official test set

Established
  - does a structured internal transformation exist in response to local perturbations along a baseline trajectory?  (Q_3)  — yes
  - can this structured mapping be linked to an externally defined task or information-processing objective (Level 3)?  (Q_6)  — yes
  - does runtime graph evolution, on top of an already dynamically-encoded local phase state, improve single-step active-support reconstruction under a fixed, majority-censored clipped-Gaussian corruption -- the Stage-2A-shaped question for denoising instead of classification?  (Q_8)  — yes
  - does learned topology (T) produce distinguishable finite-time infinitesimal perturbation dynamics from matched controls (rewired, random, lattice)?  (Q_1)  — no

Provisional (answered, but not something to build on yet)
  - does this structured transformation generalize across independent baseline trajectories, or is it specific to seed=3000?  (Q_4)  — yes
  - does learned topology T produce this mapping more strongly, more stably, or differently structured than matched controls (rewired, random, lattice)?  (Q_5)  — no
  - does the oscillator readout's runtime graph evolution ever become cheaper per image than an ordinary MLP baseline, at some deployment scale?  (Q_7)  — no
  - does the T-vs-stochastic-control comparison hold up under proper seed accounting (multiple seeds per class, explicit within-class aggregation and robustness checks)?  (Q_2)  — no

Accepted as unresolved
  nothing

Unresolved (worked on, no answer yet)
  nothing

Untested (nothing has been run against these)
  nothing

seq: 104  —  `now --since 104` asks what moves next

$ labkit why GATE_3
GATE_3 is blocked because
  - binding_gate a375db47a337: the hierarchical identity gate (primary evolved_T-vs-pre_evolution; denoising gate against identity, evaluated only if primary succeeds, never rescuing a failed primary; pre_evolution-vs-identity always reported independently) is enforced in code, not only in DESIGN.md prose — failed  (CRIT_14)  on 2026-08-08T21:53:23.000Z

$ labkit search "seed"
Records containing "seed"
Question:
  - does the T-vs-stochastic-control comparison hold up under proper seed accounting (multiple seeds per class, explicit within-class aggregation and robustness checks)?  (Q_2)
  - does this structured transformation generalize across independent baseline trajectories, or is it specific to seed=3000?  (Q_4)
LineOfEnquiry:
  - 10-class re-verification: 25 seeds per stochastic control, mean-aggregated paired Wilcoxon primary, median-aggregation + exact sign-flip + within-class MCSE robustness cascade, Holm correction across 4 comparisons  (LOE_2)
  ⋮ (12 more matches, across Evidence, Decision, Criterion, CriterionEvaluation, Review and Task — every field the record considers prose, not just questions)
```

**`now` is the standing** — what's blocked, what's ready, where every question
sits — computed fresh from the graph on every call, never stored. **`why`
explains one record's causes**, the same computation `now` summarises, asked
about one handle. **`search` finds a handle from a word**, across every field
the record considers prose. Together they are two tenses of one vocabulary:
`now` is what stands, `why` is why. A third, `is`, will assert a new present
deliberately (#184, not yet built); until then the write verbs (`pose`,
`pursue`, `record_analysis`, `close_enquiry`, …) do that work directly, each
under its own name.

LabKit is a research control plane: it tracks **why** a computation was run,
what evidence resulted, what claims and decisions depend on it, and what is
still unresolved.

It is not experiment telemetry — W&B and MLflow own metrics, run logs and
sweeps. LabKit owns provenance, justification and dependency propagation, and
answers questions like *why does this conclusion count as supported?*, *what
breaks if this record turns out to be wrong?* and *is this gate actually
satisfied, or has nobody checked?*

The primary interface is an **MCP server**, so the caller is usually an agent;
the CLI above is the same record, for a person at a terminal.

## Running the MCP server

```sh
bun install
bun run build        # compiles bin/labkit
./bin/labkit mcp     # speaks MCP over stdio
```

**One binary.** `labkit mcp` is the server; everything else `labkit` does is a
command for a person. Two executables would have been two copies of the same
77MB runtime.

On first run it creates `.labkit/` — an embedded PostgreSQL (PGlite, with Apache
AGE for the graph) — and runs its migrations. **That directory is the database.**
It goes wherever `LABKIT_HOME` points, or in the working directory if that is
unset.

The file is single-writer, so a process takes an exclusive lock for the length
of a unit of work and gives it back: several agents can share one project, and
one waits briefly while another is mid-command.

Three environment variables, and all have working defaults:

| variable | default | what it does |
| --- | --- | --- |
| `LABKIT_HOME` | the working directory | which directory holds `.labkit/`. The CLI's `--db` says the same thing; `labkit mcp` takes no such flag. |
| `LABKIT_TENANT` | `labkit` | which tenant's graph to open, within one database. |
| `LABKIT_DB_URL` | unset | connect to a real PostgreSQL instead of the embedded one. **Migrations are not run** on this path — an out-of-band deploy step by design. |

**Most projects never touch `LABKIT_TENANT`**, provided each has its own
`.labkit/`. A directory is a database, so one project is one record and the
default tenant is all of it. Tenants separate programmes that share *one*
database — a real PostgreSQL over `LABKIT_DB_URL`, or two clients deliberately
pointed at one directory.

### Wiring it into a client

Put `labkit` on your `PATH`, then:

```json
{
  "mcpServers": {
    "labkit": {
      "command": "labkit",
      "args": ["mcp"]
    }
  }
}
```

**No paths and no environment.** That is the point of the binary: there is
nothing in this block for a client to expand, mis-expand, or leave literal, and
nothing that differs between your machine and a colleague's. It is safe to
commit. If `labkit` is not on `PATH`, give `command` the absolute path to the
binary and change nothing else.

Or, for Claude Code, from the project directory:

```sh
claude mcp add labkit -- labkit mcp
```

**The record lands where the client starts the server.** With no `LABKIT_HOME`
that is the working directory, and a client launched from a subdirectory of your
project puts `.labkit/` in the subdirectory. Set `LABKIT_HOME` if you want it
pinned regardless — but then it is a literal path, and a literal path in a
committed file is right on one machine only.

**Do not put LabKit in `user` scope**, or whatever your client calls a config
that applies everywhere. One entry then makes every directory you open a LabKit
record, including the ones with nothing to do with research. If you do want a
shared record across projects, say so deliberately: a fixed `LABKIT_HOME`, and a
`LABKIT_TENANT` per programme.

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

The same binary, without the `mcp` subcommand:

```sh
labkit --help
labkit now             # what am I blocked on, what are my priorities?
bun run dev --help     # the same thing, from source
bun run example        # a narrated lifecycle, for reading
```

It reads **and writes** — every verb the MCP server exposes has a command — and
`--json` gives the same document an MCP client gets. `--db <dir>` picks the
record; `--author` names who is acting, since a script driving LabKit is not the
account it runs under.

<!--
  TODO(#186): once `conclude` lands, document it here as the write primitive
  it replaces record_analysis's superseding-analysis JSON flags with. Neither
  form is documented yet on purpose — the flags it replaces are still live on
  main, and writing either down now would describe a shape still in motion.
-->

Running `labkit now` in a terminal while an agent session is open is the
ordinary case, not an edge one: the server holds the database only for the
length of a tool call, so the two take turns rather than colliding.

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
first; `gh issue list` is the work queue.

## Licence

See [LICENSE](LICENSE).
