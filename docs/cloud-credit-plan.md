# Spending the $250 Claude Code cloud-session credit

Prepared Oct 9, 2026 from the Launch To-Do List (Sept 5), the Google Cloud capacity
request draft (Sept 16), the App Store listing draft (Sept 27), the Sept 9 nightly
brief, and the billing emails in mikel@getaftervue.com.

## 1. What the credit is, and the deadline

Anthropic gave Max subscribers a one-time $250 credit when Claude Code cloud sessions
left preview on Sept 23. It applies only to **cloud sessions** (claude.ai/code, the
Code tab in the mobile app, Desktop "Cloud", `claude --cloud`, and Routines). It is
not usable for local terminal sessions or chat. Press coverage puts the claim deadline
at Oct 7 and expiry of any unclaimed balance at about **Nov 4**. Treat Nov 4 as the
hard stop and check the balance at claude.ai/settings before planning past it.

That gives roughly three and a half weeks. Cloud sessions run in parallel, so the
limiting factor is not wall-clock time but having tasks that do not need you logged
in to something.

## 2. The one blocker: the code is not on GitHub yet

Cloud sessions clone from GitHub. `scaleforcenow-maker/aftervue` was created today
and is **empty**, and it is **public**. The working repo (`Documents/Claude/Aftervue
AI`, ~369 MB with history) is still on the Mac, per `15_Cloud_First_Operations.md`.

Do this before anything else, in this order:

1. **Make the repo private** (GitHub -> Settings -> Danger zone -> Change visibility).
   The codebase contains tenant configs, the lead relay, HIPAA policy drafts, the
   App Store review code, and possibly `.env` leftovers. None of that should sit in a
   public repo for even an hour.
2. Push from the Mac: `brew install gh && gh auth login`, then
   `tools/cloud/push_to_github.sh` (already written Sept 5). If that script predates
   this repo name, the manual version is:
   ```bash
   cd ~/Documents/Claude/"Aftervue AI"
   git remote add origin https://github.com/scaleforcenow-maker/aftervue.git
   git push -u origin --all && git push origin --tags
   ```
   `.env*` must be in `.gitignore` first (the Sept 5 to-do says it is; verify with
   `git ls-files | grep -i env`).
3. Install the Claude GitHub App on the repo (github.com/apps/claude). This is what
   lets sessions create PRs and turns on Auto-fix.
4. In claude.ai/code -> Environments, edit **Default** or create "AfterVue":
   - Network: **Custom**, keep the default package list, and add
     `getaftervue.com`, `*.vercel.app`, `aiplatform.googleapis.com`,
     `*.googleapis.com`, `api.stripe.com`, `api.cloudflare.com`, `sentry.io`.
   - Network secrets (Pro/Max only; the session never sees the value): a restricted
     Stripe key for `api.stripe.com`, a Cloudflare API token for `api.cloudflare.com`,
     a Vercel token for `api.vercel.com`. Add each only for the session that needs it.
   - For Google Cloud: a short-lived token works best. On the Mac run
     `gcloud auth print-access-token` and paste it as the env var
     `CLOUDSDK_AUTH_ACCESS_TOKEN` right before starting a deploy session. It expires in
     an hour, which is the point.
5. This branch adds `.claude/settings.json` + `scripts/cloud_session_setup.sh`, a
   SessionStart hook that runs `npm install` / `pip install` only inside cloud
   sessions. Merge it so every session starts with dependencies in place.

## 3. Billing status (checked Oct 9)

| Email | Date | Status |
| --- | --- | --- |
| Google Cloud: billing account suspended for failed payment | Oct 1 | **Resolved.** Google confirmed the account "is in good standing at this time" on Oct 3. Vertex AI and Cloud Run deploys are unblocked. |
| Google Workspace payment declined, suspension threatened Oct 6 | Oct 1 | **Resolved.** Payment received Oct 2; next invoice due Oct 30. |
| Gemini prepay credits depleted, app served the demo sample | Sept 9 | Superseded by the move to Vertex AI (postpay) on Sept 16. |

