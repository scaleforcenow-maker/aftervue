# 33. Image model capacity options (October 2026)

Prepared Oct 9, 2026 for the AfterVue founding team. Companion to
`32_Google_Cloud_Capacity_Request_DRAFT` (Sept 16) and `docs/cloud-credit-plan.md`
session 4 (preview API resilience) and session 12 (capacity follow-through).

## 0. How to read the source labels

Every factual claim below carries a label and a URL.

| Label | Meaning |
| --- | --- |
| **[FETCHED]** | The page was retrieved and read in this session on Oct 9, 2026 (`cloud.google.com` pages via the session proxy; converted to text and quoted). |
| **[SNIPPET]** | The official page exists at the URL, but the cloud environment's network policy blocked `docs.cloud.google.com`, `docs.aws.amazon.com`, `aws.amazon.com`, `learn.microsoft.com`, `azure.microsoft.com`, `help.openai.com`, `developers.openai.com` and `ai.google.dev`. The claim comes from search-engine extracts of that page. Treat as probably right, confirm before relying on it. |
| **[THIRD-PARTY]** | Aggregator, blog, forum, or vendor page. Lowest confidence. |
| **[UNVERIFIED]** | Could not be sourced. Stated as an open question. |

The network block is an environment setting (cloud environment menu in the session title bar,
then Edit, Network access). Re-running this document's checks with those hosts allowed would
upgrade most [SNIPPET] items to [FETCHED]. Nothing here is a quality judgment about any model;
realism and identity caveats are quoted from vendor documentation only.

## 1. Google Cloud (current primary)

### 1.1 Measured problem (Sept 16, 2026)

