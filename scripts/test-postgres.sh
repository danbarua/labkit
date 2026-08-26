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
# because the next run then costs nothing. `docker compose down` stops it.
#
# `tests/helpers/db.ts` applies the migrations itself here — against this
# backend that is the out-of-band deploy step PJ-004 describes, and a test run
# is a legitimate instance of one. It also **truncates every table outside four
# system schemas** between tests, so it must only ever point at a throwaway
# database.
#
# Which is why the default is a database called **`labkit_tests`**, created here
# if it does not exist, and not `postgres` and not `labkit`. `postgres` is the
# cluster's own maintenance database and every tool defaults to it, so a suite
# that truncated *there* would eat whatever a developer had been poking at with
# psql; `labkit` is the name a real deployment would pick, which is precisely
# the name a destructive test run must not be able to reach by default. An
# explicit `LABKIT_DB_URL` is still honoured verbatim — a caller who named a
# database has made that decision — so the guard is a safe default rather than
# a restriction.
#
# Two files opt out, both deliberately: `tests/connection-lock.test.ts` skips
# (its subject is the PGlite lockfile, which a real Postgres does not have) and
# `tests/mcp-stdio.test.ts` strips `LABKIT_DB_URL` from the servers it spawns
# (it gives each one a private directory, and this variable would win over it).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

test_db="labkit_tests"
url="${LABKIT_DB_URL:-postgres://postgres:agens@127.0.0.1:5432/$test_db}"

if [ -z "${LABKIT_DB_URL:-}" ]; then
  if ! docker compose ps --status running --quiet db 2>/dev/null | grep -q .; then
    echo "test:pg: starting docker-compose.yml's db service"
    docker compose up -d db
  fi

  echo -n "test:pg: waiting for postgres"
  for _ in $(seq 1 60); do
    if docker compose exec -T db pg_isready -U postgres -q 2>/dev/null; then
      echo " — ready"
      break
    fi
    echo -n "."
    sleep 1
  done
  if ! docker compose exec -T db pg_isready -U postgres -q 2>/dev/null; then
    echo
    echo "FAILED: postgres did not become ready. \`docker compose logs db\` has the reason."
    exit 1
  fi

  # `CREATE DATABASE` cannot run inside a transaction, so this is a check and
  # then a statement rather than one idempotent DDL. Not a race worth guarding:
  # two concurrent `test:pg` runs against one container would fight over the
  # truncates long before they fought over this.
  exists="$(docker compose exec -T db psql -U postgres -d postgres -tAc \
    "select 1 from pg_database where datname = '$test_db'" 2>/dev/null || true)"
  if [ "$exists" != "1" ]; then
    echo "test:pg: creating database $test_db"
    docker compose exec -T db psql -U postgres -d postgres -c "create database $test_db"
  fi
else
  echo "test:pg: using the LABKIT_DB_URL already in the environment"
fi

echo "test:pg: running the suite against $url"
echo

# Not piped, deliberately. `$?` after a pipeline reports the *last* command's
# status, and a pipe would also throw away every `(fail)` line — the two traps
# CLAUDE.md records, both of which have caught someone here.
LABKIT_DB_URL="$url" bun test
status=$?

echo
if [ "$status" -eq 0 ]; then
  echo "OK: the suite passes against Postgres. The container is still up; \`docker compose down\` stops it."
else
  echo "FAILED: see above. The container is still up so the failure can be inspected."
fi
exit "$status"
