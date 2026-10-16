# Launch status, Oct 16, 2026

Supersedes `launch-status-2026-10-10.md`. Every blocker in that document's section 1 is gone.

## 1. Where launch stands

| Area | State |
| --- | --- |
| App repository access | Cloud sessions reach `AfterVue/aftervue-ai`; the AfterVue account also has write access here |
| App Store | Oct 9 build still **In Review** (checked Oct 15). TestFlight build 11 uploaded Oct 15 with the paywall fix |
| Web app and API | Republished Oct 15 with everything merged through app PR 10 |
| Google Play | Android app merged (PR 9); Play Billing on all three layers merged (PR 10). Play Console setup not started |
| Supabase | Render-gate table has row-level security; PIN rotation function installed (applied Oct 15) |
| Ops mail | Alerts reach the Workspace mailbox; the mailer no longer alerts on funnel events (version 7, Oct 15) |
| This repository | All 21 integration branches merged (PRs 29, 30, 31); PR 28 closed with its documents landed scrubbed |

## 2. Issues

Closed as fixed: #17 (alert recipient), #19 (Supabase grants, not applicable), #20 (mailer funnel events),
#27 (sandbox licence and missing paywall). Open with status notes: #16 (Gemini 429s; `vertex-resilience` not yet wired
into the generate endpoint), #18 (device cap awaits a per-tier number), #21 (Apple mail lives in iCloud; the Account
Holder must accept the updated Developer Program License Agreement by Nov 13).

## 3. Founder actions, in order

1. Accept the updated Apple Developer Program License Agreement in App Store Connect (Account Holder only, due Nov 13).
   A six-day review with an unaccepted agreement is the first thing to rule out.
2. Install TestFlight build 11 on the iPhone with a sandbox tester and confirm the paywall returns after the trial lapses
   and that Restore purchases brings the kiosk back.
3. Play Console and Google Cloud setup for billing, per the app repository's `ops/43` section 9.
4. Decide the per-tier device cap for #18 (suggested: Consult Room 2, Practice 5, Group 4 per location).
5. Android device QA: sideload the debug APK from the app repository's Android workflow artifacts onto a phone and a tablet.
6. Free disk on the Mac; the Oct 15 session hit zero bytes free mid-upload.
