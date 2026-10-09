# infra/

Everything needed to run AfterVue's two PHI-adjacent services on Google Cloud Run
under the Google Cloud BAA. The application code is not here yet (it is still on
the founder's Mac); this scaffold is built so it drops in.

| Path | What it is |
| --- | --- |
| `terraform/` | All Google Cloud resources: APIs, Artifact Registry, two Cloud Run v2 services, per-service service accounts, Firestore, Secret Manager shells, Cloud Scheduler jobs, log exclusions, uptime checks. See its README for `plan`/`apply`. |
| `preview-api/` | Node 20 Express skeleton for `/api/generate` on Cloud Run: `/healthz`, origin allowlist, per-IP token bucket, Turnstile verification, `Cache-Control: no-store`, PHI-redacting logger, metadata-server Vertex auth. `npm test` runs the suite. |
| `cloudbuild.yaml` | Builds and pushes both images and rolls them out with `gcloud run deploy --image`. All identifiers are substitutions. |
| `deploy.sh` | Manual wrapper around Cloud Build. Refuses to run without `PROJECT_ID`, prints a plan, asks before submitting. |

The cutover plan, rollback, BAA scope and the Vertex global-endpoint caveat are in
[`docs/cloud-run-migration.md`](../docs/cloud-run-migration.md).

## Order of operations

1. `terraform apply` with `mount_secrets = false` (creates everything; services run
   Google's hello image).
2. Add secret versions out of band (`gcloud secrets versions add ...`).
3. `terraform apply` with `mount_secrets = true`.
4. `PROJECT_ID=... ./infra/deploy.sh` to build and roll the real images.
5. Follow the cutover doc to flip the Vercel rewrite.

## Rules this scaffold enforces

- No project IDs, billing IDs, keys, tenant names or personal data in the repo.
  Every identifier is a Terraform variable, a Cloud Build substitution or an env var.
- Request bodies (images, prompts, data URLs) are never logged. The app logger
  redacts them; Cloud Logging exclusions drop them if anything slips through.
- Each service has its own service account with the narrowest working role set.
- `leads-api` is IAM-gated: only Cloud Scheduler's service account (OIDC) and
  operators with `roles/run.invoker` can reach it, so admin and job routes are
  never anonymous.
