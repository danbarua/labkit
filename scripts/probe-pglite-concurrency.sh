#!/usr/bin/env bash
# Asks whether a known pglite-socket concurrency bug is still there.
#
# A thin wrapper for probe-pglite-concurrency.ts, which is where the writeup is:
# what it asks, and why its exit code is inverted from a check's — 0 means the
# bug still reproduces, 1 means it may have been fixed.
set -euo pipefail
exec bun run "$(dirname "${BASH_SOURCE[0]}")/probe-pglite-concurrency.ts"
