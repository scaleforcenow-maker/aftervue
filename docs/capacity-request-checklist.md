# Capacity request checklist (Google Cloud + Startup Program)

Follow top to bottom. Each step names the exact page. Sign in with the Google account that owns
the Cloud Billing account and the getaftervue.com Workspace domain. Do not paste project IDs,
billing IDs or ticket numbers into this repository; it is public.

Background and sources: `ops/33_Image_Model_Capacity_Options_2026-10.md`.

## Part 0. Before you start (10 minutes)

- [ ] Confirm billing is in good standing: https://console.cloud.google.com/billing
      (the Oct 3 confirmation email says it is).
- [ ] Copy the 18-character Cloud Billing account ID from Billing > Manage your billing account.
      You will need it for the startup application. Keep it out of git.
- [ ] Have the Sept 16 measurement to hand: model IDs `gemini-3-pro-image` and
      `gemini-3.1-flash-image`, endpoint `global`, about 2 image generations per minute per model
      before `429 RESOURCE_EXHAUSTED`, 404 at every US regional endpoint, no adjustable quota row.
- [ ] Have the growth numbers to hand: 50 clinics by Dec 2026 (about 2,500 images/day, peak
      about 13 requests/min), 300 clinics in 2027 (about 75 requests/min peak).

## Part 1. BAA and zero data retention (30 minutes)

- [ ] Open IAM & Admin: https://console.cloud.google.com/iam-admin/settings (any project on the
      account). Find "Google Cloud Platform HIPAA Business Associate Addendum". If it shows
      "Review and Accept", read it and click "I Accept". One project per account is enough.
      If it is not shown, your agreement already incorporates it, or you must go through an
      account manager. Reference: https://support.google.com/cloud/answer/6329727
- [ ] Open the covered-products list and save a dated PDF outside the repo:
      https://cloud.google.com/security/compliance/hipaa#covered-products
      Check for "Gemini Enterprise Agent Platform", "Generative AI on Agent Platform",
      "Cloud Run". If Imagen or Cloud Run is missing, note it for the sales conversation.
- [ ] Zero data retention steps, from
      https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention
      - [ ] Disable in-memory data caching at the project level (page explains the API call).
      - [ ] Confirm request/response logging is not enabled on the project.
      - [ ] Submit the abuse-monitoring exception. The link is on
            https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/abuse-monitoring
            If the form is gone from that page, ask in the support case (Part 2) which route
            applies: exception form or an Invoiced Cloud Billing account.
- [ ] Read Service Specific Terms, section 20 (Generative AI Services), clause (e) "Healthcare
      Restrictions": https://cloud.google.com/terms/service-terms
      Forward to counsel with the current product copy and AI-illustration disclaimer.

## Part 2. Support plan and support case (20 minutes)

- [ ] Buy Standard Support ($29 minimum or 3% of monthly charges):
      https://console.cloud.google.com/support/registration_cc;supportTier=STANDARD
      Reference: https://cloud.google.com/support
- [ ] Open a case: https://console.cloud.google.com/support/cases
      Category: Vertex AI / Gemini Enterprise Agent Platform, Quota. Paste this text:

      > We run a HIPAA workload (BAA accepted) that edits a patient photo into an illustrative
      > treatment preview with Gemini image models. On the `global` endpoint,
      > `gemini-3-pro-image` and `gemini-3.1-flash-image` each return 429 RESOURCE_EXHAUSTED
      > after about 2 generations per minute. Every US regional endpoint returns 404 for these
      > models. The Quotas page shows no adjustable row. We need about 13 requests/min by
      > December 2026 and about 75/min in 2027, US processing preferred. Requests: (1) enable a
      > US regional endpoint (us-central1 or us-east4) for these models for our project;
      > (2) a per-project dynamic shared quota allocation or guidance on the priority tier
      > sufficient for 13 requests/min; (3) confirmation of Provisioned Throughput images per
      > minute per GSU for `gemini-3.1-flash-image` and Nano Banana 2.1 so we can size a
      > purchase; (4) confirmation that our account's abuse-monitoring exception route is the
      > form or invoiced billing. Project ID, billing ID and request timestamps attached.

- [ ] Attach a log excerpt showing the 429s (no image data, no patient data).

## Part 3. Quota request through the console (10 minutes)

