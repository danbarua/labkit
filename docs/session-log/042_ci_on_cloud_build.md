# 042: CI on Cloud Build

**Session wrap, 2026-08-26, on `chore/ci-infra`.** Not a decision record — the
arguments live in `cloudbuild.test.yaml`'s header, `docker/ci/Dockerfile` and
`infra/ci/README.md`.

Baseline `7fbc84f`, the squash-merge of PR #29. Open as **PR #30**. Dan ran the
first `terraform apply` mid-session; the two `infra` commits below are its
fallout.

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

**`85bcdb1` — order the service account after the IAM API settles.**

- `infra/ci/service_accounts.tf` — a `time_sleep.apis_settle` between enabling
  the APIs and creating the service account, which the account now depends on.
- `infra/ci/project.tf` — declares `hashicorp/time`.
- `infra/ci/README.md` — the failure, and the two ways its error message
  misleads.

**`128d97f` — make apply say which project it acted on.**

- `infra/ci/outputs.tf` — a `target_project` output.

**`f204359` — a PR trigger cannot be run by hand.**

- `infra/ci/README.md` — how to smoke-test one, given that you cannot.

Working tree clean at `f204359`; pushed.

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

**The first `terraform apply` ran, and got most of the way.** It created the
project `labkit-build` (number 408778432826), linked billing and enabled all
three APIs, then failed:

```
Error creating service account: googleapi: Error 403:
Permission iam.serviceAccounts.create
```

Diagnosed from three read-only facts rather than from the message: everything
created had landed in `labkit-build` and nothing in `agent-bus-build`;
`danbarua@gmail.com` holds `roles/owner` there; and an ADC-authenticated IAM
call against the project returned **200** minutes later. So it was a race —
`google_service_account` declared no dependency on `google_project_service`, so
Terraform created it in parallel with enabling `iam.googleapis.com`, and
enabling a Google API returns before the enablement is usable.

`terraform validate` clean and `terraform plan` against the real state is **4 to
add, 0 to change, 0 to destroy** — the project and APIs already in state are
untouched, so a re-apply is safe.

**The infrastructure is up.** The second apply — after connecting the repository
in the console, which failed the first as the README predicted — completed:
project, three APIs, the `time_sleep`, the service account, its log-writer role
and the trigger. `terraform output` reports
`target_project = "labkit-build"` and
`ci_test_email = "labkit-build-ci-test@labkit-build.iam.gserviceaccount.com"`.

**The trigger existed with zero builds, and that is not the same as working.**
PR #30 was opened before it, so no pull-request event had ever reached it, and
`gcloud builds triggers run` refuses:
`RunTrigger is not supported for GitHub PullRequest Triggers`. Pushing `f204359`
to the branch fired it. Build `9907cb31` started and was **still `WORKING`** when
this entry was written.

**So no Cloud Build run has completed.** The timeout in `cloudbuild.test.yaml`
is generous and says in the file that it is unmeasured; that stays true until a
build finishes.

## Open

**No Cloud Build run has finished yet.** Everything about the build is verified
locally — the gate in `oven/bun:1.3.14`, the sidecar on a real docker network —
and nothing about it is verified on a Cloud Build worker. The two questions
that only a real run answers: whether the Postgres sidecar behaves the same on
`--network=cloudbuild` there as it does locally, and what the steps actually
cost. **Replace the timeout's unmeasured note with real figures once one
lands.**

**The error message misleads in two directions, both now written down.** It was
first read as an apply run under the wrong `gcloud config` — and the active
gcloud project decides nothing here, since `providers.tf` pins the target to
`var.project_id`. Three separate things are in play and only the first chooses
where resources go: `var.project_id`, the ADC credential, and ADC's *quota*
project (which was a third project again, `bonsai-504422`). And a 403 naming a
permission the caller demonstrably holds reads as an IAM problem rather than a
timing one.

**A PR trigger cannot see upstream drift.** A new `oven/bun` or `apache/age`
tag, or a dependency resolving differently, breaks nothing until someone
commits. Catching that wants a scheduled build, which does not exist. Named in
`infra/ci/README.md`.

The rest of `docs/TASKS.md` is untouched: the documents group (a pinned DX
Principles header, a CLAUDE.md stale-prose sweep, `docs/persistence.md`) and the
DB-layer loose ends.

## Next

Read the first build:

```sh
gcloud builds list --project labkit-build --region us-central1 --limit 3
gcloud builds log 9907cb31-be98-49e6-9117-9fe01cab43a6 \
  --project labkit-build --region us-central1
```

If it is green, put its per-step timings into `cloudbuild.test.yaml`'s closing
comment in place of the unmeasured note. If it is red, the step that failed
says which of the local simulations did not transfer.

Then PR #30 awaits review, and after it the documents group in `docs/TASKS.md`,
starting by reading `~/Code/agents/agent-bus/AGENTS.md` for the pinned-header
shape.
