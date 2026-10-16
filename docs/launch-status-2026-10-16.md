# Launch status, Oct 16, 2026

Supersedes `launch-status-2026-10-10.md`. Every blocker in that document's section 1 is gone. Updated late on Oct 16
after app repository PRs 11 to 16 merged.

## 1. Where launch stands

| Area | State |
| --- | --- |
| App repository access | Cloud sessions reach `AfterVue/aftervue-ai`; the AfterVue account also has write access here |
| App Store | Oct 9 build still **In Review** (checked Oct 15). TestFlight build 11 uploaded Oct 15 with the paywall fix. The updated Developer Program License Agreement was accepted on Oct 16 |
| Web app and API | Republished Oct 15 with everything merged through app PR 10. PRs 11 to 16 merged since (seven product articles, device registry, tooling) and go live on the next publish from the Mac |
| Google Play | Android app merged (PR 9); Play Billing on all three layers merged (PR 10); an emulator smoke test now runs in CI on a phone and a tablet profile and uploads screenshots of the first screens on every run (PR 13); a fitter turns captures into Play listing sizes (PR 15). Play Console setup not started |
| Device cap | Device registry and per-tier cap on all three surfaces merged (PR 14) with enforcement **off**: over-cap devices are recorded and reported, not refused, until the numbers are confirmed. The schema still needs its one paste in Supabase |
| Supabase | Render-gate table has row-level security; PIN rotation function installed (applied Oct 15); device schema pending |
| Ops mail | Alerts reach the Workspace mailbox; the mailer no longer alerts on funnel events (version 7, Oct 15) |
| This repository | All 21 integration branches merged (PRs 29, 30, 31); PR 28 closed with its documents landed scrubbed; no open PRs |

## 2. Issues

Closed as fixed: #17 (alert recipient), #19 (Supabase grants, not applicable), #20 (mailer funnel events),
#27 (sandbox licence and missing paywall). Open with status notes: #16 (Gemini 429s; the live generate path already has
a cross-instance admission gate, deadlines and provider fallback, so the remaining lever is purchased capacity, not code),
#18 (device binding and cap built, enforcement switch off until the per-tier numbers are confirmed), #21 (Apple mail
lives in iCloud; the Developer Program License Agreement was accepted Oct 16; the review decision is still pending).

## 3. Founder actions, in order

1. Install TestFlight build 11 on the iPhone with a sandbox tester and confirm the paywall returns after the trial lapses
   and that Restore purchases brings the kiosk back.
2. On the Mac: pull `domain-getaftervue`, run the publish script so the seven articles and the device registry go live,
   and paste `aftervue-app/tools/db/devices_schema.sql` (or the schema bundle) once in the Supabase SQL editor.
3. Confirm the per-tier device cap for #18 (suggested: Consult Room 2, Practice 5, Group 4 per location). With a yes,
   set `PIN_DEVICE_CAP_ENFORCE=1` in Vercel; the numbers themselves are already the defaults.
4. Play Console and Google Cloud setup for billing, per the app repository's `ops/43` section 9.
5. Android QA: open the `android-smoke-phone-screenshots` and `android-smoke-tablet-screenshots` artifacts on the latest
   Android workflow run in the app repository and check the first screens render in the brand; sideload the debug APK
   onto a real phone and tablet when one is available for the consult flow itself.
6. Free disk on the Mac; the Oct 15 session hit zero bytes free mid-upload.
7. Watch the iCloud inbox for Apple's review decision; on approval revoke the review code, on rejection resubmit with the
   reserved code.
