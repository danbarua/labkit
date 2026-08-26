# 042: CI on Cloud Build

**Session wrap, 2026-08-26, on `chore/ci-infra`.** Not a decision record — the
arguments live in `cloudbuild.test.yaml`'s header, `docker/ci/Dockerfile` and
`infra/ci/README.md`.

Baseline `7fbc84f`, the squash-merge of PR #29. Open as **PR #30**.

## Goal

The first item of `docs/TASKS.md`'s CI group: adapt `agent-bus`'s `infra/ci`
terraform and `cloudbuild.*.yaml` set to TypeScript/Bun, so `bun run test:pg`
gets a watcher.

## Changed

**`045e669` — a check that passed because its tool was missing.**

- `scripts/check-no-tracked-symlinks.sh` — refuses when `git` is absent instead
  of printing `OK`. The `|| true` that hid it is gone, and `git rev-parse` no
  longer falls back to `pwd`.
- `scripts/check-all.ts`, `scripts/update-dependency-graph.sh`, `CLAUDE.md`,
  `.claude/skills/wrap/SKILL.md` — `npx depcruise` becomes `bunx depcruise`.

**`bb2601c` — run the gates on Cloud Build.**

- `cloudbuild.test.yaml` **new** — four steps: build the CI image, start
  Postgres on the `cloudbuild` network, `bun run check`, `bun run test:pg`
  against the sidecar.
- `docker/ci/Dockerfile` **new** — `oven/bun:1.3.14` plus git.
- `infra/ci/` **new** — `project.tf`, `providers.tf`, `variables.tf`, `apis.tf`,
  `service_accounts.tf`, `triggers.tf`, `outputs.tf`,
  `terraform.tfvars.example`, `README.md`, and a committed
  `.terraform.lock.hcl`.
- `scripts/test-postgres.sh` — the closing line no longer tells a CI reader to
  run `docker compose down` on a container it never started.
- `.gitignore` — tfvars, state and `.terraform/`; the lock file deliberately not.
- `CLAUDE.md`.

Working tree clean at `bb2601c`; pushed.

## Verified

Everything below was run before the file it justifies was written, or because
writing it went wrong.

- **The gate runs in `oven/bun:1.3.14`** — all 16 checks green against a real
  clone, ~112s in-image. That image ships **no `git`** and **no `npx`** (`node`
  is present, `bunx` is present).
- **`bunx depcruise` is identical to `npx depcruise`** — 140 modules, 468
  dependencies either way.
- **The symlink check's negative control**: it fails in the bare image and
  passes locally. Before the fix it printed `OK` in both.
- **The sidecar pattern works**, run locally on a real `cloudbuild` docker
  network with the config's own commands: image built, Postgres started, wait
  loop tripped, **365 pass / 4 skip / 0 fail** against it.
- `terraform fmt -check` and `terraform validate` — both clean, Terraform
  v1.15.8.
- `bun run check` all 16 and `bun run test:pg` 365/4/0 locally after the
  `bunx` change.
- `.gitignore` behaviour asserted with `git check-ignore`: tfvars, state and
  `.terraform/` ignored, `.terraform.lock.hcl` tracked.

**Nothing has run on Cloud Build.** The timeout is generous and says in the file
that it is unmeasured.

## Open

**One step terraform cannot do, and it fails the first apply if skipped**: the
repository must be connected to Cloud Build in the console, in the same region
as the trigger. `infra/ci/README.md` leads with it, along with the `import`
block for adopting a `labkit-build` project that already exists.

**A PR trigger cannot see upstream drift.** A new `oven/bun` or `apache/age`
tag, or a dependency resolving differently, breaks nothing until someone
commits. Catching that wants a scheduled build, which does not exist. Named in
`infra/ci/README.md`.

The rest of `docs/TASKS.md` is untouched: the documents group (a pinned DX
Principles header, a CLAUDE.md stale-prose sweep, `docs/persistence.md`) and the
DB-layer loose ends.

## Next

PR #30 awaits review, and `terraform apply` in `infra/ci` after the console
connection — see `infra/ci/README.md`.

Then the documents group in `docs/TASKS.md`, starting by reading
`~/Code/agents/agent-bus/AGENTS.md` for the pinned-header shape.
