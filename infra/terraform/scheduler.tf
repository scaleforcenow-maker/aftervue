# Lead-management nudges. Every job POSTs to leads-api with an OIDC token minted
# for the scheduler service account; the audience is the service URL, which is
# what Cloud Run's IAM check expects. The application must still verify the
# token's email equals SCHEDULER_SA_EMAIL on /internal/* routes (defence in depth).

resource "google_cloud_scheduler_job" "leads_jobs" {
  for_each = var.scheduler_jobs

  project     = var.project_id
  region      = var.region
  name        = "leads-${each.key}"
  description = each.value.description
  schedule    = each.value.schedule
  time_zone   = var.scheduler_time_zone

  attempt_deadline = "180s"

  retry_config {
    retry_count          = 2
    min_backoff_duration = "30s"
    max_backoff_duration = "300s"
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.leads_api.uri}${each.value.path}"
    body        = base64encode(jsonencode({ job = each.key }))

    headers = {
      "Content-Type" = "application/json"
      "User-Agent"   = "Google-Cloud-Scheduler"
    }

    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.leads_api.uri
    }
  }

  depends_on = [
    google_project_service.apis,
    google_cloud_run_v2_service_iam_member.scheduler_invokes_leads,
  ]
}
