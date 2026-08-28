#!/usr/bin/env bash
# `docker compose`, with this worktree's host ports.
#
# Every compose invocation goes through here so one place decides the ports --
# `scripts/worktree-ports.sh`, which explains why they are what they are. The
# main checkout gets the defaults, so nothing changes for the person on `main`.
#
# The compose file still names literal defaults (`${LABKIT_PORT_DB:-5432}`), so
# a bare `docker compose` typed by hand works and behaves as it always did.
# That is deliberate: this wrapper makes the isolated case easy, it does not
# make the plain case fail.
#
# Usage: bash scripts/compose.sh <any docker compose arguments>
set -euo pipefail
eval "$("$(dirname "${BASH_SOURCE[0]}")/worktree-ports.sh" --export)"
exec docker compose "$@"
