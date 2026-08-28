# LabKit's MCP tools over HTTP, in a container. A spike.
#
# **This is an application image, and the rule that governs `docker/postgres`
# does not apply to it.** That one may add only what a developer would otherwise
# type by hand, because LabKit must keep working against a Postgres somebody
# else administers. This one *is* LabKit, so there is nothing to keep it honest
# about — what it needs, it needs.
#
# **No git, deliberately, and that is a test rather than an omission.**
# `resolveProjectRoot()` shells out to `git rev-parse`, and until 2026-08-28
# (#82) `connectDb` evaluated it in a default parameter — before reading
# `LABKIT_DB_URL` — so it ran on every tool call even when the answer was
# discarded. In here that would be a `git` that does not exist, per call, for a
# value nobody reads. The image not installing git is what makes the fix
# checkable: if a later change reintroduces the call, this stops working rather
# than getting slower.
#
# `docker/ci/Dockerfile` installs git for the opposite reason and says so —
# `check:no-tracked-symlinks` and `check:cli` both need it. Two images, two
# answers, both stated where someone would otherwise guess.
FROM oven/bun:1.4.0

WORKDIR /app

# Dependencies first so a source edit does not re-resolve them. `--frozen-lockfile`
# because a container that silently upgrades a dependency is a container that
# reproduces nothing.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# `drizzle/` is not optional and is easy to forget: the migrations are embedded
# by `src/db/migrations.ts` via `with { type: "text" }`, so they are resolved at
# build time from these paths.
COPY tsconfig.json ./
COPY drizzle/ ./drizzle/
COPY src/ ./src/
COPY scripts/spike-migrate.ts scripts/spike-http-server.ts ./scripts/

ENV LABKIT_TENANT=labkit
EXPOSE 8899

# Serve, and nothing else. **Migration is a separate one-shot service** — see
# the `migrate` service in `docker-compose.yml`.
#
# It was `migrate && serve` in this entrypoint until 2026-08-28, on the
# reasoning that a single-replica spike could get away with it, with a note
# that "a second replica would want it lifted out into a job that runs once".
# The second replica arrived the same afternoon, for the pooler experiment, and
# the two of them raced exactly as predicted:
#
#   web-beta-1 | code: "42P07"   (relation already exists)
#   web-beta-1 | routine: "heap_create_with_catalog"
#
# Which is PJ-004's argument reproduced rather than argued: it is *why*
# `directPostgresBackend` does not migrate on connect. A note saying a shortcut
# will break under a condition is not a substitute for not taking it.
CMD ["bun", "scripts/spike-http-server.ts", "--port", "8899"]
