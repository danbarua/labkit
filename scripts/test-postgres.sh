#!/usr/bin/env bash
# Runs the whole test suite against a real Postgres + AGE container instead of embedded PGlite.
#
# `bun run test:pg`. Optional, and nothing runs it for you: there is no CI, and
# `bun run check` uses the default PGlite path. It is `test:` rather than
# `check:` for that reason — `check:` means "green is fine, red is yours to fix"
# and `bun run check` derives its list from that prefix, so a task needing
# docker must not wear it.
#
# **Why a second backend exists at all.** PGlite is single-writer and the suite
# shares one session with it, so no PGlite run can have two connections live at
# once — anything about isolation, session-scoped role or tenant, or advisory
# locking under contention can only be *demonstrated* here. It is also a
# disagreeing measurement: a `pg.Client` and a raw PGlite do not decode
# identically (`count(*)` is a string on one and a number on the other, measured
# 2026-08-26), and a suite that only ever sees one of them cannot notice.
#
# The container is started if it is not already up and **left running** on exit,
# because the next run then costs nothing. `bun run spike:web:down`, or
# `bash scripts/compose.sh down`, stops it -- plain `docker compose down` works
# too on the main checkout, where the ports are the defaults.
#
# `tests/helpers/db.ts` applies the migrations itself here — against this
# backend that is the out-of-band deploy step PJ-004 describes, and a test run
# is a legitimate instance of one. It also **truncates every table outside four
# system schemas** between tests, so it must only ever point at a throwaway
# database.
#
# Which is why the default is a database called **`labkit_tests`**, and not
# `postgres` and not `labkit`. `postgres` is the cluster's own maintenance
# database and every tool defaults to it, so a suite that truncated *there*
# would eat whatever a developer had been poking at with psql; `labkit` is the
# name a real deployment would pick, which is precisely the name a destructive
# test run must not be able to reach by default. An explicit `LABKIT_DB_URL` is
# still honoured verbatim — a caller who named a database has made that decision
# — so the guard is a safe default rather than a restriction.
#
# **That database is created by the image, not by this script.** It used to be
# a check-then-`CREATE DATABASE` in shell here, which existed only because we
# did not own the image; `docker/postgres/initdb/` does it now, once, on an
# empty data directory. What the image may and may not contain is argued in
# `docker/postgres/Dockerfile`, and the short version is that it is a
# convenience and never a requirement — LabKit must keep working against a
# stock Postgres + AGE somebody else administers.
#
# Two files opt out, both deliberately: `tests/connection-lock.test.ts` skips
# (its subject is the PGlite lockfile, which a real Postgres does not have) and
# `tests/mcp-stdio.test.ts` strips `LABKIT_DB_URL` from the servers it spawns
# (it gives each one a private directory, and this variable would win over it).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

test_db="labkit_tests"

# This worktree's published port, not a literal 5432 -- two worktrees running
# `test:pg` at once would otherwise be one truncating the other's database.
# `LABKIT_DB_URL` still wins: a caller who named a database has decided.
eval "$("$root/scripts/worktree-ports.sh" --export)"
url="${LABKIT_DB_URL:-postgres://postgres:agens@127.0.0.1:${LABKIT_PORT_DB}/$test_db}"

if [ -z "${LABKIT_DB_URL:-}" ]; then
  if ! bash "$root/scripts/compose.sh" ps --status running --quiet db 2>/dev/null | grep -q .; then
    echo "test:pg: building and starting docker-compose.yml's db service"
    # `--build` on every run, not only the first: compose reuses a previously
    # built image without noticing the Dockerfile changed, and a stale image is
    # the kind of failure that gets blamed on the code. Cached, so it costs
    # nothing when nothing changed.
    bash "$root/scripts/compose.sh" up -d --build db
  fi

  echo -n "test:pg: waiting for postgres"
  for _ in $(seq 1 60); do
    if bash "$root/scripts/compose.sh" exec -T db pg_isready -U postgres -q 2>/dev/null; then
      echo " — ready"
      break
    fi
    echo -n "."
    sleep 1
  done
  if ! bash "$root/scripts/compose.sh" exec -T db pg_isready -U postgres -q 2>/dev/null; then
    echo
    echo "FAILED: postgres did not become ready. \`bash scripts/compose.sh logs db\` has the reason."
    exit 1
  fi
else
  echo "test:pg: using the LABKIT_DB_URL already in the environment"
fi

echo "test:pg: running the suite against $url"
echo

# Not piped, deliberately. `$?` after a pipeline reports the *last* command's
# status, and a pipe would also throw away every `(fail)` line — the two traps
# CLAUDE.md records, both of which have caught someone here.
#
# **`bun run test`, not `bun test`.** A bare `bun test` bypasses `package.json`,
# so it runs at bun's 5000ms default rather than the ceiling the `test` script
# sets. This said `bun test` until 2026-08-26 and cost a CI cycle: the sweep was
# fixed, the build got further, and failed here instead — the same defect in the
# second of the two places that invoke the suite. `bunfig.toml`'s `[test]
# timeout` is not an answer; measured against bun 1.3.14, it is ignored.
LABKIT_DB_URL="$url" bun run test
status=$?

echo
# The closing line depends on who owns the database. When `LABKIT_DB_URL` came
# from the environment -- CI, or a developer pointing at their own Postgres --
# there is no compose stack to stop, and saying otherwise sends the reader to a
# command that does nothing.
if [ -n "${LABKIT_DB_URL:-}" ]; then
  after="Against the database LABKIT_DB_URL names; nothing here started or stopped it."
else
  after="The container is still up; \`bash scripts/compose.sh down\` stops it."
fi

if [ "$status" -eq 0 ]; then
  echo "OK: the suite passes against Postgres. $after"
else
  echo "FAILED: see above. $after"
fi
exit "$status"