Nothing in billing blocks the sessions below any more. The remaining gate is the code
push in section 2.

## 4. Session plan, in priority order

Each row is one cloud session. Prompts are in section 5, ready to paste at
claude.ai/code with the aftervue repo selected. Run the first three in parallel on
day one; they are independent.

| # | Session | Why it earns its credit | Needs from you first |
| --- | --- | --- | --- |
| 1 | **Secrets and PHI audit of the pushed repo** | The repo just moved off a single Mac. One pass to confirm no keys, tokens, patient data, or `.env` history is in git before anyone else (or Auto-fix) touches it. Rewrites history only with your approval. | Repo private and pushed |
| 2 | **Reconcile the Launch To-Do List against the repo** | The Sept 5 list is five weeks stale; `_context/HANDOFF.md` in the repo has the real state (Vertex move, iOS build, support page). Produces an updated list and marks what is actually left. Everything after this gets sharper. | Repo pushed |
| 3 | **CI pipeline + test gate** | The lead-management service has 74 tests, the site has axe and Lighthouse checks, there are Python tools with none. A GitHub Actions workflow running all of it on every PR is what makes the remaining sessions safe to merge and makes Auto-fix useful. | Claude GitHub App installed |
| 4 | **Preview API resilience under the 2 req/min Vertex quota** | Sept 16 measurement: 429 after about two image generations per minute, no self-serve quota. Until Google raises capacity, the app needs a per-tenant queue, retry with backoff, automatic fallback to `gemini-3.1-flash-image`, an honest "preparing your preview" state, and a 429 counter you can read. This is the item most likely to embarrass a live demo. | Nothing (build + tests; deploy after billing is fixed) |
| 5 | **Deploy lead management v1 to Cloud Run** | Built Sept 5, 74 tests green, never deployed because the GCP project did not exist. It now does (`aftervue-vertex-prod`). `docs/DEPLOY.md` and `deploy.sh` are in the repo. Unblocks Asunshine's front desk working leads from an inbox instead of a CSV. | Billing fixed; 1-hour gcloud token; Postmark key as network secret |
| 6 | **Move `/api/generate` from Vercel to Cloud Run** | Launch list 2.5: puts the only PHI-touching function under the Google Cloud BAA instead of needing a Vercel BAA, and it is cheaper. Includes Turnstile verification server-side. | Billing fixed; same token |
| 7 | **Cloudflare Turnstile + Sentry with PHI scrubbing** | Two launch-list items that are pure code: Turnstile on the widget lead form with server-side token check, Sentry on the Next.js app and functions with a `beforeSend` that drops anything matching image/photo/base64/selfie, verified with a test event. | Cloudflare token and Sentry DSN as network secrets |
| 8 | **Stripe Product/Price catalog + Stripe Tax** | Critical-path item 5. The Stripe account exists (2FA recovery code filed Sept 12). The itemization rule is written (`ops/10`). A session with a restricted key builds every SKU as its own Price with the right tax code in test mode, runs a test invoice showing separate App / services lines, then mirrors to live on your go-ahead. | Restricted Stripe API key as a network secret |
| 9 | **SEO article backlog + weekly cadence** | Four articles on uncovered clusters (A commercial, D marketing software, G consult-room, J website design) were "in production" Sept 5. `tools/seo/build_articles.py` exists. One session drafts, sources, builds, and opens a PR per article. Then make it a Routine every Monday. | Nothing |
| 10 | **App Store listing: localized metadata + privacy questionnaire** | The iOS build itself needs Xcode on your Mac, so it is not cloud work. The es and pt-BR store metadata (v1.1), the App Privacy answers from `ops/34` §2a, and the review-notes final text are. | Nothing |
| 11 | **Per-tenant signed tokens for the widget** | Deferred on the launch list until a second practice signs. Cheap to build now while the credit is free; ship behind a flag. | Nothing |
| 12 | **Capacity request follow-through** | After you send the Google Cloud sales form from `32_Google_Cloud_Capacity_Request_DRAFT`, a session wires whatever capacity or region Google grants: `VERTEX_IMAGE_MODEL` / `VERTEX_LOCATION`, the model list, and a verification run. | Google's reply |

