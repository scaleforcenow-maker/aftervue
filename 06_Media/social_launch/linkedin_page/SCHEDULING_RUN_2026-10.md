# LinkedIn article pack: scheduling run, October 2026

Paste-ready brief for the Mac session that schedules the AfterVue AI Company Page
(linkedin.com/company/getaftervue). Everything is scheduled through LinkedIn's
own native scheduler from the signed-in AfterVue Chrome profile. No third-party
publishing tool, ever. Nothing in this pack posts by itself.

Pack files (this folder): `content_calendar_articles_2026-10.csv` (captions and
rows), `linkedin_cards_articles.json` (card rows for `tools/social/av_cards.py`),
`cards/` (preview PNGs), `article_posts.json` (source).

## 0. Before scheduling anything

1. **Replace the sixteen placeholder URLs.** Rows for the eight articles published
   on 2026-09-05 carry `https://getaftervue.com/resources/<VERIFY-SLUG>/` because
   the live slugs could not be read from the cloud sandbox. Open
   `https://getaftervue.com/sitemap.xml` or `/resources/` on the Mac, copy each
   article's real URL into `article_posts.json`, then run
   `python3 tools/social/build_article_calendar.py` and
   `python3 tools/social/check_linkedin_pack.py`. The checker's URL-placeholder
   warnings must read zero before any row is scheduled.
2. **Confirm the eight existing articles are not already scheduled.** The 90-day
   calendar on the Mac may already hold posts for some of them. Open the Page's
   scheduled list and the Mac calendar file, search each slug or title, and drop
   or move any row in this pack that duplicates an existing scheduled post.
3. **Schedule a new article only once it is live.** Rows 9 to 16 and 25 to 31
   point at `/resources/<slug>/` paths that exist only after the article's PR is
   merged and `tools/seo/publish/` has run. One article is `reviewed` (cluster A);
   seven are still `draft`. Keep those rows as Pending Approval until the page
   returns 200; move the date forward if it is not live a week before its slot.
4. **Render production cards.** Run `tools/social/av_cards.py` against
   `linkedin_cards_articles.json`. The `cards/*.png` in this folder are previews
   for approval only. Phone cards use the real product shot in production.
5. **Holiday dates.** 2026-11-26 (Thanksgiving) is skipped. 2026-12-24 and
   2026-12-31 are kept but flagged; move them to the next open Tuesday if preferred.
6. **Founder approval.** Every row is `Pending Approval`. Schedule only rows the
   founder has approved and whose `compliance_pass` reads `Y`.

## 1. The schedule

Cadence: Tuesday and Thursday at 8:30 AM ET plus alternating Mondays, from
2026-10-20 through 2027-01-17. Existing articles first, then the reviewed
article, then drafts. Second-angle posts land six weeks or more after the first
share. The second angle for `medspa-website-design` falls outside the window and
rolls into the next pack.

