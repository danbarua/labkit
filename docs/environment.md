# Environment variables

Every variable the code reads, what it does, and its default.

## Which record, which database

| variable | effect | default |
| --- | --- | --- |
| `LABKIT_DB_URL` | Postgres connection string. **Read before `--db` and before `LABKIT_HOME`, so setting it makes both void.** | unset: embedded PGlite |
| `LABKIT_HOME` | Directory holding `.labkit/`. Refuses to start if it does not exist. | the nearest `.labkit/` at or above the working directory |
| `LABKIT_TENANT` | Tenant slug the web seeder ingests into. | `overlap-bench` |
| `LABKIT_SOURCE` | Record the web seeder reads from. | `../../../../08_overlap_bench/.labkit` |

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