### Not cloud-session work (do not spend credit here)

- Payments and sign-ups: Google Cloud and Workspace billing, Vercel Hobby -> Pro,
  Google Voice, Plausible, UptimeRobot, insurance, attorney, Stripe KYC. These are
  logins and cards only you hold.
- BD agents 01-16: they drive Chrome, Gmail, and Sheets from the Mac as Cowork
  scheduled tasks. The Sept 5 cloud-first doc already decided they stay local.
- The 42-item Approval Queue, the 16 leads with blank emails, the Asunshine go-live
  date, the 11 BD decisions. Decisions, not code.
- iOS archive, TestFlight, and App Store Connect: macOS and your Apple ID.
- DMARC to p=quarantine, Bing Webmaster import, Search Console owner add: DNS and
  console clicks, two minutes each.
- VoiceOver walk-through and Asunshine iPad Guided Access: hands on a device.

### How to pace it

- Day 1: sessions 1, 2, 3 in parallel. Review their PRs the same evening.
- Days 2-5: 4, 7, 8, 9, 10, 11 in parallel as you have review bandwidth. Each is
  self-contained and opens its own PR.
- When Google Cloud billing is restored: 5 and 6, one at a time, each with a fresh
  one-hour token.
- Turn on **Auto-fix** on every PR a session opens, so CI failures and your review
  comments get fixed without a new session.
- Check the credit balance twice a week. If you are under-spending by Oct 25, add
  a Routine: a nightly cloud session that rebuilds the context recompile, runs the
  test suite, and files a short status PR comment. That converts leftover credit into
  a standing nightly check instead of letting it expire.

## 5. Paste-ready session prompts

Start each at claude.ai/code with repository `scaleforcenow-maker/aftervue`.

### Session 1: secrets and PHI audit

> Audit this repository for anything that should not be in version control now that it
> lives on GitHub. Search the full git history, not just HEAD: API keys, tokens,
> `.env` files, service-account JSON, Stripe and Postmark keys, Gemini/Vertex keys,
> the Web3Forms leadKey values, Google Form IDs that accept submissions, patient or
> lead data (names, phones, emails, photos, CSV exports), and the Asunshine tenant
> config. Use gitleaks or trufflehog if installable, plus targeted grep. Produce
> `docs/security/repo-audit-2026-10.md` listing each finding with file, commit, and
> recommended action (rotate, remove, rewrite history). Do not rewrite history
> yourself; add any files that must go to `.gitignore` and open a PR. Flag every key
> that needs rotation in the PR description.

### Session 2: reconcile the launch list

> Read `_context/HANDOFF.md`, `CLAUDE.md`, and every file under `ops/` and `research/`
> dated after Sept 5, 2026. Then take the Launch To-Do List (the Sept 5 version is in
> the Drive library as `Aftervue_Launch_To_Do_List.md`; if a copy exists in the repo
> use that) and produce `ops/16_Launch_To_Do_List_2026-10.md`: every item with its
> current status (done / built-not-deployed / open / blocked-on-Mikel), the evidence
> for the status (file or commit), and a new critical path. Keep the ☐ ☑ ◐ convention.
> Separate items a cloud session can do from items that need Mikel's login or payment.
> Open a PR.

### Session 3: CI pipeline

> Add GitHub Actions CI to this repository. Detect every runnable test suite
> (`aftervue-leads` has 74 unit tests plus an end-to-end scenario; the site and
> `aftervue-app` have axe-core accessibility checks; `tools/` has Python scripts).
> Build one workflow that runs on every pull request: Node tests, Python
> `py_compile` / pytest where tests exist, `tools/qa/doc_sweep.py`, and the
> accessibility pass against a local build. Cache dependencies. Keep total runtime
> under 10 minutes. Add a status badge to the README. Confirm the workflow passes
> on your own PR before you finish. Do not skip or weaken any existing test.

### Session 4: preview API resilience

