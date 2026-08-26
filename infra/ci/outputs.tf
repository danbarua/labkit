output "ci_test_email" {
  description = "The identity the pull-request trigger runs as. Holds roles/logging.logWriter and nothing else."
  value       = google_service_account.ci_test.email
}
