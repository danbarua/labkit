# Environment variables

Every variable the code reads, what it does, and its default.

## Which record, which database

| variable | effect | default |
| --- | --- | --- |
| `LABKIT_DB_URL` | Postgres connection string. **Read before `--db` and before `LABKIT_HOME`, so setting it makes both void.** | unset: embedded PGlite |
| `LABKIT_HOME` | Directory holding `.labkit/`. Refuses to start if it does not exist. | the nearest `.labkit/` at or above the working directory |
| `LABKIT_DAEMON` | `0` opens an embedded record in the command's own process, holding its lock for the length of the work, instead of through the record's daemon. | unset: through the daemon |
| `LABKIT_DAEMON_IDLE_MS` | How long a record's daemon waits with no client connected before it exits. | `900000` (15 minutes) |
| `LABKIT_DAEMON_IDLE_HOLD_MS` | How long a client may hold the record's one session, mid-exchange or in an open transaction, while sending nothing, before the daemon disconnects it and rolls back. | `60000` |
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

## Agent

The ACP agent in `packages/app-acp`. `LABKIT_ACP_AGENT_URL` and `LABKIT_ACP_HTTP_TOKEN` are also read by the web dev server.

| variable | effect | default |
| --- | --- | --- |
| `LABKIT_ACP_AGENT_URL` | The dev server proxies `/acp` to the ACP agent's HTTP host at this origin, for example `http://127.0.0.1:8951`. Requires `LABKIT_ACP_HTTP_TOKEN`; the dev server refuses to start with one and not the other. | unset: the built-in fake agent answers `/acp` |
| `LABKIT_ACP_HTTP_TOKEN` | The bearer token the agent's HTTP host requires on every request (at least 32 characters; the host refuses to start with `--http` and no token). The dev server adds it to each proxied request, so page script never holds it. | unset |
| `LABKIT_ACP_MODEL` | The model a new session starts on, as `<provider>/<model>` or a bare model id. An unknown value is logged and the first bound provider's default is used. | the first bound provider's default model |
| `LABKIT_ACP_RECORD` | The labkit workspace (tenant slug) whose research verbs the agent gets as tools named `labkit_why`, `labkit_note` and so on. Reads are read tools; writes go through the session's permission policy and are attributed to the ACP session. The record is opened as the CLI opens it (`LABKIT_DB_URL`, `LABKIT_HOME`). | unset: no research verbs |
| `LABKIT_ACP_TERMINAL` | `1` offers the client terminal tool to the model. | off |
| `LABKIT_LOCAL_BASE_URL` | Base URL of a local OpenAI-chat-compatible server, bound when `GET <base>/models` answers. | `http://localhost:8000/v1` |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` or `GEMINI_API_KEY`, `XAI_API_KEY` | Bind that provider. Every provider whose key is set is offered; with none bound and no local server, creating a session fails and names what was checked. | unset |
| `LABKIT_HTTP_TRACE_DIR` | Absolute directory. Keeps every provider request and response body, credentials redacted, in bounded run directories (newest 20 kept). | unset: no bodies are written |
| `LABKIT_ACP_LOG_DIR` | Directory for the launcher's rotated log files. | `~/.labkit/logs` |
| `LABKIT_ACP_LOG_LEVEL` | Minimum level written: `trace`, `debug`, `info`, `warning`, `error`, `fatal`. | `debug` |
| `LABKIT_ACP_LOG_MAX_BYTES` | Rotation size per log file, at least 1024. | `10485760` |
| `LABKIT_ACP_LOG_BACKUPS` | Rotated files kept per launch. | `4` |

Test and debug switches: `LABKIT_ACP_TEST_BUILT=1` makes the stdio tests run the built launcher, `LABKIT_ACP_KEEP_TRACE=1` keeps their trace directory, `LOGTAPE_TEST_MODE=always` and `LOGTAPE_TEST_LOWEST_LEVEL=debug` print the diagnostics a test emits, and `LOGTAPE_PROBE_FAIL` is read by the logging tests.

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
