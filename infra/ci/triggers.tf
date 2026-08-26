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
