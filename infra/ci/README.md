# CI infrastructure

Terraform for the Google Cloud Build project that runs LabKit's gates on every
pull request to `main`. Adapted from `agent-bus`'s `infra/ci`, cut down to the
one privilege level LabKit actually has.

What it creates: a project, three APIs, one service account that can write logs
and nothing else, and one trigger pointing at
[`cloudbuild.test.yaml`](../../cloudbuild.test.yaml).

## Before the first apply

Three things Terraform cannot do for you, and the first is the one that bites.

**1. Connect the repository to Cloud Build, in the console, in the same
region.** A `google_cloudbuild_trigger` with a `github` block fails its first
apply with a repository-mapping error unless the repo is already connected in
that project *and* that region. This is the classic first-apply failure and
there is no Terraform resource that substitutes for the GitHub App install:

> Cloud Build → Triggers → Manage repositories → Connect repository

`var.region` must match the region you connect in.

**2. Decide whether the project already exists.** If `labkit-build` was created
by hand, uncomment the `import` block in `project.tf` for the first apply —
otherwise Terraform plans to *create* a project whose id is taken and the apply
fails on that resource. Match `name` to the live display name, or adoption will
rename a real project on your behalf.

**3. Fill in `terraform.tfvars`.** Copy `terraform.tfvars.example` and supply the
billing account id. That file is gitignored.

## Applying

```sh
cd infra/ci
terraform init
terraform plan     # read it
terraform apply
```

**The active `gcloud config` project does not decide where anything goes.**
`providers.tf` pins the project to `var.project_id`, so an apply run with some
other project selected still creates everything in `labkit-build`. Confirmed the
hard way on 2026-08-26, when an apply under the wrong config was assumed to have
put resources in the wrong project and had not.

What *is* taken from your environment is the credential: Application Default
Credentials, and its **quota project**, which is a third thing again and set by
`gcloud auth application-default set-quota-project`.

### If a first apply 403s on the service account

```
Error creating service account: googleapi: Error 403:
Permission iam.serviceAccounts.create
```

on an account holding `roles/owner`. This was a race — the apply enabled
`iam.googleapis.com` and created the service account in parallel, and enabling a
Google API returns before the enablement is usable. `service_accounts.tf` now
waits (`time_sleep.apis_settle`), so it should not recur; **re-running
`terraform apply` is the fix if it does**, since the project and APIs are
already in state and a second run finds them settled.

### Smoke-testing the trigger

There is no way to run it by hand:

```
ERROR: (gcloud.builds.triggers.run) INVALID_ARGUMENT:
RunTrigger is not supported for GitHub PullRequest Triggers
```

A pull-request trigger fires on pull-request events only — opened, or a new
commit pushed to the branch. So a trigger created *while a PR is already open*
has nothing to react to and will sit with zero builds until the next push, which
looks identical to a trigger that does not work. Push a commit to the branch to
find out which.

## What runs, and what does not

`cloudbuild.test.yaml` runs `bun run check` and `bun run test:pg`, in one
trigger. Its own header argues why one rather than three; the short version is
that both arms are cheap and secret-free, and the Postgres image is not
separable because the `test:pg` arm builds it every run.

**`test:pg` is the reason this exists.** `bun run check` is a command anyone can
run; `test:pg` needs a Postgres container, is excluded from the sweep on
purpose, and until this trigger existed had no watcher at all. It is also the
only backend on which two connections can be live at once, so anything about
roles, tenancy or privileges can only be settled there.

Deliberately absent, both present in the repo this came from:

- **A publish trigger.** LabKit publishes nothing. `bin/labkit` is built and
  proven by `check:binary`, and released nowhere.
- **A manual, paid tier.** No LabKit test costs money.

Also absent: Secret Manager. Nothing reads a secret, and an API enabled "for
later" is a surface nobody watches.

## What it costs

Measured on the first green run, 2026-08-26 (build `9907cb31`): **394s total**,
1s queued. `ci-image` 20s, `postgres` 12s, `check` 208s, `test-pg` 153s.

A Cloud Build worker is roughly **twice as slow as a developer's machine** on
both suites — the same work is ~112s and ~55s locally. Worth knowing before
adding anything to the gate: whatever it costs you, it costs CI double.

## What does not build

`test-on-pr` carries an `ignored_files` denylist: a pull request touching only
`docs/`, `CLAUDE.md`, `README.md`, `.claude/` or `LICENSE` runs no build. A
build cannot fail on prose, and one that can only ever be green trains you to
stop reading it.

**`docs/**` wholesale, with no exceptions**, and the first version of this list
had one. `docs/mcp-tools.md` is generated, and a test asserted the checked-in
copy matched its generator — so the list named paths individually to keep that
file building. Both are gone. A path filter with a load-bearing exception breaks
silently the first time someone renames a file, and the breakage looks exactly
like a trigger with nothing to do.

A denylist rather than `included_files` on purpose: an allowlist gives no CI to
whatever it forgets to name. This way anything new defaults to building.

**One thing to know about the semantics, and it is not verified here:** the
filter is evaluated against the files a pull request changes, so a PR that
contains code *and* a wrap entry still builds. It skips docs-only pull requests,
not docs-only pushes onto a code PR.

## Known gap

A pull-request trigger catches **your** changes breaking the build. It cannot
see upstream drift — a new `oven/bun` or `apache/age` tag, a dependency
resolving differently — because no commit here causes it. Catching that wants a
scheduled build, which does not exist.
