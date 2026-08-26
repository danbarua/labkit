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

  # **Prose does not run the tests.** A commit that only touches a journal entry,
  # a session log or CLAUDE.md cannot fail `bun run check`, and a build that can
  # only ever be green is ceremony — worse, it trains you to stop reading the
  # signal. A build is ~394s and every push to an open PR fires one, including
  # the wrap entries this repo commits as it goes.
  #
  # **`ignored_files`, not `included_files`, and the direction is the point.**
  # `included_files` is an allowlist: whatever it fails to name gets no CI, so a
  # directory added next year is silently unbuilt. This is a denylist: it names
  # what is inert, and anything new defaults to building. Fail-safe rather than
  # fail-open, which matters because the failure is invisible either way — a
  # trigger that does not fire looks exactly like one that has nothing to do.
  #
  # The repo this pattern came from scopes its *image* build this way and leaves
  # its test build unfiltered. The asymmetry here is deliberate: the question
  # there was "which few files shape the image", and the question here is the
  # mirror of it.
  #
  # **`docs/mcp-tools.md` is deliberately absent from this list.** It is
  # generated from the tool declarations and `tests/mcp.test.ts` asserts the
  # checked-in file equals what the generator produces, so a hand-edit to it
  # *should* fail the build. That is the whole reason this is an explicit list
  # of paths rather than `docs/**`.
  #
  # Everything else under `docs/` is either a dated record that cannot go stale
  # (`project-journal/`, `session-log/`, `consumer-contract/`) or prose no test
  # reads. `docs/dependency-graph.mmd` is here because CLAUDE.md says plainly
  # that it is not a gate and never was.
  ignored_files = [
    "docs/project-journal/**",
    "docs/session-log/**",
    "docs/consumer-contract/**",
    "docs/mcp-server/**",
    "docs/TASKS.md",
    "docs/GLOSSARY.md",
    "docs/persistence-spikes.md",
    "docs/dependency-graph.mmd",
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
