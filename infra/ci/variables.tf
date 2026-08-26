variable "billing_account_id" {
  description = "Billing account to link the project to. Held in terraform.tfvars, which is gitignored."
  type        = string
}

variable "project_id" {
  type    = string
  default = "labkit-build"
}

variable "region" {
  description = "Trigger location. Must match the region the GitHub connection was made in -- see README.md."
  type        = string
  default     = "us-central1"
}

variable "github_owner" {
  type    = string
  default = "danbarua"
}

variable "github_repo" {
  type    = string
  default = "labkit"
}

variable "trigger_branch_regex" {
  description = "Which base branches a pull request must target for the build to run."
  type        = string
  default     = "^(main)$"
}
