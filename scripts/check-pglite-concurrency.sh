#!/usr/bin/env bash
# Thin wrapper for scripts/check-pglite-concurrency.ts — see that file for
# what this actually checks and why the exit code is inverted from usual.
set -euo pipefail
exec bun run "$(dirname "${BASH_SOURCE[0]}")/check-pglite-concurrency.ts"
