# One service account per workload, each with the narrowest role set that works.

resource "google_service_account" "preview_api" {
  project      = var.project_id
  account_id   = "${var.preview_api_service_name}-sa"
  display_name = "preview-api Cloud Run runtime"
  description  = "Runs preview-api. Only calls Vertex AI; reads one secret (Turnstile)."
}

resource "google_service_account" "leads_api" {
  project      = var.project_id
  account_id   = "${var.leads_api_service_name}-sa"
  display_name = "leads-api Cloud Run runtime"
  description  = "Runs leads-api. Firestore user; reads the Postmark, Turnstile and session-key secrets."
}

resource "google_service_account" "scheduler" {
  project      = var.project_id
  account_id   = "leads-scheduler-sa"
  display_name = "Cloud Scheduler invoker for leads-api"
  description  = "Identity Cloud Scheduler uses to mint OIDC tokens for leads-api job routes."
}

resource "google_service_account" "cloudbuild" {
  project      = var.project_id
  account_id   = "aftervue-cloudbuild-sa"
  display_name = "Cloud Build for AfterVue images"
  description  = "Builds images, pushes to Artifact Registry, deploys new revisions. Used by infra/cloudbuild.yaml."
}

# --- preview-api: Vertex AI only -------------------------------------------

resource "google_project_iam_member" "preview_api_aiplatform_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = google_service_account.preview_api.member
}

# --- leads-api: Firestore + named secrets ----------------------------------

resource "google_project_iam_member" "leads_api_datastore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = google_service_account.leads_api.member
}

# Secret bindings are per secret (see secrets.tf), never project-wide.
# No roles/cloudscheduler.jobRunner: the service is the target, not the caller.

# --- scheduler: invoke leads-api only --------------------------------------

resource "google_cloud_run_v2_service_iam_member" "scheduler_invokes_leads" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.leads_api.name
  role     = "roles/run.invoker"
  member   = google_service_account.scheduler.member
}

# --- cloud build: push images, deploy revisions ----------------------------

resource "google_artifact_registry_repository_iam_member" "cloudbuild_writer" {
  project    = var.project_id
  location   = google_artifact_registry_repository.docker.location
  repository = google_artifact_registry_repository.docker.name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.cloudbuild.member
}

resource "google_project_iam_member" "cloudbuild_run_developer" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = google_service_account.cloudbuild.member
}

resource "google_project_iam_member" "cloudbuild_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = google_service_account.cloudbuild.member
}

# Deploying a revision that runs as the runtime SA requires actAs on that SA.
resource "google_service_account_iam_member" "cloudbuild_acts_as_preview" {
  service_account_id = google_service_account.preview_api.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.cloudbuild.member
}

resource "google_service_account_iam_member" "cloudbuild_acts_as_leads" {
  service_account_id = google_service_account.leads_api.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.cloudbuild.member
}

# `gcloud builds submit` stages the source in a GCS bucket; a user-specified
# build SA must be able to read it. Scope this to the staging bucket once it
# exists if project-wide object read is too broad for your taste.
resource "google_project_iam_member" "cloudbuild_source_reader" {
  project = var.project_id
  role    = "roles/storage.objectViewer"
  member  = google_service_account.cloudbuild.member
}
