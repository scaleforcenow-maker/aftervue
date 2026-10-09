# ---------------------------------------------------------------------------
# Identity and placement. Nothing here has a real default that identifies the
# company's project; every identifier comes from terraform.tfvars or TF_VAR_*.
# ---------------------------------------------------------------------------

variable "project_id" {
  description = "Google Cloud project ID that holds every resource. No default on purpose: the repo is public."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid Google Cloud project ID (6-30 chars, lowercase letters, digits, hyphens)."
  }
}

variable "access_token" {
  description = "Optional OAuth2 access token for the provider (the one-hour CLOUDSDK_AUTH_ACCESS_TOKEN pattern). Leave empty to use Application Default Credentials. Never write it to a file."
  type        = string
  default     = ""
  sensitive   = true
}

variable "region" {
  description = "Region for compute (Cloud Run, Artifact Registry, Cloud Scheduler, Secret Manager replicas). Must be a US region so PHI stays in the United States."
  type        = string
  default     = "us-east4"

  validation {
    condition     = can(regex("^us-", var.region))
    error_message = "region must be a US region (us-*) so that compute stays in the United States."
  }
}

variable "vertex_location" {
  description = <<-EOT
    Location string used by preview-api when it calls Vertex AI generateContent.
    Today the Gemini image models AfterVue uses are served only from the GLOBAL
    endpoint (aiplatform.googleapis.com, location "global"), so this defaults to
    "global" while compute (Cloud Run, Firestore, secrets) stays in var.region.
    Google documents that the global endpoint does not restrict where ML
    processing happens. When the image models become available on a US regional
    or the "us" multi-region endpoint, set this to that location to keep
    inference inside the US. See docs/cloud-run-migration.md.
  EOT
  type        = string
  default     = "global"
}

variable "firestore_location" {
  description = "Firestore location. us-east4 (regional) or nam5 (US multi-region). Both are in the United States."
  type        = string
  default     = "us-east4"

  validation {
    condition     = contains(["us-east4", "nam5"], var.firestore_location)
    error_message = "firestore_location must be \"us-east4\" or \"nam5\"."
  }
}

variable "environment" {
  description = "Environment label (prod, staging). Used for labels and resource names."
  type        = string
  default     = "prod"
}

# ---------------------------------------------------------------------------
# Service names and images
# ---------------------------------------------------------------------------

variable "preview_api_service_name" {
  description = "Cloud Run service name for the image-preview API (/api/generate)."
  type        = string
  default     = "preview-api"
}

variable "leads_api_service_name" {
  description = "Cloud Run service name for the lead-management API (aftervue-leads)."
  type        = string
  default     = "leads-api"
}

variable "artifact_registry_repo" {
  description = "Artifact Registry Docker repository name."
  type        = string
  default     = "aftervue"
}

variable "preview_api_image" {
  description = "Container image for preview-api. Defaults to Google's public hello image so the first apply succeeds before any build; Cloud Build / deploy.sh then roll real images and Terraform ignores image drift."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "leads_api_image" {
  description = "Container image for leads-api. Same bootstrap behaviour as preview_api_image."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

# ---------------------------------------------------------------------------
# Scaling, access and request handling
# ---------------------------------------------------------------------------

variable "preview_api_max_instances" {
  description = "Max Cloud Run instances for preview-api. Vertex image quota is low (about 2 generations/min/model), so keep this small."
  type        = number
  default     = 3
}

variable "leads_api_max_instances" {
  description = "Max Cloud Run instances for leads-api."
  type        = number
  default     = 2
}

variable "preview_api_timeout_seconds" {
  description = "Request timeout for preview-api. 60 s matches the Vercel function budget."
  type        = number
  default     = 60
}

variable "leads_api_timeout_seconds" {
  description = "Request timeout for leads-api. Scheduler-driven jobs (digest, purge) may need more than a user request."
  type        = number
  default     = 300
}

variable "preview_api_allow_unauthenticated" {
  description = "Grant allUsers roles/run.invoker on preview-api. It is a browser-facing endpoint; the service protects itself with the origin allowlist, Turnstile and per-IP limits."
  type        = bool
  default     = true
}

variable "leads_api_allow_unauthenticated" {
  description = <<-EOT
    Grant allUsers roles/run.invoker on leads-api. Default false: only the Cloud
    Scheduler service account (OIDC) and operators with roles/run.invoker can
    reach it, which is what keeps the admin/job routes closed. Set true only if
    the widget must POST leads straight to this service; the application must
    then enforce its own session auth on every admin route.
  EOT
  type        = bool
  default     = false
}

variable "allowed_origins" {
  description = "Browser origins allowed to call the APIs (scheme + host, no path). Passed to both services as ALLOWED_ORIGINS."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for o in var.allowed_origins : can(regex("^https?://[^/]+$", o))])
    error_message = "Each allowed origin must look like https://host[:port] with no path."
  }
}

