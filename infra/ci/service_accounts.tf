# **One identity, because there is one privilege level.**
#
# The repo this pattern came from has three service accounts — a publisher that
# can mint a PyPI token, a secret reader for its paid end-to-end tier, and a
# powerless one for pull requests — because it has three privilege levels.
# LabKit has one: write a log line. Copying three accounts across would be
# ceremony; what transfers is the reason the powerless one exists.
#
# That reason: **a pull-request trigger executes the build config from the
# contributor's branch.** On a public repo, anyone who can open a PR can propose
# arbitrary build steps, and whatever this account can do, they can do. It can
# write logs. If a PR build is compromised, the blast radius is a log line.
#
# A second account gets created by the change that needs one — something to
# publish, or a secret to read — and not before.
resource "google_service_account" "ci_test" {
  account_id   = "${var.project_id}-ci-test"
  display_name = "LabKit PR test runner"
  description  = "Runs the gate on pull requests. Deliberately cannot do anything else."

  # **Without this the first apply fails**, and it did:
  #
  #   Error creating service account: googleapi: Error 403:
  #   Permission iam.serviceAccounts.create
  #
  # on an account that holds roles/owner on the project. Nothing here referenced
  # `google_project_service.ci`, so Terraform had no reason to order the two and
  # created the service account in parallel with enabling `iam.googleapis.com`.
  # The trigger in triggers.tf already declared the dependency; this did not,
  # which is the sort of asymmetry that only shows up on a genuinely empty
  # project.
  depends_on = [time_sleep.apis_settle]
}

# **`depends_on` on the API is necessary and not sufficient**, which is why this
# exists rather than a direct dependency on `google_project_service.ci`.
# Enabling a Google API returns before the enablement is usable: the call
# succeeds, and an IAM write moments later still 403s. Terraform has no way to
# wait for eventual consistency, so the wait is explicit.
#
# Thirty seconds is a guess sized to the one failure observed, not a measured
# figure. It costs half a minute on a first apply and nothing on any later one,
# since the resource is only created once.
resource "time_sleep" "apis_settle" {
  depends_on      = [google_project_service.ci]
  create_duration = "30s"
}

# The one role, and it is not optional. A build service account with no roles at
# all cannot write logs, and `logging: CLOUD_LOGGING_ONLY` then fails the build
# with a permissions error that reads as though the build config were wrong.
resource "google_project_iam_member" "test_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.ci_test.email}"
}
