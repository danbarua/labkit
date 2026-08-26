# **What this apply acted on**, echoed because nothing else says it plainly.
#
# The active `gcloud config` project is not it — `providers.tf` pins the target
# to `var.project_id`, so a shell prompt showing the gcloud project during a
# terraform run displays a fact with no bearing on where resources go, and reads
# as though it had one. That misdirection cost a diagnosis on 2026-08-26.
#
# `terraform plan` already prints `project = "..."` on every resource; this is
# the one-line version, and it prints on apply where the plan output has
# scrolled away.
output "target_project" {
  description = "The project everything here was created in. Not the gcloud config's project."
  value       = google_project.build_project.project_id
}

output "ci_test_email" {
  description = "The identity the pull-request trigger runs as. Holds roles/logging.logWriter and nothing else."
  value       = google_service_account.ci_test.email
}
