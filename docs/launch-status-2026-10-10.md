# Launch status, Oct 10, 2026 (evening check-in)

What a cloud session did today toward launch, what it verified, and the short list
of things only the founder can do. Supersedes section 11 of `cloud-credit-plan.md`
for current state.

## 1. Where launch actually stands

The planning repo is in good shape. The application is not, and it cannot be fixed
from here yet:

| Blocker | Why it matters for launch | Who |
| --- | --- | --- |
| `AfterVue/aftervue-ai` is not reachable from cloud sessions (checked again today: access denied) | Every production bug lives there: the 429 quota path (#16), the alert recipient (#17), the sandbox licence behind the missing paywall (#27), PIN binding (#18), the Supabase grants (#19), the mailer (#20) | Founder: GitHub -> AfterVue org -> Settings -> GitHub Apps -> Claude -> add `aftervue-ai` |
| The Asunshine activation PIN and the App Review activation code are in the public history of the PR 28 branch | Anyone can activate the app with the review code; the practice PIN is a tenant credential | Founder: rotate both, today |
| `getaftervue.com` is denied by the environment's network policy | No live-site audit, health check or widget review from a session | Founder: environment -> Network access -> add `getaftervue.com`, `*.vercel.app` |
| Ops alerts bounce at iCloud (#17) | Nothing since Sept 18 reached the founder, including the paywall and quota incidents | Founder: change the recipient in the mailer config |

Nothing else on the launch list is blocked on money or billing any more.

## 2. What was done today

### Integration of all open pull requests

All 21 open PR branches (every PR except #28) were merged into one branch in the
order section 10 of `cloud-credit-plan.md` proposes, and the result was checked.

- Each branch merges cleanly alone, as PR 28 reported. Together they do **not**:
  ten branches collide in `.gitignore`, `README.md`, `_seo/drafts/README.md` and
  `scripts/check_seo_front_matter.py`. All ten were resolved (rules in
  `scripts/integrate_open_prs.sh`).
- Three content problems appear only when the checker, the build kit and the
  articles share a tree, and were fixed:
  - the Cluster C accuracy draft quoted a brand-name drug in a search phrase,
    which `scripts/brand_check.py` forbids under `_seo/drafts/`;
  - the Cluster F measurement draft listed four sources in front matter and linked
    none in the body, which the build kit rejects;
  - the Cluster I consent draft listed the BIPA definitions clause but only linked
    the retention clause.
- Every CI check passes on the merged tree:

| Check | Result |
| --- | --- |
| `packages/vertex-resilience` | 45 tests pass |
| `packages/lead-emails` | 169 tests pass |
| `tools/stripe` | 43 tests pass |
| `infra/preview-api` | 27 tests pass |
| Python (`tools/seo/publish`, `tools/appstore`) | 82 tests pass |
| `scripts/tests` (brand checker) | 44 tests pass |
| `scripts/brand_check.py` | clean, 14 files |
| `scripts/secret_scan.sh` (full history) | no leaks |
| `scripts/lint_workflows.sh` | yaml and actionlint ok |
| `tools/seo/publish/check_drafts.py` | 11 of 11 drafts ok |
| `tools/seo/publish/build.py` | 11 pages, index and sitemap built |
| `tools/social/check_linkedin_pack.py` | 31 of 31 rows pass, 16 URL placeholders to confirm after publish |

The merged branch could **not be pushed** from the session: the permission layer
refused every push attempt. The work is preserved as `scripts/integrate_open_prs.sh`,
which rebuilds the identical tree from the branches already on GitHub in about a
minute. Run it on the Mac:

```bash
git fetch origin
bash scripts/integrate_open_prs.sh integration/open-prs
# run the checks it prints, then
git push -u origin integration/open-prs
```

Then open one draft PR from that branch against the default branch. Merging it
marks all 21 PRs merged. Review PR 28 separately after rotating the codes.

### Reviews of the five PRs that never had one

PRs #13, #14, #15, #22 and #23 were read against their stated requirements. No
blocking defect was found. What was checked:

- **#14 vertex-resilience.** No logging of request bodies or image data anywhere in
  `src/`; the only `JSON.stringify` of a body is the outbound Vertex request. Zero
  runtime dependencies. 45 tests pass.
- **#13 Cloud Run infra.** Service accounts are scoped (`aiplatform.user`,
  `datastore.user`, `run.invoker` for the scheduler only); no Owner or Editor
  grants. `preview-api` is public by design and defends itself with the origin
  allowlist, Turnstile and a per-IP token bucket; `Cache-Control: no-store` is set
  on every response. `deploy.sh` refuses to run without `PROJECT_ID`. 27 tests pass.
- **#22 build kit.** Titles and descriptions are HTML-escaped, slugs are validated
  against a strict pattern and must match the filename, every front-matter source
  must be cited. It never deploys. 60 tests pass, end-to-end build ok.
- **#23 LinkedIn pack.** Compliance checker passes all 31 rows. 16 rows carry URL
  placeholders that must be replaced with live slugs after the articles publish.
- **#15 capacity research.** Documentation only; merges cleanly.

### Mailbox check

Nothing new since Oct 9. One new failure mode was found and logged on issue #20:
the iOS app posts a `preview_generated` event that the notify mailer has no handler
for, which produced five "unhandled event" emails on Oct 9.

### Not done, and why

- **Push and PR for the integration branch**: permission layer, see above.
- **Scrubbing PR 28's branch**: the scrubbed version exists locally, but pushing to
  that branch was also refused. The values are already public; rotation is the fix.
- **Live-site audit, health endpoint, widget review**: network policy.
- **Any fix in the application**: repository access.

## 3. Founder actions, in order

1. Rotate the Asunshine activation PIN and the App Review activation code.
2. Add `aftervue-ai` to the Claude GitHub App. Then start one cloud session per
   issue #16, #17, #18, #19, #20, #27 with that repository selected.
3. Fix the alert recipient (#17) so the next incident is seen.
4. On the Mac: run `scripts/integrate_open_prs.sh`, push, open the PR, merge after
   CI is green. Then publish the 11 articles with the build kit output and schedule
   the LinkedIn rows through LinkedIn's native scheduler.
5. Add `getaftervue.com` and `*.vercel.app` to the environment's allowed domains.
6. On the iPhone, follow section 3 of the paywall diagnosis (PR 28) to bring the
   paywall back for testing.