> The Vertex AI image models return 429 RESOURCE_EXHAUSTED after about two
> generations per minute per model on this project (see
> `_context/HANDOFF.md`, Sept 16 capacity sections). Make `/api/generate` degrade
> gracefully instead of falling back to the demo sample: (1) a small in-memory
> per-instance queue with a concurrency limit and jittered exponential backoff on
> 429; (2) automatic fallback from `gemini-3-pro-image` to `gemini-3.1-flash-image`
> when the primary is exhausted, recorded in the response so the UI can label it;
> (3) a client-side "preparing your preview" state with a real progress estimate
> instead of the canned image; (4) a counter of 429s and fallbacks exposed on the
> health endpoint and logged without any image or patient data; (5) a feature flag
> so the behavior can be turned off. Add unit tests for the queue and the fallback
> logic with a mocked Vertex client. Never log request bodies. Open a PR with a
> short runbook section in `docs/`.

### Session 5: deploy lead management v1

> Deploy `aftervue-leads/` to Cloud Run in project `aftervue-vertex-prod` following
> `aftervue-leads/docs/DEPLOY.md` and `deploy.sh`. The environment variable
> `CLOUDSDK_AUTH_ACCESS_TOKEN` holds a one-hour token; use it with gcloud and do not
> print it. Use a us-east or us-central region. Create the Firestore database if
> missing, the Cloud Scheduler jobs the docs describe, and a scoped service account
> (no Owner or Editor). Postmark's key is a network secret for `api.postmarkapp.com`.
> Run the end-to-end scenario against the deployed URL. Then provision the Asunshine
> tenant with `bin/tenant.js` but leave `baa_confirmed` false. Write what you did,
> the service URL, and anything that needs Mikel to `docs/DEPLOY_LOG_2026-10.md`
> and open a PR.

### Session 6: move /api/generate to Cloud Run

> Port the Vercel function `/api/generate` to a Cloud Run service in
> `aftervue-vertex-prod` so that the only PHI-touching endpoint runs under the
> Google Cloud BAA. Keep the request/response contract identical. Use Workload
> Identity or a Vertex AI User service account, never an API key. Carry over the
> origin allowlist, per-IP limits, `Cache-Control: no-store`, and the no-payload
> logging rule. Add the Turnstile token verification server-side. Build and deploy
> with the one-hour token in `CLOUDSDK_AUTH_ACCESS_TOKEN`, then add a Vercel rewrite
> so the public path is unchanged, behind an environment flag so we can switch back.
> Verify parity with a side-by-side run on the demo photo pair. Open a PR.

### Session 7: Turnstile + Sentry

> Two launch-list items from `ops/03_Web_Infra_Security.md`. First, add Cloudflare
> Turnstile to the widget's lead form and the site's request-a-call form, with
> server-side verification in `/api/lead` (the Cloudflare secret is a network secret
> for `challenges.cloudflare.com`). Second, add Sentry to the Next.js app and the
> Vercel functions on the free Developer tier with a `beforeSend` that removes any
> field or breadcrumb matching image, photo, base64, selfie, or data URLs, plus
> request bodies entirely. Send one deliberately scrubbed test event and show the
> scrubbed payload in the PR. Tests for both.

### Session 8: Stripe catalog

> Build the Stripe Product/Price catalog described in
> `ops/10_Chart_of_Accounts_and_Invoice_Itemization.md` and `01_Pricing_Methodology`,
> using the restricted Stripe key available as a network secret for `api.stripe.com`
> (test mode first). Each SKU is its own Price with the correct Stripe Tax code; the
> App line is taxable and services lines are not. Enable Stripe Tax. Write the setup
> as an idempotent script in `tools/stripe/` so it can be re-run against live mode.
> Create a test customer, issue a Full Package invoice, and attach the PDF to the PR
> showing separate App and services lines. Do not touch live mode in this session.

### Session 9: SEO articles

