# Terraform: AfterVue on Cloud Run

Terraform >= 1.6, `hashicorp/google` pinned in `versions.tf`.

## What it creates

| Area | Resources |
| --- | --- |
| APIs | run, aiplatform, firestore, cloudscheduler, secretmanager, artifactregistry, cloudbuild, logging, monitoring, iam, iamcredentials |
| Images | Artifact Registry Docker repo with keep-10 / delete-untagged-after-30-days cleanup |
| Compute | Cloud Run v2 `preview-api` (timeout 60 s, max 3 by default) and `leads-api` (timeout 300 s, max 2). Both: min instances 0, CPU allocated only during requests, ingress all, `/healthz` startup + liveness probes |
| Identity | `preview-api-sa` (`roles/aiplatform.user` at project level, plus `secretAccessor` on the one Turnstile secret so Cloud Run can mount it), `leads-api-sa` (`roles/datastore.user`, `secretAccessor` on its three named secrets), `leads-scheduler-sa` (`roles/run.invoker` on leads-api only), `aftervue-cloudbuild-sa` (push images, deploy revisions, actAs the two runtime SAs) |
| Data | Firestore Native, `us-east4` or `nam5`, delete protection on, PITR on |
| Secrets | `postmark-token`, `turnstile-secret`, `session-signing-key` as empty shells, single replica in `var.region` |
| Jobs | Cloud Scheduler: `leads-nudge-24h`, `leads-nudge-72h-owner-cc`, `leads-weekly-digest`, `leads-retention-purge`, each POSTing to leads-api with an OIDC token |
| Logging | Two `_Default` sink exclusions: any Cloud Run entry carrying image/photo/selfie/prompt/body/data-URL fields, and request logs for `/api/generate` with a query string |
| Monitoring | Uptime checks on `/healthz` for both services (OIDC-authenticated for leads-api), optional alert policies if notification channels are given |

Outputs: both service URLs, the four service-account emails, the Artifact Registry
prefix, secret IDs, scheduler job targets and the Vertex location.

## Access model

- `preview-api` is public (`allUsers` invoker) because browsers call it. It defends
  itself: origin allowlist, Turnstile, per-IP token bucket, 60 s timeout.
- `leads-api` is **not** public by default. Cloud Run IAM rejects anonymous calls
  before they reach the container, so admin and `/internal/*` job routes cannot be
  hit without an identity token. Cloud Scheduler calls them with an OIDC token for
  `leads-scheduler-sa`; the application must additionally check the token's email
  equals `SCHEDULER_SA_EMAIL` on those routes. If the widget must POST leads
  directly, set `leads_api_allow_unauthenticated = true` and the app must enforce
  its own session auth on every admin route.

## Vertex location: `global` today

The Gemini image models the preview uses are only served from the global
endpoint (`aiplatform.googleapis.com`, location `global`). `var.vertex_location`
therefore defaults to `global` and is passed to `preview-api` as `VERTEX_LOCATION`,
while every piece of compute and storage here is pinned to a US region. Google
states the global endpoint does not restrict where ML processing happens. The
consequences and the switch-over condition are in `docs/cloud-run-migration.md`.

## Running it

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # fill in; git-ignored
cp backend.tf.example backend.tf               # fill in the bucket; git-ignored
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

First apply must use `mount_secrets = false`. Then:

```bash
printf '%s' "$POSTMARK_TOKEN"      | gcloud secrets versions add postmark-token      --data-file=- --project "$PROJECT_ID"
printf '%s' "$TURNSTILE_SECRET"    | gcloud secrets versions add turnstile-secret    --data-file=- --project "$PROJECT_ID"
openssl rand -base64 48            | gcloud secrets versions add session-signing-key --data-file=- --project "$PROJECT_ID"
```

Set `mount_secrets = true`, `plan`, `apply`. Cloud Run now mounts them as env vars.

Images: Terraform deploys Google's public hello image on first apply and then
**ignores image changes**, so `infra/deploy.sh` / Cloud Build can roll new
revisions without a Terraform diff. Everything else about the services is
Terraform's.

### From a Claude Code cloud session (one-hour token)

The cloud session never holds long-lived credentials. On the Mac:

```bash
gcloud auth print-access-token          # copy the output
```

Paste it as the environment variable `CLOUDSDK_AUTH_ACCESS_TOKEN` when starting
the session (claude.ai/code -> environment -> variables). It expires in about an
hour, which is the point. Inside the session:

```bash
export TF_VAR_access_token="$CLOUDSDK_AUTH_ACCESS_TOKEN"   # provider uses it directly
export TF_VAR_project_id="<project id>"                     # or terraform.tfvars
cd infra/terraform && terraform init && terraform plan
```

`gcloud` picks `CLOUDSDK_AUTH_ACCESS_TOKEN` up on its own, so `infra/deploy.sh`
works with the same token. Never echo the variable, never write it to a file, and
if the GCS backend is used the token's principal needs `storage.objectAdmin` on
the state bucket.

If the session's network policy blocks `registry.terraform.io`, download
`terraform-provider-google_<version>_linux_amd64.zip` from
`releases.hashicorp.com` and point a `filesystem_mirror` at it in
`TF_CLI_CONFIG_FILE`; that is how this module was validated.

### Lock file

`.terraform.lock.hcl` is git-ignored here because it was first generated from a
Linux-only mirror. Run `terraform init` on the Mac, then
`terraform providers lock -platform=linux_amd64 -platform=darwin_arm64`, and
commit the resulting lock file.

## Known first-apply wrinkles

- The uptime check for `leads-api` authenticates as the Cloud Monitoring service
  agent. On a fresh project that agent may not exist yet; if the IAM binding
  fails, run `gcloud beta services identity create --service=monitoring.googleapis.com`
  and apply again.
- Whoever runs `deploy.sh` needs `roles/iam.serviceAccountUser` on
  `aftervue-cloudbuild-sa` (to submit builds as it) and `roles/cloudbuild.builds.editor`.
- Firestore `(default)` can only exist once per project. If one already exists,
  `terraform import google_firestore_database.default "projects/$PROJECT_ID/databases/(default)"`.
