#!/usr/bin/env bash
# Thin wrapper for scripts/probe-pglite-concurrency.ts — see that file for
# what this actually asks and why its exit code is inverted from a check's.
set -euo pipefail
exec bun run "$(dirname "${BASH_SOURCE[0]}")/probe-pglite-concurrency.ts"