> Four briefs in `research/08` §5 are still unpublished: clusters A (commercial),
> D (marketing software), G (consult-room), J (website design). For each, write the
> article in `_seo/drafts/` following the existing articles' structure and the brand
> rules in `CLAUDE.md` (every stat sourced, no counts, no prices, no personal names,
> AI-illustration disclaimer where relevant). Run `tools/seo/build_articles.py`,
> update the sitemap, and open one PR per article so each can be reviewed alone.

### Session 10: App Store metadata

> Using `ops/40_App_Store_Metadata_and_Screenshots.md` and `ops/34`, produce the
> Spanish and Brazilian Portuguese store metadata (name, subtitle, promotional text,
> description, keywords) within Apple's character limits, checked by a script, and the
> completed App Privacy questionnaire answers. Save to `ops/41_App_Store_Localized_
> Metadata.md`. Do not change anything under `aftervue-ios/`.

### Session 11: per-tenant signed tokens

> Implement per-tenant signed tokens for the embed widget as described in the launch
> list (section 2.4). Short-lived HMAC tokens minted by a new endpoint, verified in
> `/api/generate` and `/api/lead`, keyed per tenant in `aftervue-app/config.js`, behind
> a feature flag that defaults off. Tests, a migration note, and a PR.

## 6. Where the current facts came from

- Launch To-Do List, Sept 5 (Drive: `Aftervue_Launch_To_Do_List.docx`)
- `15_Cloud_First_Operations.md`, Sept 5 (repo still on the Mac, push script exists)
- `32_Google_Cloud_Capacity_Request_DRAFT`, Sept 16 (Vertex quota, project IDs)
- `40_App_Store_Metadata_and_Screenshots.md`, Sept 27 (iOS status)
- Nightly brief, Sept 9 (agents, approval queue, Gemini credits)
- Gmail: Google Cloud suspension Oct 1, Workspace payment failure Oct 1,
  Google Cloud free trial Sept 12
- Claude Code docs: cloud sessions, cloud environments (network secrets,
  SessionStart hooks, Auto-fix)

## 7. What was launched on Oct 9 (status log)

The codebase had not been pushed yet, so the sessions below were chosen because they
can be done from the company's documents alone and drop into the main codebase later.
Each runs on its own branch and opens a draft PR against `claude/task-review-credit-usage-5s4irr`.

| Session | Branch | Output |
| --- | --- | --- |
| SEO article, Cluster A | `claude/seo-cluster-a` | `_seo/drafts/ai-before-and-after-simulator-medspa.md` |
| SEO article, Cluster D | `claude/seo-cluster-d` | `_seo/drafts/medspa-marketing-software.md` |
| SEO article, Cluster G | `claude/seo-cluster-g` | `_seo/drafts/medspa-consult-room-technology.md` |
| SEO article, Cluster J | `claude/seo-cluster-j` | `_seo/drafts/medspa-website-design.md` |
| Stripe catalog provisioning | `claude/stripe-catalog` | `tools/stripe/` idempotent script, tests, sample catalog (real amounts stay out of the public repo) |
| Vertex resilience module | `claude/vertex-resilience` | `packages/vertex-resilience/` queue, limiter, backoff, fallback, counters, tests |
| App Store localized metadata | `claude/appstore-localized-metadata` | `ops/41_App_Store_Localized_Metadata.md`, `ops/41_metadata.json`, length checker |
| Repo hygiene and CI | `claude/repo-hygiene-ci` | `.gitignore`, gitleaks config, GitHub Actions CI, brand-rule checker, `CLAUDE.md`, PR template |
| Cloud Run + Vertex infra | `claude/infra-cloud-run` | `infra/terraform`, preview-api skeleton, Cloud Build, migration doc |
| Lead-management emails | `claude/lead-emails` | `packages/lead-emails/` eight Postmark templates with previews and tests |

Recurring: a Routine named "AfterVue weekly SEO article (cloud session)" fires every
Monday at 7:47 AM ET and writes one new article as a draft PR. Disable it at
claude.ai -> Routines if the cadence should change.

Still waiting on the code push for: secrets audit of the real history, the CI run
against the real test suites, wiring the resilience module into `/api/generate`, the
Cloud Run deploys, Turnstile and Sentry in the live functions, per-tenant tokens.