| # | Date | Day | Time ET | Post | Article slug | Card headline | Layout | Card file | Hashtags | Compliance | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-20 | Tue | 8:30 AM | first-share | `no-beauty-scores` | No scores. No judgment. Just a preview. | type | `2026-10-20_no-beauty-scores_1.png` | #medspa #aestheticpractice #injector | Y | VERIFY URL; confirm not already scheduled |
| 2 | 2026-10-22 | Thu | 8:30 AM | first-share | `how-will-i-look-after-wrinkle-relaxer` | Patients see their after. Before. | type | `2026-10-22_how-will-i-look-after-wrinkle-relaxer_1.png` | #medspa #medspamarketing #injector #medspaowner | Y | VERIFY URL; confirm not already scheduled |
| 3 | 2026-10-26 | Mon | 8:30 AM | first-share | `lip-filler-simulator-what-patients-search` | What lip filler searchers want to see. | phone | `2026-10-26_lip-filler-simulator-what-patients-search_1.png` | #medspa #medspamarketing #injector | Y | VERIFY URL; confirm not already scheduled |
| 4 | 2026-10-27 | Tue | 8:30 AM | first-share | `medspa-hipaa-before-and-after-photos-checklist` | Patient photos are protected health information. | type | `2026-10-27_medspa-hipaa-before-and-after-photos-checklist_1.png` | #medspa #medspaowner #aestheticpractice | Y | VERIFY URL; confirm not already scheduled |
| 5 | 2026-10-29 | Thu | 8:30 AM | first-share | `medspa-website-not-converting` | Fix the page before buying traffic. | type | `2026-10-29_medspa-website-not-converting_1.png` | #medspamarketing #medspa #medspaowner | Y | VERIFY URL; confirm not already scheduled |
| 6 | 2026-11-03 | Tue | 8:30 AM | first-share | `wrinkle-relaxer-simulator-apps-what-medspas-should-know` | Do not send patients to a filter. | phone | `2026-11-03_wrinkle-relaxer-simulator-apps-what-medspas-should-know_1.png` | #medspa #injector #aestheticpractice | Y | VERIFY URL; confirm not already scheduled |
| 7 | 2026-11-05 | Thu | 8:30 AM | first-share | `ai-preview-vs-photo-documentation-tools` | Preview or documentation. Decide first. | type | `2026-11-05_ai-preview-vs-photo-documentation-tools_1.png` | #medspa #aestheticpractice #medspaowner | Y | VERIFY URL; confirm not already scheduled |
| 8 | 2026-11-09 | Mon | 8:30 AM | first-share | `medspa-marketing-agency-vs-ai-marketing-team-costs` | Compare ownership, not retainers. | type | `2026-11-09_medspa-marketing-agency-vs-ai-marketing-team-costs_1.png` | #medspamarketing #medspaowner #medspa | Y | VERIFY URL; confirm not already scheduled |
| 9 | 2026-11-10 | Tue | 8:30 AM | first-share | `ai-before-and-after-simulator-medspa` | Six checks before you buy a simulator. | phone | `2026-11-10_ai-before-and-after-simulator-medspa_1.png` | #medspa #medspaowner #aestheticpractice | Y | article reviewed, not yet live |
| 10 | 2026-11-12 | Thu | 8:30 AM | first-share | `is-a-wrinkle-relaxer-simulator-accurate` | Accurate about one thing. Silent on others. | type | `2026-11-12_is-a-wrinkle-relaxer-simulator-accurate_1.png` | #injector #medspa #aestheticpractice | Y | article still draft |
| 11 | 2026-11-17 | Tue | 8:30 AM | first-share | `medspa-marketing-software` | Three vendors, one search term. | type | `2026-11-17_medspa-marketing-software_1.png` | #medspamarketing #medspaowner #medspa | Y | article still draft |
| 12 | 2026-11-19 | Thu | 8:30 AM | first-share | `compare-medspa-marketing-agency-ai-team` | Price misses the point. | phone | `2026-11-19_compare-medspa-marketing-agency-ai-team_1.png` | #medspamarketing #medspaowner #medspa | Y | article still draft |
| 13 | 2026-11-23 | Mon | 8:30 AM | first-share | `what-to-measure-medspa-website` | Four numbers. Fifteen minutes a week. | type | `2026-11-23_what-to-measure-medspa-website_1.png` | #medspamarketing #medspaowner #medspa | Y | article still draft |
| 14 | 2026-11-24 | Tue | 8:30 AM | first-share | `medspa-consult-room-technology` | Design the room, then buy the tools. | type | `2026-11-24_medspa-consult-room-technology_1.png` | #injector #aestheticpractice #medspa | Y | article still draft |
| 15 | 2026-12-01 | Tue | 8:30 AM | first-share | `consent-script-ai-previews-consult-room` | The words to say before the camera. | phone | `2026-12-01_consent-script-ai-previews-consult-room_1.png` | #medspa #injector #medspaowner | Y | article still draft |
| 16 | 2026-12-03 | Thu | 8:30 AM | first-share | `medspa-website-design` | Built for owners, not for patients. | type | `2026-12-03_medspa-website-design_1.png` | #medspamarketing #medspaowner #medspa | Y | article still draft |
| 17 | 2026-12-07 | Mon | 8:30 AM | second-angle | `no-beauty-scores` | The number we refuse to show. | type | `2026-12-07_no-beauty-scores_2.png` | #medspa #medspaowner #aestheticpractice #injector | Y | VERIFY URL; confirm not already scheduled |
| 18 | 2026-12-08 | Tue | 8:30 AM | second-angle | `how-will-i-look-after-wrinkle-relaxer` | Set expectations before the first visit. | phone | `2026-12-08_how-will-i-look-after-wrinkle-relaxer_2.png` | #medspa #injector #aestheticpractice | Y | VERIFY URL; confirm not already scheduled |
| 19 | 2026-12-10 | Thu | 8:30 AM | second-angle | `lip-filler-simulator-what-patients-search` | A gallery shows someone else. | type | `2026-12-10_lip-filler-simulator-what-patients-search_2.png` | #medspa #aestheticpractice #medspaowner #injector | Y | VERIFY URL; confirm not already scheduled |
| 20 | 2026-12-15 | Tue | 8:30 AM | second-angle | `medspa-hipaa-before-and-after-photos-checklist` | Ask every vendor where photos go. | type | `2026-12-15_medspa-hipaa-before-and-after-photos-checklist_2.png` | #medspa #medspaowner #injector #aestheticpractice | Y | VERIFY URL; confirm not already scheduled |
| 21 | 2026-12-17 | Thu | 8:30 AM | second-angle | `medspa-website-not-converting` | Traffic is a denominator. Consults count. | phone | `2026-12-17_medspa-website-not-converting_2.png` | #medspamarketing #medspa #aestheticpractice #medspaowner | Y | VERIFY URL; confirm not already scheduled |
| 22 | 2026-12-21 | Mon | 8:30 AM | second-angle | `wrinkle-relaxer-simulator-apps-what-medspas-should-know` | Filters chase downloads. Previews answer to you. | type | `2026-12-21_wrinkle-relaxer-simulator-apps-what-medspas-should-know_2.png` | #medspa #medspaowner #injector #medspamarketing | Y | VERIFY URL; confirm not already scheduled |
| 23 | 2026-12-22 | Tue | 8:30 AM | second-angle | `ai-preview-vs-photo-documentation-tools` | Preview images do not belong in the chart. | type | `2026-12-22_ai-preview-vs-photo-documentation-tools_2.png` | #medspa #injector #aestheticpractice #medspaowner | Y | VERIFY URL; confirm not already scheduled |
| 24 | 2026-12-24 | Thu | 8:30 AM | second-angle | `medspa-marketing-agency-vs-ai-marketing-team-costs` | Faster content needs a named human. | phone | `2026-12-24_medspa-marketing-agency-vs-ai-marketing-team-costs_2.png` | #medspamarketing #medspa #medspaowner #aestheticpractice | Y | VERIFY URL; confirm not already scheduled; holiday eve: confirm date |
| 25 | 2026-12-29 | Tue | 8:30 AM | second-angle | `ai-before-and-after-simulator-medspa` | Ask where the photo goes. | type | `2026-12-29_ai-before-and-after-simulator-medspa_2.png` | #medspa #injector #medspaowner #aestheticpractice | Y | article reviewed, not yet live |
| 26 | 2026-12-31 | Thu | 8:30 AM | second-angle | `is-a-wrinkle-relaxer-simulator-accurate` | Only the treated area should move. | type | `2026-12-31_is-a-wrinkle-relaxer-simulator-accurate_2.png` | #injector #medspa #medspaowner #aestheticpractice | Y | article still draft; holiday eve: confirm date |
| 27 | 2027-01-04 | Mon | 8:30 AM | second-angle | `medspa-marketing-software` | The visitor your software cannot see. | phone | `2027-01-04_medspa-marketing-software_2.png` | #medspamarketing #medspa #aestheticpractice #medspaowner | Y | article still draft |
| 28 | 2027-01-05 | Tue | 8:30 AM | second-angle | `compare-medspa-marketing-agency-ai-team` | Ask about the visitor who never calls. | type | `2027-01-05_compare-medspa-marketing-agency-ai-team_2.png` | #medspamarketing #medspa #aestheticpractice #medspaowner | Y | article still draft |
| 29 | 2027-01-07 | Thu | 8:30 AM | second-angle | `what-to-measure-medspa-website` | Never put a name in an event. | type | `2027-01-07_what-to-measure-medspa-website_2.png` | #medspamarketing #medspa #medspaowner #aestheticpractice | Y | article still draft |
| 30 | 2027-01-12 | Tue | 8:30 AM | second-angle | `medspa-consult-room-technology` | Lock the consult iPad to one app. | phone | `2027-01-12_medspa-consult-room-technology_2.png` | #injector #medspa #medspaowner #aestheticpractice | Y | article still draft |
| 31 | 2027-01-14 | Thu | 8:30 AM | second-angle | `consent-script-ai-previews-consult-room` | Three consents. Three signature lines. | type | `2027-01-14_consent-script-ai-previews-consult-room_2.png` | #medspa #medspaowner #aestheticpractice #injector | Y | article still draft |