`gemini-3-pro-image` (primary) and `gemini-3.1-flash-image` (fallback) return
`429 RESOURCE_EXHAUSTED` after about two image generations per minute per model, only at the
`global` endpoint; every US regional endpoint returned 404. The Quotas page shows no adjustable
row for either model. Provisioned Throughput was quoted at a monthly price far beyond an
early-stage budget. Independent developers report the same pattern: a 404 on
`gemini-3-pro-image-preview` in `us-central1` with only `global` working
([THIRD-PARTY] https://discuss.ai.google.dev/t/request-for-regional-access-to-gemini-3-preview-models-in-vertex-ai/144515),
a quota row for `gemini-3.1-flash-image` marked "Adjustable: No" with 0% usage while 429s
continue ([THIRD-PARTY] https://discuss.ai.google.dev/t/quota-increase-allowlist-request-for-gemini-3-1-flash-image-vertex-ai-global-endpoint-production-app-blocked-by-429-resource-exhausted/177826),
and "undocumented rate limits for Gemini image generation (~2-5 RPM)"
([THIRD-PARTY] https://discuss.google.dev/t/undocumented-rate-limits-for-gemini-image-generation-2-5-rpm/303281).

### 1.2 Quota mechanics: three consumption modes plus Flex

Vertex AI was renamed **Gemini Enterprise Agent Platform** on April 22, 2026; the docs now
redirect to `docs.cloud.google.com/gemini-enterprise-agent-platform/...`
([FETCHED] editor's note in https://cloud.google.com/blog/products/ai-machine-learning/provisioned-throughput-on-vertex-ai).
Model IDs and endpoints are unchanged.

**Dynamic Shared Quota (DSQ), the default pay-as-you-go mode.** "For the default
pay-as-you-go model, Vertex AI uses Dynamic Shared Quota, which doesn't have a predefined usage
limit. You get access to a large, shared pool of resources that are dynamically allocated based
on real-time availability and demand." DSQ "dynamically distributes available PayGo capacity
among all customers for a specific model and region, removing the need to set quotas and to
submit quota increase requests." A 429 under DSQ means the shared pool is loaded, not that a
per-project quota was spent, which is why no adjustable row appears
([SNIPPET] https://docs.cloud.google.com/vertex-ai/generative-ai/docs/quotas and
https://docs.cloud.google.com/vertex-ai/generative-ai/docs/dynamic-shared-quota). Google's
guidance is retry with backoff, or buy Provisioned Throughput. Newer Gemini models (2.0 and later)
are on DSQ; models earlier than Gemini 2.0 and some non-Gemini models still use per-project,
per-region quotas that can be raised ([SNIPPET] same quotas page).

**Priority PayGo (new "priority tier").** A consumption option with "more consistent
performance than Standard PayGo and no Provisioned Throughput commitment". Requests carry
`X-Vertex-AI-LLM-Request-Type: shared` plus `X-Vertex-AI-LLM-Shared-Request-Type: priority`;
traffic type shows as `ON_DEMAND_PRIORITY`. "Priority PayGo doesn't support regional or
multi-regional endpoints", so it is `global` only. Traffic over the dynamic limit is downgraded
server-side to Standard, billed at Standard
([SNIPPET] https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/priority-paygo;
header names also confirmed by the LiteLLM fix PR, [THIRD-PARTY] https://github.com/BerriAI/litellm/pull/34959).
The pricing page lists Priority prices for all four Nano Banana image models
([FETCHED] https://cloud.google.com/vertex-ai/generative-ai/pricing, "Nano Banana" table,
Priority tab), so the image models are in the Priority program. Priority costs 1.8x Standard
(for example Gemini 3 Pro Image output $216.00 per 1M image tokens vs $120.00 Standard).

**Flex PayGo.** "A cost-effective option for accessing Gemini models for non-critical workloads
that can tolerate longer response times and higher throttling", "in the global endpoint only",
header value `flex` ([SNIPPET] https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/flex-paygo).
Flex is half price (Gemini 3 Pro Image output $60.00 per 1M; "Gemini Nano Banana 2.1 does not
support Flex") ([FETCHED] pricing page, Flex/Batch tab). Response times of minutes make it
unsuitable for a live consult, but see section 4 for a pre-generation use.

**Provisioned Throughput (PT).** Reserved capacity bought in Generative AI Scale Units (GSUs).
Published GSU prices, global endpoint: 1-week commit $7.14 per GSU-hour, 1-month $3.6986,
3-month $3.2877, 1-year $2.7397. Non-global endpoints are about 10% higher
([FETCHED] pricing page, "Provisioned Throughput" section). The page's own example converts
these to $1,200 per GSU per week and $2,700 per GSU per month. Google's Feb 19, 2026 blog
confirms PT is sold for "Gemini 3 models and Nano Banana, our state-of-the-art model for
high-fidelity image generation and editing", that **1-week PT terms** exist for select models,
and that change orders can be scheduled two weeks ahead
([FETCHED] https://cloud.google.com/blog/products/ai-machine-learning/provisioned-throughput-on-vertex-ai).
Throughput per GSU for the image models: an older supported-models table lists
`gemini-3-pro-image-preview` at **500 tokens per second per GSU**, minimum purchase 1 GSU, with
an **output image token burndown of 60** (1 output image token consumes 60 throughput tokens)
([SNIPPET] https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/provisioned-throughput/supported-models).
A dedicated page gives quota enforcement windows for Gemini 3 image models: 1 GSU has a
1,230-second window, 2 GSUs 615 seconds, 13 to 24 GSUs 100 seconds
([SNIPPET] https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/provisioned-throughput/gemini-3-nano-banana-models).
Section 5 turns these into images per minute; the result explains the quote you received.

Estimator and purchase pages (console, sign-in required):
https://console.cloud.google.com/vertex-ai/provisioned-throughput/price-estimate and
https://console.cloud.google.com/vertex-ai/provisioned-throughput ([FETCHED] linked from the PT blog).

### 1.3 Which regions serve each image-capable model

| Model (ID) | Status | Endpoints | Source |
| --- | --- | --- | --- |
| Gemini 3 Pro Image, "Nano Banana Pro" (`gemini-3-pro-image`, preview ID `gemini-3-pro-image-preview`) | GA since May 28, 2026 | Listed on the global-endpoint list. Appears as a row in the US regional table but the per-region marks did not survive extraction; AfterVue measured 404 at every US region on Sept 16. | [SNIPPET] https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations; GA date [SNIPPET] https://cloud.google.com/blog/products/ai-machine-learning/nano-banana-2-and-nano-banana-pro-are-generally-available |
| Gemini 3.1 Flash Image, "Nano Banana 2" (`gemini-3.1-flash-image`) | GA since May 28, 2026 | Global; one Sept 2026 third-party guide says `us` and `eu` multi-region are available for this model only. Developers report 404 at every regional endpoint. | [SNIPPET] same blog; [THIRD-PARTY] https://blog.laozhang.ai/es/posts/vertex-ai-nano-banana-api; [THIRD-PARTY] forum thread 177826 above |
| Gemini 3.1 Flash-Lite Image, "Nano Banana 2 Lite" (`gemini-3.1-flash-lite-image`) | On pricing page, Global | Global | [FETCHED] pricing page |
| Gemini Nano Banana 2.1 (`gemini-nano-banana-2.1` on the developer API; Vertex ID to confirm in Model Garden) | GA Oct 6, 2026 | Global, Standard and PT; no Flex | [FETCHED] pricing page row "Gemini Nano Banana 2.1"; release details [THIRD-PARTY] https://letsdatascience.com/news/google-rolls-out-nano-banana-21-image-model-c6ac3b89 |
| Gemini 2.5 Flash Image (`gemini-2.5-flash-image`) | GA Oct 2, 2025 | Regional US endpoints exist: the US table lists it alongside us-central1, us-east1, us-east4, us-east5, us-south1, us-west1, us-west4; also global. This is the only Gemini image model with documented US regional endpoints. | [SNIPPET] https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash-image and the locations page |
| Imagen 4 (`imagen-4.0-generate-001`, `-fast-`, `-ultra-`) | Still priced on the pricing page ($0.04 / $0.02 / $0.06 per image) but a Mar 24, 2026 release note titled "Imagen generation GA endpoints deprecation" lists these IDs with `gemini-2.5-flash-image` as the replacement and a June 30, 2026 cutoff. **Conflict; check Model Garden.** | Imagen does not support the global endpoint; regional (us-central1 and others). | [FETCHED] pricing page Imagen table; [SNIPPET] https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes |
| Imagen 3 editing (`imagen-3.0-capability-001`, the only mask-based edit model) | Discontinued; migration target `gemini-2.5-flash-image` | n/a | [SNIPPET] same release notes; [THIRD-PARTY] https://discuss.google.dev/t/imagen-3-0-capability-001-retiring-june-30-no-mask-based-editing-replacement-exists/343602 |

Why this matters for the 429 problem: DSQ pools are per model and per region. Each model above
is a separate pool, and `gemini-2.5-flash-image` has seven US regional pools. Spreading
requests across pools is the one zero-cost capacity lever available today (section 4).

### 1.4 Imagen as an alternative: no

- **Editing.** Imagen 4 has generate, fast and ultra variants and an upscaler; there is no
  Imagen 4 "capability" (editing) model. Mask-based editing lived in `imagen-3.0-capability-001`,
  which the release notes mark discontinued ([SNIPPET] release notes; [THIRD-PARTY] forum 343602).
  The pricing page still describes Imagen editing ("edit only parts of images using a mask area")
  under the Imagen 3 row ([FETCHED] pricing page), so the two official pages disagree.
- **Faces.** Imagen person generation is controlled by `personGeneration`
  (`allow_adult`, `allow_all`); `allow_all` and, historically, any people generation were
  allowlist-only ("Generating images containing people is currently an allowlist-only feature.
  Contact your Google representative") ([THIRD-PARTY] https://discuss.google.dev/t/imagen-3-generating-images-containing-people-is-currently-an-allowlist-only-feature/175303;
  enum reference [SNIPPET] https://docs.cloud.google.com/ruby/docs/reference/google-cloud-ai_platform-v1/latest/Google-Cloud-AIPlatform-V1-ImageConfig-PersonGeneration).
- **Quotas.** Imagen uses classic per-project, per-region quotas (metric
  `generate_content_requests_per_minute_per_project_per_base_model`) that are adjustable through
  the console ([SNIPPET] quotas page; [THIRD-PARTY] https://discuss.google.dev/t/imagen-on-vertex-ai-hitting-quota-limits-over-and-over-for-just-1-image-generation/189522).
  Adjustable quotas are the one thing Imagen had over Gemini, but without an editing model it
  cannot do AfterVue's job. Whether Imagen 4 can do "photo-realistic face edits" is moot: it has
  no edit endpoint.

### 1.5 BAA coverage

- "Customers that are subject to HIPAA and want to utilize any Google Cloud products in connection
  with PHI must review and accept Google's Business Associate Agreement (BAA)." "The Google Cloud
  BAA covers Google Cloud's entire infrastructure (all regions, all zones, all network paths, all
  points of presence), and the services listed below." "The BAA is not subject to modification."
  "organizations that use Google Cloud should talk to their account managers about entering into a
  BAA" ([FETCHED] https://cloud.google.com/security/compliance/hipaa-compliance).
- **Covered products list:** https://cloud.google.com/security/compliance/hipaa#covered-products
  (redirects to https://docs.cloud.google.com/docs/security/compliance/hipaa; blocked here).
  Search extracts of that page show "Gemini Enterprise Agent Platform" and "Generative AI on
  Agent Platform" as entries ([SNIPPET] that URL). Google's release notes record "HIPAA
  compliance for Generative AI on Vertex AI" announced June 9, 2023, covering Model Garden
  components ([SNIPPET] https://docs.cloud.google.com/vertex-ai/docs/core-release-notes).
  **Imagen is not named separately in any extract** [UNVERIFIED]; since Imagen is served through
  the same platform entry, coverage is likely but confirm on the live list before any PHI use.
  Cloud Run's presence on the list could not be confirmed from extracts [UNVERIFIED]; it has
  been on the list for years and the Sept 5 launch plan assumed it.
- **Self-serve acceptance:** Google's support article says to open IAM & Admin in the console,
  pick one project, find "Google Cloud Platform HIPAA Business Associate Addendum", click
  "Review and Accept", then "I Accept"; one project per account is enough
  ([SNIPPET] https://support.google.com/cloud/answer/6329727). The compliance page's "talk to your
  account manager" wording is the alternative for accounts whose agreement already incorporates it.
- **Important contractual restriction.** The Service Specific Terms, section 20 (Generative AI
  Services), clause (e) "Healthcare Restrictions": "Customer will not, and will not allow End
  Users to, use the Generative AI Services for clinical purposes (for clarity, non-clinical
  research, scheduling, or other administrative tasks is not restricted), as a substitute for
  professional medical advice, or in any manner that is overseen by or requires clearance or
  approval from any applicable regulatory authority"
  ([FETCHED] https://cloud.google.com/terms/service-terms). AfterVue's preview is an illustrative
  marketing and consultation aid, not a clinical decision tool, but counsel should sign off on how
  the product copy and the AI-illustration disclaimer position it against this clause.

### 1.6 Zero data retention and abuse monitoring

Google's zero-data-retention page lists the steps: (1) abuse monitoring, "Only customers whose
use of Google Cloud is governed by the Google Cloud Platform Terms of Service are subject to
prompt logging for abuse monitoring", and "If you are in scope ... you can request an exception";
(2) leave request/response logging off; (3) do not enable Live API session resumption; (4) do
not use Sandbox snapshots; (5) disable in-memory data caching, which is on by default with a
24-hour TTL and "can be disabled at the project level"
([SNIPPET] https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention,
formerly https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention).
The data-governance page adds: "To achieve zero data retention, you must disable data caching"
([SNIPPET] https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance).

Abuse monitoring: when classifiers flag a prompt, Google may log it "solely for examining whether
an AUP or Prohibited Use Policy violation occurred", retained 30 days in the selected region,
not used for training; customers in scope "may request an exception by filling out a form"
([SNIPPET] https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/abuse-monitoring).
Two caveats: a policy-change tracker reports the opt-out form entry was removed from that page
between Sept 22 and Oct 2, 2026 while the ZDR page still mentions the exception
([THIRD-PARTY] https://github.com/arcships/zdr-monitor/pull/497), and an older snippet says
customers with an Invoiced Cloud Billing account are already out of scope for prompt logging.
Action: ask the account team, in writing, which of the two routes (exception form or invoiced
billing) applies to AfterVue's account. Partner and reseller customers are covered by a separate
clause ([FETCHED] service terms, "Generative AI Safety and Abuse for GCP Services").

### 1.7 Exact self-serve routes to more capacity

1. **Quota console.** IAM & Admin > Quotas & System Limits
   (https://console.cloud.google.com/iam-admin/quotas), filter by the Vertex AI API, select the
   row, Edit Quotas, enter the value and justification. For DSQ models no editable row exists;
   the documented fallback is the "Request quota adjustment" link at the bottom of the Vertex AI
   quotas page, stating the project, region (`global`), model ID, that the quota is missing, and
   the 429 evidence ([SNIPPET] quotas page; [THIRD-PARTY] https://discuss.google.dev/t/quota-increase-request-for-vertex-ai-imagenegeneration-model/250620).
   Typical processing for standard quota requests is about two business days
   ([SNIPPET] https://docs.cloud.google.com/filestore/docs/requesting-quota-increases, the only
   Google page giving a time). Requests may be auto-denied on new or low-spend projects
   ([THIRD-PARTY] https://discuss.google.dev/t/quota-increase-instantly-denied-after-request-manual-review-requested/362381).
2. **Sales.** Chat with the Google Cloud sales team, Monday 9 AM ET through Friday 7 PM ET, at
   https://cloud.google.com/contact ([FETCHED]). Sales is the route Google forum moderators give
   for Vertex quota ("contact your sales representative if you have one")
   ([THIRD-PARTY] forum 143445). Note from the startup pages: program members get an Account
   Manager; the AI tier includes Enhanced Support credits (section 2).
3. **Support plan.** Basic support cannot open technical cases. Standard Support is "Minimum
   spend of $29.00 or 3% of monthly Cloud charges", P2 response 4 hours, 8/5; Enhanced is
   "Minimum spend of $100.00" or 10% of the first $10K of charges, P1 1 hour, 24/7; Premium
   minimum $15,000 ([FETCHED] https://cloud.google.com/support). Sign-up links:
   https://console.cloud.google.com/support/registration_cc;supportTier=STANDARD and
   `...supportTier=ENHANCED` ([FETCHED] same page). Standard at $29 is the cheapest way to get a
   human on the quota question.
4. **Priority PayGo** needs no request: add the two headers (section 1.2). It raises the odds of
   being served under contention; it is not a quota increase.
5. **Provisioned Throughput** is self-serve in the console for 1-week terms. A 1-GSU, 1-week
   purchase ($1,200) is the cheapest way to measure real images-per-minute per GSU before any
   larger commitment.

## 2. Google for Startups Cloud Program

All items in this section are [FETCHED] from https://cloud.google.com/startup,
https://cloud.google.com/startup/faq, https://cloud.google.com/startup/benefits,
https://cloud.google.com/startup/pre-funded, https://cloud.google.com/startup/early-stage,
https://cloud.google.com/startup/ai and https://cloud.google.com/terms/startup-program-tos.

| Tier | Who | Credits | Other benefits |
| --- | --- | --- | --- |
| **Start** | "digital-native startups with a working MVP, a clear business model, and plans to seek venture funding soon"; founded within the last 24 months; "Not yet received Google Cloud credits (beyond the free trial)" | "Up to $2,000 USD in Google Cloud credits, valid for one year" | $200 Google Skills credits; 12 months of Google Workspace Business Plus for new signups (domain must not have had a paid Workspace plan within 31 days of applying); free-tier AI Studio access; partner perks |
| **Scale** | "For VC-funded startups ready to grow and scale"; Pre-Seed/Seed within the last 5 years or Series A within the last 12 months; founded within the last five years; "Not yet received more than $5,000 in Google Cloud credits"; stealth supported on verification | Year 1: 100% of usage up to $100,000; Year 2: 20% of usage up to an additional $100,000 (total up to $200,000) | $500 Skills credits; $600/month Google Maps credits (separate application); up to $12,000 Enhanced Support credits for one year |
| **Scale, AI-first** | Scale eligibility plus "use or plan to use Gemini Enterprise or Gemini to deploy AI services as a foundation of their primary product" | Year 1: 100% up to $250,000; Year 2: 20% up to $100,000 (total up to $350,000) | Same as Scale plus AI training and Model Garden access; "Third-party models are billed directly and are not covered by the program credits" |

Eligibility notes that matter for AfterVue:

- "Funding through private equity, government innovation grants, prize funding, crowdfunding,
  angel, and friends and family funding will not qualify a startup for scale but will be
  evaluated for other program tiers." SAFEs from institutional investors do qualify. A bootstrapped
  company is a **Start** tier applicant today and a **Scale AI** applicant after an institutional
  SAFE or priced round.
- Taking the $2,000 Start credit does not block Scale later: Scale's bar is "not more than
  $5,000" in prior credits.
- Program exclusions: companies that IPO'd or were acquired, education, government, nonprofits,
  dev shops, consultancies, agencies, crypto mining.
- Credits "can be used for Google Cloud services such as BigQuery and Gemini Enterprise", "cover
  Google's state-of-the-art models like Gemini", and cannot be applied to Marketplace or
  third-party offerings. They are not transferable and "may only be used against qualifying
  Services usage fees accrued after the time Google issues such credit" (program terms).
- Decision time: "In most cases, you can expect to be informed within a few business days ...
  Applications requiring further manual review may experience extended processing times of 10
  days or more."

Application steps (FAQ): have the 18-character Cloud Billing account ID (Console > Billing >
Manage your billing account); apply from a business email whose domain matches the public
website domain and the billing account; for Scale, provide public links to the equity
investment (or have the investor verify, if in stealth). Apply at
https://cloud.google.com/startup/apply (sign-in required); the AI program link is
https://cloud.google.com/startup/apply?pt=AI#application-form. Questions and rejections:
cloudstartupsupport@google.com. Draft answers are in Appendix A.

## 3. Contingency providers with a BAA and US-region image editing

### 3.1 AWS Bedrock

- **HIPAA.** Amazon Bedrock and Amazon Bedrock AgentCore are on the AWS HIPAA Eligible Services
  list (last updated March 16, 2026). The BAA is accepted in AWS Artifact in the console
  ([SNIPPET] https://aws.amazon.com/compliance/hipaa-eligible-services-reference/). Eligibility
  is by service, not by model; AWS does not publish per-model BAA coverage [UNVERIFIED].
- **Nova Canvas (`amazon.nova-canvas-v1:0`).** Documented inpainting, outpainting, variation,
  background removal, conditioning ([SNIPPET] https://docs.aws.amazon.com/nova/latest/userguide/image-generation.html).
  Pricing: standard 1024x1024 $0.04, 2048 $0.06; premium $0.06 / $0.08
  ([THIRD-PARTY] https://modelavailability.com/models/amazon/nova-canvas; aggregators disagree,
  some list a flat $0.06). **Lifecycle: Legacy since March 30, 2026, end of life September 30,
  2026** ([SNIPPET] https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle-legacy.html,
  via its zh-cn copy; [THIRD-PARTY] https://www.eweek.com/news/amazon-nova-ai-overhaul/). As of
  today Nova Canvas is past end of life. Not a contingency.
- **Titan Image Generator G1 v2 (`amazon.titan-image-generator-v2:0`).** Model card lists
  lifecycle Legacy, EOL June 30, 2026 ([SNIPPET] https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-titan-image-generator-g1-v2.html,
  via its pt-br copy). Pricing was $0.01 per standard 1024x1024 image
  ([SNIPPET] https://aws.amazon.com/bedrock/pricing/). Not a contingency.
- **Stability AI on Bedrock, the remaining editing path.** "Stability AI Image Services" went
  GA on Bedrock in September 2025 "in US West (Oregon), US East (N. Virginia), and US East (Ohio)"
  ([SNIPPET] https://aws.amazon.com/about-aws/whats-new/2025/09/stability-ai-image-services-generally-available-amazon-bedrock).
  The suite includes Inpaint, Erase Object, Remove Background, Search and Replace, Search and
  Recolor ([THIRD-PARTY] https://stability.ai/news-updates/stability-ai-brings-image-services-to-amazon-bedrock-delivering-professional-creative-control-with-enterprise-grade-infrastructure).
  Stable Image Inpaint model ID `stability.stable-image-inpaint-v1:0`, geo ID
  `us.stability.stable-image-inpaint-v1:0`, "fills in masked regions of images with contextually
  appropriate content based on text prompts"
  ([SNIPPET] https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-stability-ai-stable-image-inpaint.html).
  Price about $0.07 per generation for inpaint and object removal, $0.08 style transfer
  ([THIRD-PARTY] https://caylent.com/blog/amazon-bedrock-pricing-explained; AWS Marketplace listing
  shows $0.07 per output for Remove Background). Default quota reported as **10 requests per
  minute** in us-east-1 ([THIRD-PARTY] https://awsfundamentals.com/limits/bedrock); AWS's model
  card only says defaults "might be updated depending on regional factors, payment history,
  fraudulent usage, and/or approval of a quota increase request" ([SNIPPET] same model card).
  Generation models: Stable Image Core (about $0.04), Stable Image Ultra ($0.14, Oregon), SD3.5
  Large ([THIRD-PARTY] https://www.mindstudio.ai/blog/amazon-nova-canvas-vs-stable-image-core-budget-comparison;
  [SNIPPET] https://aws.amazon.com/blogs/aws/stable-diffusion-3-5-large-is-now-available-in-amazon-bedrock).
- **Quota increase path.** Service Quotas console > Amazon Bedrock > quota row > Request increase
  at account level, when the row is marked adjustable; non-adjustable rows need a Support case.
  AWS states: "due to overwhelming demand, priority will be given to customers who generate
  traffic that consumes their existing quota allocation. Your request might be denied if you
  don't meet this condition" ([SNIPPET] https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-increase.html).
  Bedrock expanded Service Quotas support in May 2026
  ([SNIPPET] https://aws.amazon.com/about-aws/whats-new/2026/5/amazon-bedrock-service-quotas/).
- **Realism and identity caveats (documentation only).** The Nova Canvas AI Service Card defines
  an "effective" output partly by "human body parts are attached in the correct places and objects
  are not warped" and says customers must "assess the performance of any AI service on their own
  content for each use case" ([SNIPPET] https://docs.aws.amazon.com/ai/responsible-ai/nova-canvas/overview.html).
  Stability's inpaint card documents masked-region fill only; nothing in AWS or Stability docs
  claims identity preservation for a specific person [UNVERIFIED]. Mask-based inpainting changes
  only the masked pixels, so the unmasked face is preserved by construction, and the risk
  concentrates at the mask boundary.

### 3.2 Azure OpenAI (Microsoft Foundry)

- **Models and regions.** `gpt-image-1.5` (version 2025-12-16) is listed in `eastus2` and
  `westus3`, not `eastus` or `centralus`; capabilities include "image to image generation and
  inpainting" ([SNIPPET] https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability).
  Access status conflicts: the how-to page lists GPT-Image-1.5 as limited-access preview while a
  Microsoft Foundry blog says it is generally available
  ([SNIPPET] https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/dall-e;
  https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-openai%E2%80%99s-gpt-image-1-5-in-microsoft-foundry/4478139).
  `gpt-image-2` exists in Foundry (April 2026) with regions unconfirmed [UNVERIFIED]. DALL-E 3
  retired March 4, 2026 ([SNIPPET] dall-e how-to page). GPT-image models require a Limited Access
  registration ([SNIPPET] https://learn.microsoft.com/en-my/Azure/foundry/responsible-ai/openai/limited-access).
- **Default quota.** Image models: **9 requests per minute** for gpt-image-1, gpt-image-1.5 and
  gpt-image-2, 12 for gpt-image-1-mini, per region, per model, per deployment type; edits are
  not separated from generations; rate is evaluated over 1 or 10 second windows and failed
  requests count ([SNIPPET] https://learn.microsoft.com/en-us/azure/foundry/openai/quotas-limits).
  Increase path: the quota request form linked from
  https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/quota, or deploy in a second
  region "in the same geography" ([SNIPPET] same pages).
- **Price.** The Azure pricing page renders GPT-Image-1.5 rows as "$-" and could not be read
  here; aggregators list Azure at $5.00 per 1M input tokens and $32.00 per 1M image output
  tokens, matching OpenAI's direct rate ([THIRD-PARTY] https://cloudprice.net/models/azure/gpt-image-1.5;
  https://futureagi.com/llm-cost-calculator/azure-openai/gpt-image-1-5). At OpenAI's published
  token counts, 1024x1024 output is $0.009 low, $0.034 medium, $0.133 high
  ([SNIPPET] https://developers.openai.com/api/docs/models/gpt-image-1.5). Treat Azure per-image
  cost as "about the same as OpenAI direct, unconfirmed".
- **BAA.** Microsoft's HIPAA BAA is incorporated in the Product Terms and DPA for in-scope
  services with no separate signature; coverage is "determined at the Azure service level, rather
  than at the individual model level", and "Azure Direct Models and first-party Azure AI services
  are explicitly included" ([SNIPPET] https://learn.microsoft.com/en-us/azure/compliance/offerings/offering-hipaa-us;
  Microsoft Q&A moderator answers at https://learn.microsoft.com/en-us/answers/questions/5942711/what-ai-models-are-covered-under-the-baa).
  Two open issues: community answers say image inputs are "not explicitly in HIPAA scope yet"
  ([THIRD-PARTY] https://learn.microsoft.com/en-us/answers/questions/5645394/is-azure-openai-hipaa-compliant-for-pdf-inputs),
  and whether default abuse monitoring (30-day storage, possible human review) is inside the BAA
  was asked in July 2026 without an authoritative answer
  ([THIRD-PARTY] https://learn.microsoft.com/en-us/answers/questions/5941618/is-default-abuse-monitoring-for-azure-openai-(foun).
  Modified abuse monitoring is a Limited Access feature for "customers and partners managed by a
  Microsoft account team" ([SNIPPET] limited-access page). For a self-serve startup this is the
  weakest BAA position of the three clouds.
- **Realism and identity caveats.** Microsoft documents C2PA metadata on all outputs and input
  and output moderation across image models ([SNIPPET] https://ai.azure.com/catalog/models/gpt-image-1);
  no documented identity-preservation claims [UNVERIFIED].

### 3.3 OpenAI direct API

- **BAA scope.** "HIPAA eligibility for the OpenAI API is contingent on Customer's account being
  provisioned with Modified Retention"; once provisioned and the BAA executed, listed endpoints
  "can be used for processing PHI, even if data is retained", and the list includes
  `/v1/images/generations`, `/v1/images/edits`, `/v1/images/variations`
  ([SNIPPET] https://help.openai.com/en/articles/20001069-hipaa-eligible-products-and-functionality).
  Request path: https://help.openai.com/en/articles/8660679-how-can-i-get-a-business-associate-agreement-baa-with-openai
  (blocked here; [UNVERIFIED] current form).
- **Data residency.** US data residency is available to "eligible API ... customers" approved
  for advanced data controls, set per project at creation; for those projects "model requests and
  responses are not stored at rest" ([SNIPPET] https://openai.com/index/expanding-data-residency-access-to-business-customers-worldwide;
  https://help.openai.com/en/articles/9903489-data-residency-and-inference-residency). Default
  projects are "global". US-only *processing* for API inference is not confirmed [UNVERIFIED].
- **Models and price.** `gpt-image-1.5`: 1024x1024 $0.009 / $0.034 / $0.133 (low, medium,
  high); `gpt-image-1` is deprecated with retirement reported for Oct 23, 2026
  ([SNIPPET] OpenAI model pages; [THIRD-PARTY] https://pricepertoken.com/gpt-image-pricing).
  `gpt-image-2` (April 2026) about $0.006 / $0.053 / $0.211 at 1024x1024
  ([THIRD-PARTY] https://aireiter.com/blog/gpt-image-2-api-pricing). Rate limits are tier-based
  and not published for images here [UNVERIFIED].
- **Caveat.** Not a cloud under AfterVue's existing BAA; a second BAA, a second vendor review and
  a second data-flow diagram.

### 3.4 Others

No other image-editing provider with documented, self-serve HIPAA eligibility was found.
Anthropic signs BAAs but has no image generation. Stability AI direct, Black Forest Labs (FLUX),
fal.ai and Replicate: no BAA documentation located [UNVERIFIED]; one aggregator (Atlas Cloud)
markets itself as "HIPAA compliant" hosting FLUX and Imagen 4 ([THIRD-PARTY]
https://www.atlascloud.ai/blog/guides/best-ai-image-generation-apis-in-2026-complete-developer-guide);
treat as marketing until a BAA is in hand.

## 4. Architecture options that reduce requests

Constraint: nothing may persist beyond the consult session. "Session" below means the clinic
operator's active consult in one browser or iPad session, ended explicitly or by idle timeout.

| Option | Requests saved | Compatible with "photos never stored"? | Notes |
| --- | --- | --- | --- |
| **A. Per-session result cache** (keyed by session ID + photo hash + treatment + level) | Every repeat view, toggle, or re-render: typically 30-60% of calls in a consult | Yes, if the cache is process memory (or the client) with TTL bound to the session and purged on session end. Not compatible with Memorystore/Redis or any disk store, which persists independent of the session. | The Cloud Run service is single-tenant per request; keep the cache in the browser (IndexedDB cleared on end) or in the instance's memory with a hard byte cap. Never log the key material. |
| **B. Fewer intensity levels, client-side interpolation** (generate "subtle" and "full"; blend 25/50/75% in the browser with an alpha crossfade or a per-pixel mix) | From 3-5 generations per treatment to 2 | Yes, entirely client-side | Interpolation between two model outputs of the same face is a pixel blend, not a re-render; label it as an illustration. Aligns with the existing AI-illustration disclaimer. |
| **C. Batch treatments into one edit call** (one prompt describing lips + cheeks + under-eye at once) | N treatments to 1 call | Yes | Gemini image models return one image per request; `candidateCount` other than 1 is rejected ([THIRD-PARTY] https://discuss.ai.google.dev/t/multiple-candidates-candidatecount-is-not-supported-for-image-generation-models/124694). So batching means one combined edit, and per-treatment isolation then comes from option B or from a second call only when the patient asks to see one treatment alone. |
| **D. Off-peak pre-generation** | Shifts load out of the 10 AM to 4 PM peak | **No** in the literal form: pre-generating before the consult requires holding the photo. Compatible variant: at session start, while intake is completed, fire the full set of edits in a burst (optionally Flex tier for the non-visible ones), hold results only in session memory. | Flex is half price and "in the global endpoint only" with longer latency; the visible first preview still goes Standard or Priority. |
| **E. Spread across DSQ pools** (model and region fan-out) | Multiplies the ceiling: 4 global model pools plus 7 US regional pools for `gemini-2.5-flash-image` | Yes | Zero cost, but outputs differ by model; pin one model per consult session so a patient sees one model's style. US regional endpoints keep processing in the US; `global` does not let you choose the processing region ([SNIPPET] locations page). |
| **F. Priority headers on the one visible call** | Does not reduce calls; raises the chance the first preview is served | Yes | 1.8x price on that call only. |
| **G. Per-tenant queue, jittered backoff, honest "preparing" state** | Smooths bursts; already specified in `docs/cloud-credit-plan.md` session 4 and `packages/vertex-resilience/` | Yes | Prerequisite for everything above. |

Combined effect for the December target: 2,500 images/day with A and B applied drops to roughly
1,000-1,250 model calls/day; peak 13/min drops to about 6/min; spread across the four Gemini
image model pools (E) that is under 2/min per pool, which is the ceiling AfterVue measured.
That is tight but inside today's observed capacity without any Google action. The 2027 target
(75/min peak, about 35/min after A+B) does not fit in DSQ at observed rates and needs PT, a
granted increase, or a second provider.

## 5. Recommendation table

### 5.1 Unit costs used

Assumes 1K output, one input photo, about 200 prompt tokens. Prices per 1M tokens from the
[FETCHED] pricing page unless labelled.

| Path | Per-image math | Unit cost |
| --- | --- | --- |
| Gemini 3 Pro Image, Standard | 1,120 x $120/M = $0.1344 + 560 x $2/M input image + text | **$0.136** |
| Gemini 3 Pro Image, Priority | 1,120 x $216/M = $0.242 + 560 x $3.60/M | **$0.244** |
| Gemini 3 Pro Image, Flex | 1,120 x $60/M = $0.067 + 560 x $1/M | **$0.068** |
| Gemini 3.1 Flash Image, Standard | 1,120 x $60/M = $0.067 + 1,120 x $0.50/M | **$0.068** (512 px output: $0.045) |
| Gemini 3.1 Flash Image, Priority | 1,120 x $108/M = $0.121 + 1,120 x $0.90/M | **$0.122** |
| Nano Banana 2.1, Standard | 1,120 x $30/M = $0.0336 + 1,120 x $1.50/M | **$0.035** |
| Nano Banana 2.1, Priority | 1,120 x $54/M = $0.060 + 1,120 x $2.70/M | **$0.064** |
| Gemini 2.5 Flash Image, Standard (regional) | 1,290 x $30/M = $0.0387 + 1,290 x $0.30/M | **$0.039** |
| Provisioned Throughput, Gemini 3 Pro Image | Per image: 1,120 output tokens x burndown 60 = 67,200 + about 800 input = 68,000 throughput tokens. At 500 tokens/s per GSU, one GSU serves one image every 136 s, about **0.44 images/min**. Peak 13/min needs 30 GSUs; 75/min needs 171. 1-month commit $2,700 per GSU per month; 1-year $2,000. ([SNIPPET] throughput and burndown; [FETCHED] GSU prices) | 30 GSU: **$81,000/mo** (1-mo) or $60,000/mo (1-yr). 171 GSU: $461,700/mo. Baseload sizing (average 4.2/min over a 10-hour clinic day, PayGo for the rest): 10 GSU, $27,000/mo. |
| AWS Stable Image Inpaint | $0.07 ([THIRD-PARTY]) | **$0.07** |
| Azure / OpenAI gpt-image-1.5 | $0.034 medium, $0.133 high, plus about $0.01 input image ([SNIPPET] OpenAI; Azure parity [THIRD-PARTY]) | **$0.045 / $0.143** |

Volumes: 50 clinics = 75,000 images/month; 300 clinics = 450,000 images/month. Per-image costs
below are before the roughly 50% call reduction from options A and B.

### 5.2 Paths compared

| Path | Time to capacity | Cost, 50 clinics (75k/mo) | Cost, 300 clinics (450k/mo) | BAA | US-only | Effort | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **1. Reduce and spread** (options A, B, E, G; stay on DSQ) | 1-2 weeks of engineering; no Google action | At 50% reduction, Flash primary: 37.5k x $0.068 = **$2,550**; Pro primary $5,100 | 225k x $0.068 = $15,300 (but exceeds observed DSQ ceiling) | Yes, existing Google BAA | Mixed: `global` for Gemini 3 models processes in an unspecified region; `gemini-2.5-flash-image` regional calls stay US | M | **Do first.** Covers December if observed rates hold. |
| **2. Priority PayGo on visible call** | Same day | Priority on about 1 in 3 calls (12.5k): Flash adds 12.5k x ($0.122 - $0.068) = $675, total about **$3,225**; Pro primary adds 12.5k x ($0.244 - $0.136) = $1,350, total about $6,450 | Flash: $15,300 + 75k x $0.054 = about $19,350 | Yes | Global only, processing region not selectable | S | Do with path 1. Buys reliability, not quota. |
| **3. Quota request + sales + Standard Support** | 2 business days for the request; sales conversation 1-3 weeks; outcome uncertain for DSQ models | $29/mo support + usage | Same | Yes | Ask for regional enablement of the Gemini 3 image models as part of the request | S | Do in week 1; low cost, unknown payoff. |
| **4. Startup program (Start now, Scale AI after funding)** | A few business days to 10+ | $2,000 credit covers nearly all of path 1 for a month | Scale AI: up to $250k year 1 covers all of 2027's PayGo at Flash prices ($183,600/yr) | n/a (money) | n/a | S | Apply this week. Credits also pay for PT experiments. |
| **5. Provisioned Throughput, 1-week probe (1 GSU)** | 1 day to buy; measures real images/min per GSU | **$1,200** one-off | n/a | Yes | Global or non-global (+10%) | S | Do in week 2-3 to replace the [SNIPPET] throughput math with a measurement. |
| **6. Provisioned Throughput at scale** | Immediate once bought | Peak-sized: $81,000/mo; baseload-sized 10 GSU: $27,000/mo | $461,700/mo peak-sized | Yes | Yes if non-global | S | Only if the probe shows far better images/GSU than the table implies, or with Scale AI credits. Otherwise not viable. |
| **7. AWS Bedrock, Stable Image Inpaint** | 1 week to BAA (Artifact) + prototype; quota increase from 10 RPM uncertain on a new account ("priority to customers who ... consume their existing quota") | 75k x $0.07 = **$5,250** (full volume; $2,625 after reduction) | $31,500 | Yes (Bedrock HIPAA eligible) | Yes (us-east-1, us-east-2, us-west-2) | L (mask-based prompting differs from Gemini's conversational edit; new infra, new vendor review) | Build a thin prototype in week 3-4 as insurance. |
| **8. Azure OpenAI gpt-image-1.5** | Limited Access registration; image-input BAA scope unresolved | 75k x $0.045 = $3,375 medium; $10,725 high | $20,250 / $64,350 | Service-level BAA; image modality and abuse monitoring unresolved | eastus2/westus3 | M | Hold. Re-check when Microsoft documents image scope. |
| **9. OpenAI direct with BAA + Modified Retention** | Weeks (BAA request, Modified Retention provisioning, data-residency approval) | Same unit prices as 8 | Same | Yes, images/edits listed | Residency at rest yes; processing residency unconfirmed | M | Hold; third BAA, non-cloud vendor. |

### 5.3 Recommended order of operations, next 30 days

**Week 1 (Oct 9-16)**
1. Accept the Google Cloud BAA in the console (IAM & Admin > Review and Accept) if not already
   incorporated; save a dated copy of the covered-products page; ask the account team in writing
   whether Imagen and Cloud Run are on it and which abuse-monitoring exception route applies.
2. Zero-retention configuration on the Vertex project: disable in-memory caching at project level,
   confirm request/response logging is off, submit the abuse-monitoring exception.
3. Sign up for Standard Support ($29 minimum). Open one case: "DSQ 429 on gemini-3-pro-image and
   gemini-3.1-flash-image at 2 RPM; request regional enablement in a US region and a
   per-project allocation; HIPAA workload". Submit the same text through the quota page's
   "Request quota adjustment" link and the sales chat. Use `docs/capacity-request-checklist.md`.
4. Apply to the Google for Startups Cloud Program, Start tier, with Appendix A. Note the
   Scale AI re-application trigger (institutional SAFE or priced round).
5. Counsel review of the Service Specific Terms healthcare restriction against the product copy.

**Week 2 (Oct 16-23)**
6. Ship path 1: session cache, two-level generation with client interpolation, model and region
   fan-out with per-session model pinning, Priority headers on the visible call, 429 and fallback
   counters on the health endpoint. This is session 4 of the credit plan plus the fan-out.
7. Load-test against the real endpoints at 13/min for 15 minutes; record per-pool 429 rates.

**Week 3 (Oct 23-30)**
8. Buy 1 GSU of Provisioned Throughput for one week on the model the fan-out shows as best
   quality per dollar (likely `gemini-3.1-flash-image` or Nano Banana 2.1). Measure sustained
   images per minute. Replace the section 5.1 PT row with the measurement.
9. If Google has answered the quota case, wire whatever region or allocation was granted
   (credit plan session 12).

**Week 4 (Oct 30-Nov 6)**
10. Decide: if path 1 plus any Google grant holds 13/min with under 1% user-visible failures,
    stay single-provider through December and plan PT or Scale AI credits for 2027. If not, start
    the AWS Bedrock Stable Image Inpaint prototype (accept the AWS BAA in Artifact, us-east-1,
    one Lambda or Cloud Run proxy, mask generated from the treatment area) and file its quota
    increase early, because AWS prioritises accounts that already consume quota.

## Appendix A. Draft application answers, Google for Startups Cloud Program

Role titles only. Replace bracketed items before submitting. Keep every answer under the form's
character limit (unknown; most fields accept a few hundred characters).

**Company name and website.** AfterVue, https://getaftervue.com. Business email on the
getaftervue.com domain, matching the Cloud Billing account.

**One-line description.** AfterVue is a HIPAA-covered SaaS for medical spas and aesthetic
clinics: in the consult room, it turns a patient's photo into an illustrative, clearly labelled
preview of a proposed treatment, so the provider and patient can discuss options with a shared
visual. Photos are processed and never stored.

**Stage and funding (Start tier).** Pre-funded, founder-operated, incorporated within the last 24
months. Working MVP in use with a first clinic; iOS build in App Store review; plan to raise an
institutional pre-seed round in [quarter]. No Google Cloud credits received beyond the free
trial (started Sept 2026).

**Why Google Cloud.** The product's core function runs on Gemini image models on Vertex AI
(Gemini Enterprise Agent Platform), chosen because inference runs inside our own project under
the Google Cloud BAA with zero-data-retention controls. Supporting services: Cloud Run for the
PHI-touching API, Firestore and Cloud Scheduler for lead management, Cloud Build. Google Workspace
is the company's email and document platform.

**AI-first statement (for the AI tier when eligible).** AI is the product, not a feature:
every consult session calls Gemini image models to produce the treatment illustration, and the
roadmap (multi-treatment compositing, intensity interpolation, provider-specific style
calibration) is built on the same models. Without Gemini, there is no AfterVue.

**Expected Google Cloud usage, next 12 months.** 50 clinics by December 2026 at about 2,500
images per day; 300 clinics in 2027 at about 15,000 per day. At current list prices that is
roughly $5,000 per month of Gemini image generation by year end and $30,000 to $60,000 per month
during 2027, plus Cloud Run and data services. The immediate technical blocker is dynamic shared
quota on the image models at about 2 requests per minute; we are requesting regional capacity
and would use Provisioned Throughput with program credits.

**Team.** Founder and CEO (product, sales, clinical partnerships); fractional engineering lead
(Cloud Run, Vertex integration); advisory nurse practitioner for clinical copy review.
[Adjust to actual roles.]

**Compliance posture.** Google Cloud BAA accepted; HIPAA policies drafted; zero-data-retention
configuration on the Vertex project; no patient images persisted; PHI-touching endpoint moving
from Vercel to Cloud Run so all PHI processing sits under one BAA.

**What we need from the program beyond credits.** An account manager who can route a dynamic
shared quota and regional enablement request for Gemini image models, and guidance on sizing
Provisioned Throughput for an image workload.

## Appendix B. Source index

Fetched in session (cloud.google.com, Oct 9, 2026):
https://cloud.google.com/vertex-ai/generative-ai/pricing ·
https://cloud.google.com/security/compliance/hipaa-compliance ·
https://cloud.google.com/terms/service-terms ·
https://cloud.google.com/support ·
https://cloud.google.com/contact ·
https://cloud.google.com/startup · /startup/faq · /startup/benefits · /startup/pre-funded ·
/startup/early-stage · /startup/ai · https://cloud.google.com/terms/startup-program-tos ·
https://cloud.google.com/blog/products/ai-machine-learning/provisioned-throughput-on-vertex-ai

Official pages cited from search extracts only (blocked by network policy):
https://docs.cloud.google.com/vertex-ai/generative-ai/docs/quotas ·
https://docs.cloud.google.com/vertex-ai/generative-ai/docs/dynamic-shared-quota ·
https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/priority-paygo ·
https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/flex-paygo ·
https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/provisioned-throughput/supported-models ·
https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/provisioned-throughput/gemini-3-nano-banana-models ·
https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations ·
https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash-image ·
https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes ·
https://docs.cloud.google.com/docs/security/compliance/hipaa ·
https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention ·
https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance ·
https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/abuse-monitoring ·
https://support.google.com/cloud/answer/6329727 ·
https://docs.cloud.google.com/filestore/docs/requesting-quota-increases ·
https://aws.amazon.com/compliance/hipaa-eligible-services-reference/ ·
https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle-legacy.html ·
https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-stability-ai-stable-image-inpaint.html ·
https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-increase.html ·
https://aws.amazon.com/about-aws/whats-new/2025/09/stability-ai-image-services-generally-available-amazon-bedrock ·
https://learn.microsoft.com/en-us/azure/foundry/openai/quotas-limits ·
https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability ·
https://learn.microsoft.com/en-us/azure/compliance/offerings/offering-hipaa-us ·
https://help.openai.com/en/articles/20001069-hipaa-eligible-products-and-functionality ·
https://help.openai.com/en/articles/9903489-data-residency-and-inference-residency
