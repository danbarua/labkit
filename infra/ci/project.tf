terraform {
  required_version = ">= 1.15.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.45"
    }
  }
}

# The build project.
#
# **If it already exists, adopt it rather than creating it.** Uncomment the
# import block below for the first apply: without it Terraform plans "will be
# created", and an apply then fails trying to create a project whose id is
# taken. It is the declarative form of `terraform import` — nothing in the cloud
# changes, only state gains a record — and it can be deleted once an apply has
# run.
#
#   import {
#     to = google_project.build_project
#     id = "labkit-build"
#   }
#
# `name` must match the live project's display name exactly if you are
# adopting one, or the adoption will want to rename a real project on your
# behalf.
resource "google_project" "build_project" {
  deletion_policy = "PREVENT"
  name            = var.project_id
  project_id      = var.project_id
  billing_account = var.billing_account_id

  auto_create_network = true
}
