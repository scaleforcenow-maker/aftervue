locals {
  common_env = {
    NODE_ENV        = "production"
    ALLOWED_ORIGINS = join(",", var.allowed_origins)
    LOG_FORMAT      = "json"
  }

  preview_env = merge(local.common_env, {
    VERTEX_PROJECT_ID = var.project_id
    VERTEX_LOCATION   = var.vertex_location # "global" today; see variables.tf
  }, var.preview_api_env)

  leads_env = merge(local.common_env, {
    GOOGLE_CLOUD_PROJECT = var.project_id
    FIRESTORE_DATABASE   = google_firestore_database.default.name
    TENANTS              = jsonencode(var.tenants)
    SCHEDULER_SA_EMAIL   = google_service_account.scheduler.email
  }, var.leads_api_env)

  preview_secret_env = var.mount_secrets ? {
    TURNSTILE_SECRET = "turnstile-secret"
  } : {}

  leads_secret_env = var.mount_secrets ? {
    POSTMARK_TOKEN      = "postmark-token"
    TURNSTILE_SECRET    = "turnstile-secret"
    SESSION_SIGNING_KEY = "session-signing-key"
  } : {}
}

# ---------------------------------------------------------------------------
# preview-api: /api/generate. Public ingress, self-protected, 60 s budget.
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "preview_api" {
  project  = var.project_id
  name     = var.preview_api_service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  deletion_protection = false

  template {
    service_account = google_service_account.preview_api.email
    timeout         = "${var.preview_api_timeout_seconds}s"

    # Each generation holds a request open for up to a minute; keep fan-in modest.
    max_instance_request_concurrency = 8

    scaling {
      min_instance_count = 0
      max_instance_count = var.preview_api_max_instances
    }

    containers {
      image = var.preview_api_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # CPU is only allocated while a request is being handled ("always allocated" off).
        cpu_idle          = true
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = local.preview_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.preview_secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/healthz"
        }
        initial_delay_seconds = 0
        period_seconds        = 5
        failure_threshold     = 6
        timeout_seconds       = 3
      }

      liveness_probe {
        http_get {
          path = "/healthz"
        }
        period_seconds    = 30
        failure_threshold = 3
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    # Images are rolled by Cloud Build / deploy.sh; Terraform owns everything else.
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.readers,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "preview_api_public" {
  count = var.preview_api_allow_unauthenticated ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.preview_api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---------------------------------------------------------------------------
# leads-api: aftervue-leads. Ingress all, but IAM-gated unless explicitly opened.
# Admin and job routes (/internal/*) are reachable only with a valid identity
# token: Cloud Scheduler's SA (OIDC) or an operator holding roles/run.invoker.
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "leads_api" {
  project  = var.project_id
  name     = var.leads_api_service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  deletion_protection = false

  template {
    service_account = google_service_account.leads_api.email
    timeout         = "${var.leads_api_timeout_seconds}s"

    max_instance_request_concurrency = 40

    scaling {
      min_instance_count = 0
      max_instance_count = var.leads_api_max_instances
    }

    containers {
      image = var.leads_api_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = local.leads_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.leads_secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/healthz"
        }
        initial_delay_seconds = 0
        period_seconds        = 5
        failure_threshold     = 6
        timeout_seconds       = 3
      }

      liveness_probe {
        http_get {
          path = "/healthz"
        }
        period_seconds    = 30
        failure_threshold = 3
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.apis,
    google_firestore_database.default,
    google_secret_manager_secret_iam_member.readers,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "leads_api_public" {
  count = var.leads_api_allow_unauthenticated ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.leads_api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