variable "tenants" {
  description = "Tenant list passed to leads-api as TENANTS (JSON). Keep identifiers only; owner contact details belong in Firestore or Secret Manager, not in tfvars committed to git."
  type = list(object({
    id           = string
    display_name = string
    timezone     = optional(string, "America/New_York")
  }))
  default = []
}

variable "preview_api_env" {
  description = "Extra plain environment variables for preview-api (model names, flags). Never put secrets here."
  type        = map(string)
  default = {
    VERTEX_IMAGE_MODEL           = "gemini-3-pro-image"
    VERTEX_FALLBACK_MODEL        = "gemini-3.1-flash-image"
    RATE_LIMIT_CAPACITY          = "10"
    RATE_LIMIT_REFILL_PER_MINUTE = "6"
  }
}

variable "leads_api_env" {
  description = "Extra plain environment variables for leads-api. Never put secrets here."
  type        = map(string)
  default     = {}
}

variable "mount_secrets" {
  description = <<-EOT
    When true, Cloud Run mounts Secret Manager secrets (latest version) as env
    vars. Leave false for the very first apply: the secrets are created as empty
    shells and Cloud Run refuses to start a revision that references a secret
    with no version. Add the versions out of band, then set true and apply.
  EOT
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# Cloud Scheduler
# ---------------------------------------------------------------------------

variable "scheduler_time_zone" {
  description = "Time zone for the Cloud Scheduler jobs."
  type        = string
  default     = "America/New_York"
}

variable "scheduler_jobs" {
  description = "Lead-management jobs. Each becomes a Cloud Scheduler job that POSTs to leads-api with an OIDC token. Paths must match the routes the application exposes."
  type = map(object({
    schedule    = string
    path        = string
    description = string
  }))
  default = {
    nudge-24h = {
      schedule    = "15 * * * *"
      path        = "/internal/jobs/nudge-24h"
      description = "Hourly sweep: nudge leads untouched for 24 h."
    }
    nudge-72h-owner-cc = {
      schedule    = "45 * * * *"
      path        = "/internal/jobs/nudge-72h"
      description = "Hourly sweep: 72 h nudge with the practice owner CC'd."
    }
    weekly-digest = {
      schedule    = "0 7 * * 1"
      path        = "/internal/jobs/weekly-digest"
      description = "Monday 07:00 weekly lead digest per tenant."
    }
    retention-purge = {
      schedule    = "30 3 * * *"
      path        = "/internal/jobs/retention-purge"
      description = "Nightly purge of leads past the retention window."
    }
  }
}

# ---------------------------------------------------------------------------
# Observability
# ---------------------------------------------------------------------------

variable "uptime_check_period" {
  description = "Uptime check period. Allowed: 60s, 300s, 600s, 900s."
  type        = string
  default     = "300s"
}

variable "notification_channel_ids" {
  description = "Optional Cloud Monitoring notification channel IDs (full resource names) for the uptime alert policies. Empty disables alerting but keeps the checks."
  type        = list(string)
  default     = []
}
