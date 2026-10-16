locals {
  preview_host = trimprefix(google_cloud_run_v2_service.preview_api.uri, "https://")
  leads_host   = trimprefix(google_cloud_run_v2_service.leads_api.uri, "https://")

  # Cloud Monitoring's uptime-check service agent. It must hold roles/run.invoker
  # on an IAM-gated service for an authenticated /healthz check to succeed.
  monitoring_agent = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-monitoring-notification.iam.gserviceaccount.com"
}

resource "google_monitoring_uptime_check_config" "preview_api" {
  project      = var.project_id
  display_name = "${var.preview_api_service_name} /healthz"
  timeout      = "10s"
  period       = var.uptime_check_period

  http_check {
    path           = "/healthz"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"

    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = local.preview_host
    }
  }

  selected_regions = ["USA_OREGON", "USA_IOWA", "USA_VIRGINIA"]

  depends_on = [google_project_service.apis]
}

# leads-api is IAM-gated by default, so the checker authenticates with an OIDC
# token from the Monitoring service agent. If the agent does not exist yet on a
# brand-new project, run once:
#   gcloud beta services identity create --service=monitoring.googleapis.com --project "$PROJECT_ID"
resource "google_cloud_run_v2_service_iam_member" "monitoring_invokes_leads" {
  count = var.leads_api_allow_unauthenticated ? 0 : 1

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.leads_api.name
  role     = "roles/run.invoker"
  member   = local.monitoring_agent
}

resource "google_monitoring_uptime_check_config" "leads_api" {
  project      = var.project_id
  display_name = "${var.leads_api_service_name} /healthz"
  timeout      = "10s"
  period       = var.uptime_check_period

  http_check {
    path           = "/healthz"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"

    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }

    dynamic "service_agent_authentication" {
      for_each = var.leads_api_allow_unauthenticated ? [] : [1]
      content {
        type = "OIDC_TOKEN"
      }
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = local.leads_host
    }
  }

  selected_regions = ["USA_OREGON", "USA_IOWA", "USA_VIRGINIA"]

  depends_on = [
    google_project_service.apis,
    google_cloud_run_v2_service_iam_member.monitoring_invokes_leads,
  ]
}

resource "google_monitoring_alert_policy" "uptime" {
  for_each = length(var.notification_channel_ids) > 0 ? {
    preview = google_monitoring_uptime_check_config.preview_api
    leads   = google_monitoring_uptime_check_config.leads_api
  } : {}

  project      = var.project_id
  display_name = "Uptime failed: ${each.value.display_name}"
  combiner     = "OR"

  conditions {
    display_name = "healthz failing from 2+ regions"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${each.value.uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "600s"

      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = var.notification_channel_ids

  alert_strategy {
    auto_close = "1800s"
  }
}
