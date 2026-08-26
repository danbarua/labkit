# The image `bun run check` runs in on Cloud Build.
#
# `oven/bun` plus **git**, which is the whole of the difference and was found by
# running the gate in the bare image rather than by reading its manifest:
#
#   git   NO   -> `check:no-tracked-symlinks` runs `git ls-files`, and
#                 `check:cli` drives the CLI whose `gitContext` shells out.
#   node  yes  -> present, surprisingly, but
#   npx   NO   -> so `npx depcruise` died. The repo uses `bunx` now; verified
#                 identical output, and it removes a runtime rather than adding
#                 one.
#
# **A dedicated image rather than `apt-get` in each step.** Two steps need git —
# the gate and the Postgres arm — and installing it twice is two network round
# trips that can fail for reasons unrelated to the change under test. Built once
# per build, used by both, never pushed: like `cloudbuild.image.yaml` in the
# repo this pattern came from, the value is entirely in whether the build
# succeeds.
#
# The bun tag is pinned, as `docker/postgres` pins its base. Bump it in step
# with `package.json`'s engines and the version CLAUDE.md names.
FROM oven/bun:1.3.14

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# Cloud Build checks the repo out as root into /workspace; git refuses to
# operate on a tree it thinks belongs to someone else, and the failure reads
# like a missing repository rather than a permissions one.
RUN git config --global --add safe.directory /workspace
