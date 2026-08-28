# 063: what a connection pooler does to a session-scoped tenant

**Session wrap, 2026-08-28, on `spike/pooler`.** Not a decision record — the
argument and the numbers live on `scopeToTenant` in `src/db/scoped.ts`, beside
the premise they qualify, and in PR #92.

## Goal

Run the one claim in the HTTP spike that was read off the schema and never
observed: that a session which lost its tenant GUC **raises rather than
leaking**.

## Changed

**`ab4305e`** — the pooler arm and what it found.

- `docker-compose.yml` — a `pgbouncer` service, `web-alpha` and `web-beta` on
  tenants `alpha` and `beta`, all under a new **`pooler`** profile; `POOL_MODE`
  and the database host as variables so the three arms differ by one thing
  each. Plus a one-shot `migrate` service both profiles depend on.
- `docker/webapp/Dockerfile` — entrypoint serves and no longer migrates.
- `src/db/scoped.ts` — the findings, on the declaration that carries the
  premise. Prose only; no behaviour change.

Working tree clean. Open as PR **#92**.

## Verified

`bun run check` — **all 19 passed**.

**Three arms, two tenants, two servers, 15 writes each, driven concurrently
through one PgBouncer at `default_pool_size=1`.** Concurrency is load-bearing:
sequential calls land on one backend and pass by accident.

| arm | succeeded | failed | rows in the wrong tenant |
| --- | --- | --- | --- |
| no pooler (control) | 30/30 | 0 | 0 |
| pooler, `session` mode (control) | 30/30 | 0 | 0 |
| pooler, **`transaction`** mode | **1/30** | **29** | **0** |

Both controls green, so the failures are the arm and not the probe. Arm A run
twice with the same result.

**The claim holds in outcome and fails in mechanism.** `raised: 0` — the
`current_setting` raise never fired. What refused was `LOAD 'age'`
(`access to library "age" is not allowed`: a reused backend is already
`labkit_app`, and a non-superuser may not issue it) and the policy rejecting an
INSERT whose tenant did not match the GUC the other tenant's client had left.

**The dangerous case is reachable and was not reached.** `labkit_event` is
`ENABLE ROW LEVEL SECURITY` **without `FORCE`** and owned by `postgres`, which
is who `LABKIT_DB_URL` connects as. Shown directly in psql: as `postgres` with
no GUC, `SELECT count(*) FROM labkit_event` returns every row and no error; as
`labkit_app`, the same query raises `unrecognized configuration parameter`.
PgBouncer kept the role, so LabKit never entered that state.

## Open

**Nothing to fix today** — one tenant per process is still the deployment, and
both findings are recorded where the premise lives. They feed **#49**: they make
"put a pooler in front of it" a design change rather than a configuration one.

**Not filed as issues yet**, and one of them probably should be: `FORCE ROW
LEVEL SECURITY` on `labkit_event`, plus a non-owner login role for
`LABKIT_DB_URL`, would close the owner-bypass at the schema rather than relying
on a step-down surviving. That is a migration and a deployment change, so it
wants an issue and not a spike commit.

**The other session's findings are still unfiled too** — PR #91's shared-registry
result belongs on #81 as a third provenance grade, *claimed by somebody else*.

**A container-hygiene trap worth knowing.** Compose derives its project name
from the directory, so two worktrees have two projects and
`bun run spike:web:down` in one cannot stop the other's containers. Dan hit the
port collision that follows, and the health endpoint he checked was this
worktree's server rather than his own. Nothing to fix in the repo; worth
remembering before trusting a `healthz` from a stack you did not just start.

## Next

```sh
docker compose --profile pooler up -d --build      # the arm
LABKIT_POOL_MODE=session docker compose --profile pooler up -d   # the control
docker compose --profile pooler down -v
```

Then decide whether `FORCE ROW LEVEL SECURITY` plus a non-owner login role is
worth an issue against #49, which is where both this and PR #91's tenant finding
land.
