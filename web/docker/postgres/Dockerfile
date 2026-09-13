# The Postgres LabKit is developed and tested against.
#
# `bun run test:pg` builds and runs this; Cloud Build will want the same
# artefact. The base is Apache's own AGE image, pinned here rather than in
# `docker-compose.yml` so one file names the version.
#
# **The image is a convenience, never a requirement**, and that is the rule that
# decides what may go in it. LabKit has to keep working against a stock
# Postgres + AGE that somebody else administers, because `LABKIT_DB_URL` — the
# whole point of the second backend — points at exactly that. So this adds only
# what a developer would otherwise type by hand, and nothing LabKit depends on:
#
#   CREATE DATABASE labkit_tests   -> here. A convenience; nothing needs it.
#   CREATE EXTENSION age           -> migration 0001. Works on any Postgres.
#   CREATE ROLE, GRANTs            -> migration 0002. Must exist on a database
#                                     we did not build.
#   tables, policies               -> migrations. The ledger has one owner.
#
# `tests/tenancy-isolation.test.ts` and `bun run test:pg` against the raw
# upstream image are what hold that line: if either needs something this file
# provides, the image has absorbed work the migrations owe.
#
# **The base already does two things worth knowing.** It ships its own
# `/docker-entrypoint-initdb.d/00-create-extension-age.sql`, which is why the
# scripts here are numbered to sort after it. And its command is
# `postgres -c shared_preload_libraries=age`, so AGE is loaded into every
# backend at server start — `LOAD 'age'` is not *needed* here, only refused to
# non-superusers who issue it. See `src/db/scoped.ts` for why that matters and
# what it would take to exploit.
FROM apache/age:release_PG18_1.7.0

COPY initdb/ /docker-entrypoint-initdb.d/
