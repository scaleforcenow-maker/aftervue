# Moving `/api/generate` and lead management to Cloud Run

Status: scaffold merged, nothing deployed. Infrastructure lives in `infra/`.

## Why

`/api/generate` is the only AfterVue endpoint that handles a patient photo. On
Vercel it runs outside any BAA. Cloud Run in the company's Google Cloud project
puts it under the Google Cloud BAA that already covers Vertex AI usage, removes
the need for a separate Vercel BAA, and costs less at this traffic level.
`aftervue-leads` (lead relay, nudges, digests) was built and tested but never
deployed because the project did not exist; it goes to the same place.

## What the BAA covers

Google's HIPAA page is
<https://cloud.google.com/security/compliance/hipaa-compliance>. It states that
customers subject to HIPAA must accept Google's Business Associate Agreement
before using any Google Cloud product with PHI, and that the BAA covers "Google
Cloud's entire infrastructure (all regions, all zones, all network paths, all
points of presence)" plus the services on the covered-products list at
<https://cloud.google.com/security/compliance/hipaa#covered-products>.

Verification status (checked 2026-10-09 from a cloud session):

- The first URL returned HTTP 200 and its HIPAA-in-scope section names Cloud Run,
  Firestore, Cloud Scheduler, Artifact Registry, Cloud Build, Cloud Logging, Cloud
  Monitoring and Cloud Load Balancing.
- The second URL (the full covered-products list) returns a 301 to
  `docs.cloud.google.com`, which the session's network policy blocked, so
  **Vertex AI and Secret Manager coverage must be confirmed on that page by a
  human before go-live.** Open the list, confirm both, and note the date here.
- The BAA is accepted in the console under IAM & Admin -> Compliance (or via the
  account team). Confirm it shows as accepted for the project before PHI flows.

Google's own framing: the BAA makes Google a business associate; building a
compliant workload on top (least privilege, audit logs, no PHI in logs, retention
controls) is the customer's job. That is what `infra/terraform` encodes.

Products this plan uses that are *not* under the Google BAA and must never see
PHI: Vercel (after cutover it only forwards; the rewrite does not inspect bodies,
but keep the Vercel function logs off and the body size limit on), Cloudflare
Turnstile (receives a challenge token and the client IP, never the photo),
Postmark (lead emails carry name and contact details for lead follow-up, no
clinical content or images; this is a lead-management function, and it should be
checked against the practice's own BAA posture with AfterVue).

## Zero data retention on Vertex AI

Vertex AI generative models may log prompts for abuse monitoring under the Google
Cloud Platform Terms. Google's data-governance page
(<https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance>, redirects
to the docs host) describes the "exception for abuse monitoring" that yields zero
data retention, and notes some Advanced AI features cannot be exempted. The
request path:

1. Confirm the project is on the Google Cloud Platform Terms (it is unless an
   invoiced / enterprise agreement says otherwise) and that billing is active.
2. Submit the abuse-monitoring exemption request from the data-governance page
   (the form is linked there; it asks for project number and use case). Describe
   the use case as patient-consented cosmetic previews, PHI, HIPAA covered.
3. Keep the acknowledgement email with the compliance records, and record the
   date here when granted.
4. Until it is granted, treat Vertex as "may retain prompts briefly for abuse
   monitoring" in the risk register. Do not enable any Vertex feature that
   stores prompts (prompt caching to disk, dataset creation, tuning) on the
   production project.

The exact retention window Google applies before the exemption is stated on that
page and has changed over time; cite the live page rather than this document.

## The Vertex global-endpoint caveat

Compute, Firestore and secrets are pinned to `us-east4`. Vertex is not: the
Gemini image models the preview uses are served only from the **global**
endpoint today, so `preview-api` calls `aiplatform.googleapis.com` with location
`global` (`VERTEX_LOCATION=global`, `var.vertex_location`).

Google's data-residency documentation
(<https://cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency>)
separates data at rest from ML processing and says the global endpoint routes and
processes requests without restricting them to a geographic region; for
processing that must stay in a region, use a regional or the US multi-region
endpoint. In plain terms: **with the global endpoint, the photo may be processed
outside the United States for the duration of the request.** Nothing is stored
by the call; the BAA still applies (it covers all regions); but a US-only
processing claim cannot be made.

Decision recorded here: accept global for launch because the models are not
served anywhere else, state it accurately in the privacy notice and the practice
agreement, and switch as soon as Google serves the image models from `us-east4`,
`us-central1` or the `us` multi-region. The switch is one variable
(`vertex_location`) and a `terraform apply`; `preview-api` builds the regional
hostname automatically. The capacity-request follow-through session (plan item
12) owns re-checking availability.

## Cutover plan

Prerequisites: billing restored, BAA accepted, `terraform apply` done with
secrets mounted, `deploy.sh` has rolled a real image, and the Turnstile widget is
live on the client (the Cloud Run service rejects requests without a token).

1. **Parity run.** With the service URL from `terraform output preview_api_url`,
   run the demo photo pair against both the Vercel function and Cloud Run and
   diff the JSON envelopes. Same model, same output shape, response time within
   budget.
2. **Vercel rewrite behind a flag.** In the Next.js app, add to `next.config.js`:

   ```js
   async rewrites() {
     if (process.env.PREVIEW_API_UPSTREAM) {
       return [{ source: '/api/generate', destination: `${process.env.PREVIEW_API_UPSTREAM}/api/generate` }];
     }
     return [];
   }
   ```

   Rewrites take precedence over `pages/api` / route handlers, so the Vercel
   function stays deployed but unreachable while the flag is set. Set
   `PREVIEW_API_UPSTREAM` to the Cloud Run URL in the Vercel project's
   environment (Preview first, then Production), redeploy. The public path and the
   request/response contract do not change, so the widget and the iOS kiosk need
   no update. Add the production site origins to `allowed_origins` before this
   step; the rewrite forwards the browser's `Origin` header unchanged.
3. **Watch for an hour.** Cloud Run request logs (status, latency only), the
   uptime check, 429/fallback counters on `/healthz` once the resilience package
   lands, and Vercel's function invocation count dropping to zero.
4. **Freeze.** Leave the Vercel function in place for two weeks as the rollback
   target, then delete it and remove its Vertex credentials.

Lead management goes the same way but with no cutover: it has never been live.
Deploy, run the end-to-end scenario against the Cloud Run URL (with an identity
token, since the service is IAM-gated), provision the tenant, then point the
widget's lead POST at it.

## Rollback

- Unset `PREVIEW_API_UPSTREAM` in Vercel and redeploy. The original function
  takes over on the next request. Nothing on Google Cloud needs to change.
- If Cloud Run is healthy but a bad image shipped: `gcloud run services
  update-traffic preview-api --to-revisions=<previous>=100 --region us-east4`.
- If Terraform state is wrong, `terraform plan` shows it; the services ignore
  image drift so a plan never rolls back a deploy by accident.

## Checklist before PHI flows

- [ ] BAA accepted on the project; Vertex AI and Secret Manager confirmed on the covered-products list
- [ ] Abuse-monitoring exemption requested (date) / granted (date)
- [ ] `terraform apply` clean; `mount_secrets = true`; secret versions present
- [ ] `preview-api` image built from the ported handler, `npm test` green, parity run recorded
- [ ] Vercel function logging disabled; body limit unchanged
- [ ] Privacy notice states the global-endpoint processing caveat
- [ ] Log exclusions visible in Logs Router; a test entry with an `image` field does not appear
- [ ] Uptime checks green from three US regions
