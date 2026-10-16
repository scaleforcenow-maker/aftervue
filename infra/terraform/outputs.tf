output "preview_api_url" {
  description = "Cloud Run URL for preview-api. Point the Vercel rewrite at this."
  value       = google_cloud_run_v2_service.preview_api.uri
}

output "leads_api_url" {
  description = "Cloud Run URL for leads-api (IAM-gated unless leads_api_allow_unauthenticated=true)."
  value       = google_cloud_run_v2_service.leads_api.uri
}

output "preview_api_service_account" {
  description = "Runtime service account for preview-api."
  value       = google_service_account.preview_api.email
}

output "leads_api_service_account" {
  description = "Runtime service account for leads-api."
  value       = google_service_account.leads_api.email
}

output "scheduler_service_account" {
  description = "Service account Cloud Scheduler uses to call leads-api. The app must check this email on /internal/* routes."
  value       = google_service_account.scheduler.email
}

output "cloudbuild_service_account" {
  description = "Service account to pass to `gcloud builds submit --service-account`."
  value       = google_service_account.cloudbuild.email
}

output "artifact_registry" {
  description = "Image path prefix, e.g. REGION-docker.pkg.dev/PROJECT/REPO."
  value       = local.ar_prefix
}

output "secret_ids" {
  description = "Secret Manager secret IDs created as empty shells."
  value       = [for s in google_secret_manager_secret.secrets : s.secret_id]
}

output "scheduler_jobs" {
  description = "Cloud Scheduler job names and the leads-api paths they call."
  value       = { for k, j in google_cloud_scheduler_job.leads_jobs : j.name => j.http_target[0].uri }
}

output "vertex_location" {
  description = "Location preview-api sends Vertex requests to. 'global' today; see variables.tf for the US-only caveat."
  value       = var.vertex_location
}