- [ ] Open https://console.cloud.google.com/iam-admin/quotas
      Filter: Service = Vertex AI API. Search `generate_content_requests_per_minute_per_project_per_base_model`
      and the two model IDs. If an editable row exists, select it, click "Edit Quotas", enter 20
      (per minute) with the justification above, submit. Expect about two business days.
- [ ] If no editable row exists (expected for dynamic shared quota), open
      https://docs.cloud.google.com/vertex-ai/generative-ai/docs/quotas and use the
      "Request quota adjustment" link at the bottom. State: project ID, location `global`,
      model IDs, "quota is not listed", 429 evidence, and the target rates.

## Part 4. Sales contact (15 minutes, business hours)

- [ ] Start the sales chat (Mon 9 AM ET to Fri 7 PM ET): https://cloud.google.com/contact
      Ask for: an account manager assignment; routing of the quota case; regional enablement of
      the Gemini image models; a Provisioned Throughput sizing conversation for an image
      workload under a BAA. Mention the startup program application (Part 5) so the two threads
      are linked.
- [ ] Record the rep's name and email outside the repo.

## Part 5. Google for Startups Cloud Program application (30 minutes)

- [ ] Check eligibility on https://cloud.google.com/startup/benefits
      Start tier: working MVP, founded within the last 24 months, no credits beyond the free
      trial, plan to seek venture funding. Scale tier requires institutional equity (SAFE counts);
      angel, friends-and-family, crowdfunding and grants do not. Scale AI needs Gemini as the
      product foundation and allows up to $5,000 of prior credits, so taking Start now does not
      block Scale later.
- [ ] Apply at https://cloud.google.com/startup/apply (AI program link:
      https://cloud.google.com/startup/apply?pt=AI#application-form). Use the business email on
      getaftervue.com; the domain must match the website and the billing account's email domain.
      Paste the billing account ID. Use the draft answers in Appendix A of
      `ops/33_Image_Model_Capacity_Options_2026-10.md`.
- [ ] Expect a decision in a few business days, up to 10+ for manual review.
      Questions or rejection: cloudstartupsupport@google.com (FAQ:
      https://cloud.google.com/startup/faq).
- [ ] When credits land: they cover Gemini usage and Provisioned Throughput; they do not cover
      Marketplace or third-party models. Note the expiry date shown in the console.
- [ ] Re-apply for Scale AI the week an institutional SAFE or priced round closes; have public
      links to the investment or ask the investor to verify.

## Part 6. Provisioned Throughput probe (week 3)

- [ ] Estimator: https://console.cloud.google.com/vertex-ai/provisioned-throughput/price-estimate
      Enter the target rate (13 queries per minute, 1 input image, 1 output image) and record
      the GSU count it returns. The 1-week price is $7.14 per GSU-hour, about $1,200 for one GSU
      for one week (https://cloud.google.com/vertex-ai/generative-ai/pricing).
- [ ] Purchase 1 GSU, 1-week term, for the model the fan-out test picked:
      https://console.cloud.google.com/vertex-ai/provisioned-throughput
- [ ] Run a steady load for 30 minutes with `X-Vertex-AI-LLM-Request-Type: dedicated` and
      record images per minute served without 429. Compare against the 0.44 images/min per GSU
      estimate in ops/33 section 5.1. That number decides whether PT is ever viable.

## Part 7. Priority tier on the visible call (engineering, week 2)

- [ ] On the first user-visible preview call only, send headers
      `X-Vertex-AI-LLM-Request-Type: shared` and `X-Vertex-AI-LLM-Shared-Request-Type: priority`
      to the `global` endpoint. Reference:
      https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/priority-paygo
      Expect 1.8x price on that call and automatic downgrade to Standard under contention.

## Part 8. Contingency, only if Parts 2-4 fail to produce capacity by week 4

- [ ] AWS: accept the BAA in AWS Artifact (https://console.aws.amazon.com/artifact), region
      us-east-1. Enable Stability AI Image Services in Bedrock model access. Open Service Quotas
      > Amazon Bedrock, find the Stable Image Inpaint requests-per-minute row, and request an
      increase with projected traffic; AWS prioritises accounts already consuming quota, so file
      early and generate real test traffic first.
      References: https://aws.amazon.com/compliance/hipaa-eligible-services-reference/ and
      https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-increase.html
- [ ] Azure: not recommended until Microsoft documents image-input BAA scope; re-check
      https://learn.microsoft.com/en-us/azure/compliance/offerings/offering-hipaa-us quarterly.
