# Defence in depth for the "never log request bodies" rule.
#
# The application code is the first line: it must not log bodies, images, prompts
# or data URLs at all (infra/preview-api/src/logger.js redacts those field names).
# This exclusion on the project's _Default sink is the second line: if a log entry
# from either service ever carries one of those fields, or a data: URL, or a
# request body, Cloud Logging drops it before storage.
#
# Note: exclusions apply to the _Default sink only. If you add other sinks
# (BigQuery export, etc.) copy this filter into their exclusions too.

locals {
  cloud_run_services_filter = "resource.type=\"cloud_run_revision\" AND (resource.labels.service_name=\"${var.preview_api_service_name}\" OR resource.labels.service_name=\"${var.leads_api_service_name}\")"

  body_fields_filter = join(" OR ", [
    "jsonPayload.image:*",
    "jsonPayload.images:*",
    "jsonPayload.photo:*",
    "jsonPayload.photos:*",
    "jsonPayload.selfie:*",
    "jsonPayload.prompt:*",
    "jsonPayload.body:*",
    "jsonPayload.requestBody:*",
    "jsonPayload.request.body:*",
    "jsonPayload.data:*",
    "jsonPayload.dataUrl:*",
    "jsonPayload.message:\"data:image/\"",
    "textPayload:\"data:image/\"",
    "textPayload:\"base64,\"",
  ])
}

resource "google_logging_project_exclusion" "no_request_bodies" {
  project     = var.project_id
  name        = "aftervue-no-request-bodies"
  description = "Drop any Cloud Run log entry from the AfterVue services that carries an image, photo, selfie, prompt, request body or data URL field. Application code must never log these; this is a backstop."
  filter      = "${local.cloud_run_services_filter} AND (${local.body_fields_filter})"

  depends_on = [google_project_service.apis]
}

# Keep Cloud Run's own request logs (method, path, status, latency) but never the
# query string, which a client could abuse to smuggle data into logs. Cloud Run
# logs the full URL; the services reject GET bodies and ignore query parameters,
# and this exclusion drops request-log lines whose URL carries a query string on
# the generate route.
resource "google_logging_project_exclusion" "no_generate_query_strings" {
  project     = var.project_id
  name        = "aftervue-no-generate-query-strings"
  description = "Drop request-log entries for /api/generate that carry a query string."
  filter      = "${local.cloud_run_services_filter} AND logName:\"/logs/run.googleapis.com%2Frequests\" AND httpRequest.requestUrl:\"/api/generate?\""

  depends_on = [google_project_service.apis]
}
