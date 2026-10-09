# CLAUDE.md

Guidance for Claude Code sessions (cloud and local) working in this repository.
Read it before changing anything. `docs/cloud-credit-plan.md` has the session
plan and the paste-ready prompts that brought you here.

## What this repository is

AfterVue (getaftervue.com) helps aesthetic practices show patients an
AI-illustrated preview during a consult. The code of record lives here:

| Path | What it is | Stack |
| --- | --- | --- |
| `/` (site), `api/` | Static marketing site plus Vercel serverless functions: `/api/generate`, `/api/lead`, `/api/unsubscribe` | Node, Vercel |
| `aftervue-app/` | Patient-facing preview app and embed widget. `config.js` holds per-tenant configs | Node/static |
| `aftervue-leads/` | Lead-management service: Express, 74 node tests, Dockerfile, Cloud Run deploy (`docs/DEPLOY.md`, `deploy.sh`) | Node |
| `aftervue-ios/` | iOS kiosk app, generated with XcodeGen from `project.yml`. Builds need a Mac, not a cloud session | Swift |
| `tools/` | Python tooling: `seo/build_articles.py`, `leads/`, `social/`, `appstore/compose_screenshots.py`, `qa/doc_sweep.py`, `chrome/` | Python 3 |
| `ops/`, `research/` | Internal operating docs and research, markdown | - |
| `_seo/drafts/` | Article drafts for the public site | Markdown |
| `docs/` | Repo-level docs, runbooks, audits | Markdown |
| `scripts/` | Repo hygiene: session setup, secret scan, brand check, workflow lint | Bash, Python |

Until the founder pushes from their Mac, only `docs/`, `scripts/`, `.github/`
and the config files at the root exist. CI is written to light up stack by
stack as the code arrives.

## The public-repo rule

This repository is public on GitHub. Treat every commit as published.

Never commit:

- Secrets of any kind: API keys, tokens, `.env*` files, service-account JSON,
  `.p8`/`.pem` keys, Stripe keys (test or live), Postmark tokens, Web3Forms keys,
  Vercel or Cloudflare tokens, `tools/stripe/catalog.json`. Use `.env.example`
  with placeholder values. Real values live in Vercel, Cloud Run, or cloud-session
  network secrets.
- Patient data or anything that could be: photos, previews, names, emails,
  phone numbers, lead CSV exports, Firestore dumps, raw media (`06_Media/**/raw`).
  Photos are processed in memory and never stored. Test fixtures use synthetic data.
- Personal names and phone numbers of staff, practice contacts, or the founder.
  Refer to people by role alias (for example "the founder", "the practice lead",
  "front desk"). Practices are referred to by role too unless the file is
  explicitly a tenant config that already names them.
- Pricing. No dollar amounts next to AfterVue's name in copy, drafts, or docs.
  The pricing methodology lives in `ops/` and is internal; the public site never
  states a price.

Before every commit run `scripts/secret_scan.sh --staged` (or the full
`scripts/secret_scan.sh`). If you find a real secret already in history, do not
rewrite history on your own: rotate the key, remove the file, add it to
`.gitignore`, and flag the need for a history rewrite in the PR description.

## Brand and compliance rules

AfterVue is HIPAA-adjacent and makes no medical claims. These rules apply to
anything a patient or practice might read: the site, the app, `_seo/drafts/`,
App Store text, emails, and social copy. `scripts/brand_check.py` enforces the
mechanical ones in CI; the rest are on you.

- **No practice or location counts.** Never say how many practices, clinics,
  cities, or patients use AfterVue.
- **No outcome promises.** Previews are illustrations, not predictions. Do not
  say or imply "see your results", "this is what you'll look like", guaranteed,
  proven, or any before/after claim about a real procedure.
- **Illustrative labels.** Every preview image and every mention of a preview
  carries the AI-illustration disclaimer (an illustration, not a medical
  prediction; results vary; discuss with your provider).
- **Photos are never stored.** Say so plainly and keep the code honest about it:
  no request-body logging, `Cache-Control: no-store`, nothing written to disk or
  a bucket, nothing in error reports (Sentry `beforeSend` scrubs image, photo,
  base64, selfie, data URLs).
- **AfterVue does not book consults.** It hands off to the practice. Do not
  write flows or copy where AfterVue schedules, confirms, or manages appointments.
- **No beauty scores.** No ratings, rankings, "attractiveness", symmetry scores,
  or any numeric judgment of a face.
- **AI marketing team wording.** The marketing automation is described as an AI
  marketing team that is "managed and monitored by a dedicated human". Use that
  phrase; do not describe it as autonomous or unsupervised.
- **Role aliases only.** People appear by role, never by name, in anything
  committed here.
- **Tone.** No exclamation marks in copy. Every statistic is sourced. Generic
  treatment names in public drafts (no brand-name drugs such as Botox in
  `_seo/drafts/`; internal `ops/` docs may name them).
- **Phone numbers** never appear in committed text.

When in doubt, write less. A draft that is missing a claim is fixable; a draft
that makes one is not.

## Branches and pull requests

- Branch from the default branch as `claude/<topic>` (lowercase, hyphens).
  Example: `claude/preview-api-resilience`.
- Commit in logical chunks with messages that say why, not just what.
- Open a **draft** PR against the default branch using
  `.github/pull_request_template.md`. Fill in the test evidence and the
  brand/compliance and secrets checklists honestly.
- CI (`.github/workflows/ci.yml`) must be green before you mark the PR ready.
  Do not skip, disable, or weaken a test to get there.
- One topic per PR. SEO articles are one PR per article.
- Never force-push a shared branch. Never rewrite history without the founder's
  explicit go-ahead.

## Running tests per stack

Cloud sessions install dependencies automatically: `.claude/settings.json`
runs `scripts/cloud_session_setup.sh` on SessionStart (it exits immediately on
a local machine). If something is missing, run that script by hand.

| Stack | Command | Notes |
| --- | --- | --- |
| Lead service | `cd aftervue-leads && npm ci && npm test` | 74 unit tests plus an end-to-end scenario |
| Site / app / functions | `npm ci && npm test --if-present` in each directory with a `package.json` | axe and Lighthouse checks where present |
| Python tooling | `find tools -name '*.py' -print0 \| xargs -0 python3 -m py_compile` then `python3 -m pytest` if a `tests/` directory exists | add tests next to the tool you touch |
| Doc sweep | `python3 tools/qa/doc_sweep.py` | run after editing `ops/` or `research/` |
| Brand rules | `python3 scripts/brand_check.py` and `python3 -m unittest discover -s scripts/tests` | allowlist: `scripts/brand_check_allow.txt` |
| Secret scan | `scripts/secret_scan.sh` (history reachable from HEAD), `--staged`, or `--all-refs` for a whole-clone audit | downloads a pinned gitleaks if none is installed |
| Workflow lint | `scripts/lint_workflows.sh` | actionlint plus YAML parse |
| iOS | not in the cloud. `xcodegen generate` then build in Xcode on the Mac | do not edit `aftervue-ios/` from a cloud session unless asked |

CI runs the same commands except the doc sweep and iOS. The `detect` job
decides which stacks exist, so a missing directory is a skipped job, not a
failure.

## Things that need the founder, not a session

Billing and sign-ups, DNS, App Store Connect, TestFlight, anything that needs a
login or a card. If a task needs one of these, do everything else, write down
exactly what is left, and say so in the PR. Short-lived credentials (a one-hour
gcloud token, a restricted Stripe key) arrive as cloud-session network secrets;
never print them, never write them to a file.
