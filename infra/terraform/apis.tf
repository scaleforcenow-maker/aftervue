locals {
  services = [
    "run.googleapis.com",
    "aiplatform.googleapis.com",
    "firestore.googleapis.com",
    "cloudscheduler.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.services)

  project = var.project_id
  service = each.value

  # Keep APIs on when this module is destroyed; other things in the project may use them.
  disable_on_destroy         = false
  disable_dependent_services = false
}
