# Environment variables

Every variable the code reads, what it does, and its default.

## Which record, which database

| variable | effect | default |
| --- | --- | --- |
| `LABKIT_DB_URL` | Postgres connection string. **Read before `--db` and before `LABKIT_HOME`, so setting it makes both void.** | unset: embedded PGlite |
| `LABKIT_HOME` | Directory holding `.labkit/`. Refuses to start if it does not exist. `--db` is read before it, by every command, `mcp` included. | the root of the git repository the working directory is in (the main checkout, for a worktree), else the nearest `.labkit/` at or above the working directory, else the working directory |
| `LABKIT_DAEMON` | `0` opens an embedded record in the command's own process, holding its lock for the length of the work, instead of through the record's daemon. | unset: through the daemon |
| `LABKIT_DAEMON_IDLE_MS` | How long a record's daemon waits with no client connected before it exits. | `900000` (15 minutes) |
| `LABKIT_DAEMON_IDLE_HOLD_MS` | How long a client may hold the record's one session, mid-exchange or in an open transaction, while sending nothing, before the daemon disconnects it and rolls back. | `60000` |

## Attribution

| variable | effect | default |
| --- | --- | --- |
| `LABKIT_RECONSTRUCTED_FROM` | Marks every act written in this session as read off a document rather than performed. `--reconstructed-from` overrides it. | unset |

## Tracing

| variable | effect | default |
| --- | --- | --- |
| `LABKIT_TRACE` | `1` logs slow queries as JSON on stderr. `all` logs every query. `0` or `false` is off. | off |
| `LABKIT_TRACE_SLOW_MS` | A query slower than this is logged. | `1000` |
| `LABKIT_TRACE_STUCK_MS` | A query still running after this is reported as in-flight. | `3000` |

## Ports

`scripts/dev/worktree-ports.sh --export` sets all five from a hash of the worktree path, so two
checkouts do not collide. **It overwrites what you set**; to choose a port yourself, pass a
full `LABKIT_DB_URL` instead.

| variable | effect | default |
| --- | --- | --- |
| `LABKIT_PORT_DB` | Postgres, published by `docker-compose.yml`. | `5432` |
| `LABKIT_PORT_WEB` | The web API. | `8899` |
| `LABKIT_PORT_EXPLORER` | The explorer dev server. | `8850` |
| `LABKIT_PORT_POOLER` | PgBouncer. | `6432` |
| `LABKIT_PORT_ALPHA`, `LABKIT_PORT_BETA` | Two-tenant web fixtures. | `8901`, `8902` |

## MCP

| variable | effect | default |
| --- | --- | --- |
| `LABKIT_MCP_OUTPUT_SCHEMA` | `1` declares an `outputSchema` on every tool. Off because a union or discriminated union there fails every call in some clients. | off |

## Agent

The dev stack runs labkit-effect's ACP agent through an HTTP bridge (`packages/app-web/scripts/labkit-agent-http.ts`), which passes its environment to the agent, less the two bridge variables. The agent reads its own variables, which labkit-effect's `docs/guide/` lists. These are the ones labkit-web reads or sets.

| variable | effect | default |
| --- | --- | --- |
| `LABKIT_ACP_AGENT_URL` | The dev server proxies `/acp` and `/blob/` to the agent's HTTP bridge at this origin, for example `http://127.0.0.1:8951`. Requires `LABKIT_ACP_HTTP_TOKEN`; the dev server refuses to start with one and not the other. The bridge does not pass it to the agent. | unset: the built-in fake agent answers `/acp` |
| `LABKIT_ACP_HTTP_TOKEN` | The bearer token the bridge requires on every request, at least 32 characters; the bridge refuses to start without one. The dev server adds it to each proxied request, so page script never holds it. The bridge does not pass it to the agent. | unset; `bun run dev:with-agent` generates one and keeps it in `.labkit-dev/acp-http-token` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `bun run dev:with-agent` passes it to labkit-effect's agent, which sends its traces, log lines and metrics to it as OTLP (labkit-effect's `docs/guide/logs-and-telemetry.md`). At start, the dev stack logs whether a collector answered there. | `http://localhost:4318` for the dev stack's agent |
| `LABKIT_LOG_LEVEL` | `bun run dev:with-agent` passes it to labkit-effect's agent. At `debug`, the agent also writes the body of each model request and response to `~/.local/share/labkit/logs/http-captures/`. The agent's `LABKIT_ACP_LOG_LEVEL` wins over it. | `debug` for the dev stack's agent |

## Web end-to-end tests

| variable | effect | default |
| --- | --- | --- |
| `E2E_PORT_DEV` | Port for the dev-server run. | `8950` |
| `E2E_PORT_BUILT` | Port for the built-bundle run. | `8951` |
| `E2E_BROWSER_CHANNEL` | `chromium` downloads Playwright's own browser instead of using installed Chrome. | `chrome` |

## CI

| variable | effect | default |
| --- | --- | --- |
| `CI` | Set by GitHub Actions. Some checks refuse to pass on an empty population when it is set. | unset |
