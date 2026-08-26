#!/usr/bin/env bash
# Compiles src/cli/cli.ts to bin/labkit, from a scratch directory.
#
# **`bun build --compile` leaves a 61MB file behind on every successful run**,
# and the scratch directory is the whole reason this is a script rather than the
# `package.json` one-liner it used to be.
#
# What it leaves is a **byte-identical copy of the `bun` binary itself** —
# verified by sha256, against `bun --version` 1.3.14 — named
# `.<hash>-00000000.bun-build`. Bun stages its own runtime, appends the bundle
# to produce the outfile, and never removes the staged copy. It is not a crash
# artefact and not a cache: the hash differs per build, so they accumulate, and
# they are `.gitignore`d, so nothing complains while they do. Thirty-two of them
# had reached **1.9GB** in the repo root before anyone noticed the directory
# listing.
#
# The staging path follows the **current working directory**, not `--outfile` —
# measured, by building the same target from a temp directory and watching the
# repo root stay clean. So this builds from a `mktemp -d` that is removed on
# exit, and the leak has nowhere to accumulate. `--outfile` and the entrypoint
# are absolute for the same reason.
#
# There is no flag for it. `bun build --help` offers nothing about temporary
# files, and `--compile-executable-path` names an input rather than a staging
# location.
#
# Usage: bun run build
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
staging="$(mktemp -d "${TMPDIR:-/tmp}/labkit-build.XXXXXX")"
trap 'rm -rf "$staging"' EXIT

cd "$staging"
bun build --compile --outfile "$root/bin/labkit" "$root/src/cli/cli.ts"
