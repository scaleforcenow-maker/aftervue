# LinkedIn Company Page: article post pack

Everything the AfterVue AI Company Page needs to share every blog article on a
schedule. Scheduling happens from the founder's Mac through LinkedIn's native
scheduler only. Nothing in this folder posts anything.

| File | What it is |
| --- | --- |
| `article_posts.json` | Source of truth: one entry per article with URL, status, two captions (first share and second angle), card headline and sub line, hashtags. Edit captions here. |
| `content_calendar_articles_2026-10.csv` | Generated calendar. One row per post with date, time, caption, card headline, layout, hashtags, status, `compliance_pass`, notes. |
| `linkedin_cards_articles.json` | Generated card rows (`headline`, `sub`, `layout`, `date` plus `slug`, `post_type`, `file`, `illustrative_line`, optional `gold_word`). Same shape the production renderer `tools/social/av_cards.py` reads. |
| `cards/*.png` | Preview renders, 1080x1350, from `tools/social/render_article_cards.py`. Previews for approval; the Mac renderer produces the files that get uploaded. |
| `SCHEDULING_RUN_2026-10.md` | Paste-ready brief for the Mac session: the full table, native-scheduler steps, compliance checklist, weekly rule. |

## Regenerate

```bash
python3 tools/social/build_article_calendar.py      # JSON -> CSV + cards JSON
python3 tools/social/check_linkedin_pack.py         # validates the CSV, writes compliance_pass
python3 tools/social/render_article_cards.py        # cards/*.png previews
```

The checker exits non-zero on any hard failure. A row whose `compliance_pass` is
not `Y` is never scheduled.

## Rules the pack follows

Cadence Tuesday and Thursday at 8:30 AM ET plus alternating Mondays, starting
2026-10-20, inside a 90-day window. Existing published articles first, then new
articles with status `reviewed`, then `draft`. A second-angle post six weeks after
each first share while slots remain. Captions are 120 to 200 words, hook line
first, one specific idea from the article, a plain takeaway, the article URL, and
3 to 5 hashtags from `#medspa #medspamarketing #aestheticpractice #injector
#medspaowner`. No exclamation marks, no price, no personal names, no outcome
promises, no practice or location counts, no blanket compliance claims, no claim
that AfterVue contacts patients, "wrinkle relaxer" never the drug's brand name,
and "managed and monitored by a dedicated human at AfterVue" whenever the AI
marketing team is mentioned. Only the word "Before." is gold on a card.