Captions live in the CSV `caption` column (paste the caption, then a blank line,
then the `hashtags` column). Do not retype captions; copy them.

## 2. Native-scheduler steps (from the playbook)

Work from the AfterVue Chrome profile, signed in as Page admin. Never sign in on
the founder's behalf, never complete a CAPTCHA or ID check, never run two
browsing sessions against LinkedIn at once, never bulk-act.

1. Open the Page, start a post from the Page (not a personal profile), paste the
   caption, blank line, hashtags. Confirm the preview shows the article URL as a
   link and the body has no exclamation marks or stray characters.
2. Attach the production card PNG for the row (the file name in the table). Check
   the card reads "Illustrative preview — not a guaranteed result" where the
   JSON row has `illustrative_line: true`, and that only "Before." is gold.
3. Click the clock icon (Schedule). Pick the date from the calendar.
4. **Set the time by opening the Time dropdown and clicking the exact option
   "8:30 AM".** Never type into the time field: typed values look accepted and
   silently fall back to the next available evening slot. That put posts at
   8:45 and 9:00 PM once before.
5. Confirm the composer summary reads the right date and **AM** before clicking
   Schedule.
6. **Batch in groups of 10.** Rows 1 to 10, then 11 to 20, then 21 to 31. After
   each group, stop and do step 7 before continuing.
