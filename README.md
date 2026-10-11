# AfterVue

[![CI](https://github.com/scaleforcenow-maker/aftervue/actions/workflows/ci.yml/badge.svg)](https://github.com/scaleforcenow-maker/aftervue/actions/workflows/ci.yml)

Planning repository for AfterVue (getaftervue.com): session plans, SEO drafts and
the editorial standard, and the repo-hygiene tooling. The application code (site,
iOS kiosk, Vercel functions, lead-management service, tooling) lives in
`AfterVue/aftervue-ai`, branch `domain-getaftervue`; see `docs/cloud-credit-plan.md`
section 8 for how cloud sessions get access to it.

- `docs/cloud-credit-plan.md`: how to spend the Claude Code cloud-session credit,
  with ready-to-paste session prompts.
- `.claude/settings.json` and `scripts/cloud_session_setup.sh`: dependency install
  that runs only in Claude Code cloud sessions.
- `CLAUDE.md`: rules for sessions working here (public-repo rule, brand and
  compliance rules, branch convention, how to run tests per stack).
- `.github/workflows/ci.yml`: per-stack tests, markdown link check, secret scan,
  and brand-rules check on every pull request and `claude/**` push.
- `scripts/secret_scan.sh`, `scripts/brand_check.py`, `scripts/lint_workflows.sh`:
  the same checks, runnable locally.
