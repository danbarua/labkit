#!/usr/bin/env bash
# Runs what Cloud Build runs, locally, on a worker-sized machine.
#
# `bun run test:in-docker`. Exists because "works on my machine" was the honest
# answer to a red CI build and was not useful: `bun run check` and
# `bun run test:pg` both passed here while the build failed on a hook timeout.
#
# **The resource limits are the point, not the container.** A Cloud Build
# default worker is an `e2-standard-2` — 2 vCPU, 8GB — and this machine has ten
# cores. Running the same image unconstrained reproduces the environment and not
# the failure, which is the half that matters: LabKit's suite is timing
# sensitive (CLAUDE.md carries the measurements, including that it fails at a
# 3000ms ceiling and passes at 5000ms), so cores are the variable that decides
# whether a hook beats bun's clock. `--cpus` and `--memory` default to the
# worker's shape and can be overridden:
#
#     LABKIT_CI_CPUS=4 bun run test:in-docker      # less strict
#     LABKIT_CI_CPUS=1 bun run test:in-docker      # more
#
# **It tests a copy, not this directory.** A `git clone` gives the container a
# real `.git` — several checks shell out to git, and one of them refuses rather
# than passing when git is absent — and mounting this tree directly cannot: a
# git *worktree* has a `.git` file pointing at a path that exists only on the
# host, so git inside the container reports "not a git repository". The working
# tree is then copied over the clone, so uncommitted changes are what gets
# tested. That is the difference from CI, which checks out a commit; anything
# you have not committed is yours alone.
#
# Mirrors `cloudbuild.test.yaml` step for step. When the two disagree, that file
# is the one CI actually runs.
#
# Usage: bun run test:in-docker [--gate-only]
# Exit:  0 when everything CI runs passes here.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cpus="${LABKIT_CI_CPUS:-2}"
memory="${LABKIT_CI_MEMORY:-8g}"
gate_only="${1:-}"

work="$(mktemp -d "${TMPDIR:-/tmp}/labkit-ci.XXXXXX")"
net="labkit-ci-$$"
cleanup() {
  docker rm -f "labkit-pg-$$" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

echo "test:in-docker: ${cpus} cpus, ${memory} memory — a Cloud Build worker is 2/8g"

# A real clone, then the working tree over it. See the header.
git clone -q "file://$root" "$work/repo"
rsync -a --exclude .git --exclude node_modules --exclude bin --exclude .labkit \
  "$root/" "$work/repo/"

echo "test:in-docker: building the CI image"
docker build -q -t labkit-ci "$root/docker/ci" > /dev/null

run_in_ci() {
  docker run --rm \
    --cpus="$cpus" --memory="$memory" \
    --network="$net" \
    -v "$work/repo:/workspace" -w /workspace \
    "$@"
}

docker network create "$net" > /dev/null

if [ "$gate_only" != "--gate-only" ]; then
  echo "test:in-docker: starting postgres"
  docker build -q -t labkit-pg "$root/docker/postgres" > /dev/null
  docker run -d --name "labkit-pg-$$" --network="$net" \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=agens -e POSTGRES_DB=postgres \
    labkit-pg > /dev/null
fi

echo
echo "test:in-docker: bun run check"
run_in_ci labkit-ci bash -c 'set -e; bun install --frozen-lockfile; bun run check'
status=$?

if [ "$gate_only" != "--gate-only" ] && [ "$status" -eq 0 ]; then
  echo
  echo "test:in-docker: bun run test:pg"
  # The same readiness wait cloudbuild.test.yaml does, and for the same reason:
  # with LABKIT_DB_URL pre-set, scripts/test-postgres.sh skips its own.
  run_in_ci -e "LABKIT_DB_URL=postgres://postgres:agens@labkit-pg-$$:5432/labkit_tests" \
    labkit-ci bash -c '
      set -e
      for _ in $(seq 1 60); do
        if bun -e "const {Client}=require(\"pg\");const c=new Client({connectionString:process.env.LABKIT_DB_URL});c.connect().then(()=>c.end()).then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
          break
        fi
        sleep 1
      done
      bun run test:pg'
  status=$?
fi

echo
if [ "$status" -eq 0 ]; then
  echo "OK: everything CI runs passes at ${cpus} cpus."
else
  echo "FAILED at ${cpus} cpus. This is what the build sees; raise LABKIT_CI_CPUS to find the margin."
fi
exit "$status"