7. **Re-open the scheduled posts list** (Page admin view, Posts, Scheduled) and
   verify every entry you just added: correct date, reads **AM**, correct card,
   correct article URL. Fix any evening-slot post by editing it and re-selecting
   8:30 AM from the dropdown, then re-check the list.
8. Mark each verified row `Scheduled` in the CSV and the Tracker Sheet's
   `Content Calendar` tab, with the scheduled timestamp.
9. Report at the end of the run through the usual dispatch: rows scheduled, rows
   held and why (URL unverified, article not live, duplicate of existing
   scheduled post), anything blocked. Close every tab the run opened.

## 3. Compliance checklist (every post, before scheduling)

Run `python3 tools/social/check_linkedin_pack.py` first; it writes
`compliance_pass`. Then eyeball each row against this list. A row without `Y`
is never scheduled.

- Illustrative label present on any card that implies a preview.
- No numeric score, rating, or "improvement" number anywhere.
- No outcome promise ("you will look", "guaranteed").
- No practice or location count, stated or implied.
- No price, dollar figure, or plan name.
- Real patient imagery only with written consent; otherwise app demo assets or
  the product shot.
- "Managed and monitored by a dedicated human at AfterVue" whenever the AI
  marketing team is described.
- Three to five hashtags, all from `#medspa #medspamarketing #aestheticpractice
  #injector #medspaowner`.
- Call to action to getaftervue.com (the article URL counts).
- No personal name, personal email, phone, or address. Role aliases only
  (hello@getaftervue.com).
- "Wrinkle relaxer", never the drug's brand name, in captions and cards.
- No blanket compliance claim about AfterVue or the practice.
- Nothing that says AfterVue contacts patients or books consults.
- Not already scheduled on the Page (search the scheduled list by slug or title).
- Article URL returns 200 in a fresh tab.

## 4. Standing weekly rule

**Every Monday**, after the weekly SEO routine opens its article PR and after any
article is reviewed or merged:

1. For each article whose draft front matter now reads `status: reviewed` (or
   has been merged and published), add or update its entry in
   `article_posts.json`: real URL, status, two captions, two card headlines,
   hashtags. Follow the caption rules in the README.
2. Run `build_article_calendar.py`, then `check_linkedin_pack.py`, then
   `render_article_cards.py`. Fix any FAIL at the source, never in the CSV.
3. New rows take the next free slots after the last scheduled post; the builder
   never moves rows that are already scheduled, so compare the CSV against the
   Page's scheduled list before adding.
4. Send the new rows to the founder as `Pending Approval`. Schedule only after
   approval, in the next scheduling batch, using section 2.
5. Keep the buffer at 90 days. On the first of each month, top up the next
   month's rows so the scheduled list never holds less than 90 days of approved
   posts.
