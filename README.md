# AfterVue

Code of record for AfterVue (getaftervue.com): the patient-facing preview app and
widget, the Vercel functions, the lead-management service, the iOS kiosk, and the
ops/SEO/BD tooling. The working copy still lives on the founder's Mac; see
`docs/cloud-credit-plan.md` section 2 for the push steps.

- `docs/cloud-credit-plan.md`: how to spend the Claude Code cloud-session credit,
  with ready-to-paste session prompts.
- `.claude/settings.json` and `scripts/cloud_session_setup.sh`: dependency install
  that runs only in Claude Code cloud sessions.
- `packages/vertex-resilience/`: queue, rate limiting, retry, model fallback and
  deadlines for the Vertex AI image calls behind `/api/generate`. Runbook in
  `docs/preview-api-resilience.md`.
