# 062: the tools over HTTP, in a container

**Session wrap, 2026-08-28, on `spike/webapp`.** Not a decision record — the
findings are argued in PR #90 and in `scripts/spike-http-server.ts`'s header,
and the constraint they all come from is in `src/attribution.ts`'s
`sessionRegistry`.

## Goal

Take LabKit's MCP tools off stdio and onto HTTP in a container, far enough to
demo — and find out what one process serving many clients breaks.

## Changed

**`d03ec0a`** — `surfacesOver(tenant, session)` extracted from `main()` in
`src/mcp/server.ts`. Pure refactor, no behaviour change. Wiring a second
transport meant calling that composition or writing it again, and writing it
again would have put six paragraphs about transaction scope, tenant pinning and
which mock is still a mock into two files that go stale independently.

**`ed7dc79`** — `scripts/spike-http-server.ts` (Streamable HTTP over
`buildServer` + `surfacesOver`, one registry per MCP session, `--shared-registry`
to demonstrate the failure) and `scripts/spike-migrate.ts` (the out-of-band
deploy step `directPostgresBackend` expects).

**`e22050f`** — `docker/webapp/Dockerfile`, a `web` service behind a compose
**profile**, a db healthcheck for its `depends_on`, `.dockerignore`, and
`spike:web` / `spike:web:down` scripts.

`scripts/` and `docker/` for everything except the extraction; nothing under
`src/` knows the spike exists. Working tree clean, open as PR **#90**.

## Verified

`bun run check` — **all 19 passed**, three times across the session.

`bun run test:pg` — **404 pass, 4 skip, 0 fail**. Run because this session
edited `docker-compose.yml`, which that arm uses; the profile is what keeps the
new service out of its way, and `docker compose config --services` prints only
`db` without `--profile spike`.

**Cold start, twice**, from `docker compose down -v`:

```
spike-migrate: created database labkit_spike
spike-migrate: OK — postgres://postgres:***@db:5432/labkit_spike
spike-http-server: listening on http://127.0.0.1:8899/mcp
curl -s localhost:8899/healthz -> {"ok":true,"sessions":0,"shared":false}
```

**The attribution experiment, paired, same database, one variable:**

| seq | subject | attribution_label | arm | |
| --- | --- | --- | --- | --- |
| 1 | Q_1 | `agent-alpha` | per-session | correct |
| 2 | Q_2 | `agent-beta` | per-session | correct |
| 3 | **Q_3** | **`agent-beta`** | SHARED | **client A wrote it** |
| 4 | Q_4 | `agent-beta` | SHARED | correct by luck |

**`git: NOT INSTALLED`** inside the running web container, which answers anyway
— #82's fix exercised in the environment it was written for.

## Open

**Three findings, all in PR #90 and none yet filed as issues.**

1. **A shared session registry produces a false attribution that reads as
   verified.** Row 3 above. Worse than the `mock-session-0` #87 removed, by
   #87's own argument, and timing-dependent so it would be intermittent. Not a
   defect in #87 — correct for stdio, inherited by HTTP, and the naive wiring
   looks fine. Belongs on **#81**, which is about `Observed` vs `Claimed`: this
   is a third and worse category, *claimed by somebody else*.
2. **One tenant for every client** — four events, two HTTP sessions,
   `tenant_id = 1`. That is **#49**, demonstrated rather than argued.
3. **The Postgres backend does not migrate** (PJ-004, deliberate), and the
   embedded one hides it by holding a lock. Against a fresh container the third
   tool call is `relation "tenants" does not exist`. Deploy step, not defect —
   but it had no caller outside the test helper until now.

**The pooler experiment is not run, and it is the one still owed.**
`scopeToTenant` uses `set_config(…, false)` and `SET ROLE`, both session-scoped,
on the stated premise that production resolves one tenant per process — which
PgBouncer in *transaction* mode breaks. The policy reads `current_setting`
without `missing_ok`, so the claim is that a lost GUC **raises rather than
leaking**. That is read off the schema and has never been observed. Raising is
the loud outcome; wrong-tenant rows is the catastrophic one; either is a finding.

**Not attempted, deliberately:** auth, tenant-per-request, pooling. They are the
real work and wanted these findings first.

## Next

```sh
bun run spike:web            # the demo
bun run spike:web:down       # stop it
```

Then the pooler: put PgBouncer in transaction mode between `web` and `db` in the
spike profile, drive two clients, and read `labkit_event` for whether the second
client's writes raise or land in the wrong tenant.
