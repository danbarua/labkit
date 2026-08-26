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

## Known gap

A pull-request trigger catches **your** changes breaking the build. It cannot
see upstream drift — a new `oven/bun` or `apache/age` tag, a dependency
resolving differently — because no commit here causes it. Catching that wants a
scheduled build, which does not exist.
