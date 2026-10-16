provider "google" {
  project = var.project_id
  region  = var.region

  # Credentials are never in this repo. Locally: `gcloud auth application-default login`.
  # From a Claude Code cloud session: export CLOUDSDK_AUTH_ACCESS_TOKEN (one-hour token)
  # and set `access_token = var.access_token` via -var or TF_VAR_access_token (see README).
  access_token = var.access_token != "" ? var.access_token : null

  default_labels = {
    app        = "aftervue"
    managed_by = "terraform"
    env        = var.environment
  }
}

data "google_project" "this" {
  project_id = var.project_id
}
