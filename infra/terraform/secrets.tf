# Empty shells only. Versions are added out of band, for example:
#   printf '%s' "$POSTMARK_TOKEN" | gcloud secrets versions add postmark-token --data-file=-
# Never commit a version, and never pass one through Terraform state.

locals {
  secrets = {
    postmark-token = {
      description = "Postmark server token used by leads-api to send nudges and digests."
      readers     = [google_service_account.leads_api.member]
    }
    turnstile-secret = {
      description = "Cloudflare Turnstile secret key. preview-api verifies widget tokens with it; leads-api verifies form tokens."
      readers     = [google_service_account.preview_api.member, google_service_account.leads_api.member]
    }
    session-signing-key = {
      description = "HMAC key for leads-api session cookies / signed tokens."
      readers     = [google_service_account.leads_api.member]
    }
  }

  secret_readers = merge([
    for name, s in local.secrets : {
      for m in s.readers : "${name}/${m}" => { secret = name, member = m }
    }
  ]...)
}

resource "google_secret_manager_secret" "secrets" {
  for_each = local.secrets

  project   = var.project_id
  secret_id = each.key

  # Single US region replica: keeps secret material in the same region as compute.
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = {
    purpose = "aftervue"
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "readers" {
  for_each = local.secret_readers

  project   = var.project_id
  secret_id = google_secret_manager_secret.secrets[each.value.secret].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value.member
}
