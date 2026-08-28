# Run every gate on pull requests to main.
#
# **One trigger, and `cloudbuild.test.yaml` says why** — both arms are cheap and
# secret-free, and the image build is not separable because the Postgres arm
# builds it every run regardless. Split when something starts being skipped.
#
# There is no publish trigger and no manual tier: LabKit publishes nothing and
# has no test that costs money. Both exist in the repo this was adapted from and
# neither has a consumer here.
resource "google_cloudbuild_trigger" "test_on_pr" {
  description = "Run bun run check and test:pg on PRs to main"
  disabled    = false
  filename    = "cloudbuild.test.yaml"
  location    = var.region
  name        = "test-on-pr"
  project     = var.project_id

  service_account = "projects/${var.project_id}/serviceAccounts/${google_service_account.ci_test.email}"

  depends_on = [
    google_project_service.ci,
    google_project_iam_member.test_log_writer,
  ]

  # **Prose does not run the tests.** Nothing under `docs/` can fail
  # `bun run check`, and a build that can only ever be green is ceremony — worse,
  # it trains you to stop reading the signal. Each build is ~394s and every push
  # to an open PR fires one, including the wrap entries this repo commits as it
  # goes.
  #
  # **`docs/**` wholesale, with no exceptions.** The first version of this list
  # named paths individually so that `docs/mcp-tools.md` would keep building — a
  # test asserted the checked-in copy matched its generator. That coupling is
  # gone (the test with it), and the list is better for it: a path-based filter
  # with one load-bearing exception breaks silently when a file is renamed, and
  # the breakage looks exactly like a trigger with nothing to do.
  #
  # **`ignored_files`, not `included_files`, and the direction is the point.**
  # An allowlist gives no CI to whatever it fails to name, so a directory added
  # next year is silently unbuilt. This names what is inert; anything new
  # defaults to building. Fail-safe rather than fail-open.
  #
  # The repo this pattern came from scopes its *image* build this way and leaves
  # its test build unfiltered. The asymmetry is deliberate: the question there
  # was "which few files shape the image", and this is the mirror of it.
  ignored_files = [
    "docs/**",
    "CLAUDE.md",
    "README.md",
    ".claude/**",
    "LICENSE",
  ]

  approval_config {
    approval_required = false
  }

  github {
    name  = var.github_repo
    owner = var.github_owner
    pull_request {
      branch = var.trigger_branch_regex

      # Your own PRs build immediately; a PR from a fork waits for an owner to
      # comment `/gcbrun`. Without this, a fork PR runs its own build config on
      # this project's billing account the moment it is opened -- and LabKit is
      # a public repo.
      comment_control = "COMMENTS_ENABLED_FOR_EXTERNAL_CONTRIBUTORS_ONLY"
      invert_regex    = false
    }
  }
}

# Run `test:pg` on the pull requests that could plausibly change its answer.
#
# **Split from `test_on_pr` on 2026-08-28**, licensed by that trigger's own
# rule: *"split when something starts being skipped, not before"*. `test:pg` is
# ~153s of a ~394s build, and `cloudbuild.pg.yaml` argues why it does not earn
# that on every PR — measured 2026-08-28, the suite has exactly one `skipIf` and
# it skips *on* Postgres, so **no test requires a real Postgres**. The arm is a
# disagreeing measurement between two decoders, not extra coverage.
#
# **`included_files` here, `ignored_files` there, and the asymmetry is the
# point.** `test_on_pr` argues that an allowlist gives no CI to whatever it
# fails to name, so a directory added next year is silently unbuilt. That is
# right for a gate whose absence means *nothing ran*. It does not apply here,
# because this arm has a second trigger: anything this filter fails to name is
# still built on merge to main by `pg_on_main` below. The filter decides
# **when** the Postgres arm runs, never **whether**, so it is fail-late rather
# than fail-open.
#
# `src/db/**` and `drizzle/**` are named because they are where the two backends
# can disagree: the decoders, the connection layer, and the migrations. A change
# to `src/domain/` reaches Postgres only through them.
resource "google_cloudbuild_trigger" "pg_on_pr" {
  description = "Run test:pg on PRs touching the persistence layer"
  disabled    = false
  filename    = "cloudbuild.pg.yaml"
  location    = var.region
  name        = "pg-on-pr"
  project     = var.project_id

  service_account = "projects/${var.project_id}/serviceAccounts/${google_service_account.ci_test.email}"

  depends_on = [
    google_project_service.ci,
    google_project_iam_member.test_log_writer,
  ]

  included_files = [
    "src/db/**",
    "drizzle/**",
    "docker/postgres/**",
    "cloudbuild.pg.yaml",
    "scripts/test-postgres.sh",
  ]

  approval_config {
    approval_required = false
  }

  github {
    name  = var.github_repo
    owner = var.github_owner
    pull_request {
      branch          = var.trigger_branch_regex
      comment_control = "COMMENTS_ENABLED_FOR_EXTERNAL_CONTRIBUTORS_ONLY"
      invert_regex    = false
    }
  }
}

# Run `test:pg` on every merge to main, unfiltered.
#
# **This is the trigger that makes `pg_on_pr`'s allowlist safe**, so the two are
# a pair and neither should be removed without the other. Whatever the PR filter
# does not name is caught here.
#
# **What that costs, stated so it is not discovered.** A failure arrives *after*
# the merge, when the branch is gone and the author has moved on — and in this
# repo a push to a squash-merged branch **succeeds and reaches nothing**, which
# is what `.githooks/pre-push` exists to refuse. So a red main here means a
# fresh PR, never a push to the branch that caused it. Accepted deliberately:
# the alternative is ~153s on every pull request to find out earlier about a
# divergence that has never been observed.
#
# No `included_files`: a merge to main is the one place this should be
# unconditional, and it runs at most once per PR rather than once per push.
resource "google_cloudbuild_trigger" "pg_on_main" {
  description = "Run test:pg on every merge to main"
  disabled    = false
  filename    = "cloudbuild.pg.yaml"
  location    = var.region
  name        = "pg-on-main"
  project     = var.project_id

  service_account = "projects/${var.project_id}/serviceAccounts/${google_service_account.ci_test.email}"

  depends_on = [
    google_project_service.ci,
    google_project_iam_member.test_log_writer,
  ]

  approval_config {
    approval_required = false
  }

  github {
    name  = var.github_repo
    owner = var.github_owner
    push {
      branch       = var.trigger_branch_regex
      invert_regex = false
    }
  }
}
