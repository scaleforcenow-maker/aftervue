#!/usr/bin/env python3
"""Build the LinkedIn article post pack from article_posts.json.

Reads  06_Media/social_launch/linkedin_page/article_posts.json
Writes 06_Media/social_launch/linkedin_page/content_calendar_articles_2026-10.csv
       06_Media/social_launch/linkedin_page/linkedin_cards_articles.json

Schedule rules (all from the `schedule` block of the JSON):
  * Slots are Tuesdays and Thursdays at 08:30 ET, plus every other Monday
    starting on `alternating_monday_first`, from `start_date` for `window_days`.
  * Dates in `skip_dates` are removed; dates in `flag_dates` stay but carry a note.
  * First shares fill slots in article order (existing published, then
    reviewed, then draft). Order comes from the `articles` list as written.
  * Each article then gets a second-angle post at the first free slot that is
    at least `second_angle_gap_days` after its first share, while free slots
    remain inside the window.
  * Card layout alternates so every `phone_every_nth` post is a phone card.

Usage:  python3 tools/social/build_article_calendar.py [--check]
        --check prints the schedule without writing files.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "06_Media" / "social_launch" / "linkedin_page"
SOURCE = PACK / "article_posts.json"
CSV_OUT = PACK / "content_calendar_articles_2026-10.csv"
CARDS_OUT = PACK / "linkedin_cards_articles.json"

STATUS_ORDER = {"published": 0, "reviewed": 1, "draft": 2}
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
CSV_COLUMNS = [
    "date", "time_et", "platform", "article_slug", "article_url", "post_type",
    "caption", "card_headline", "card_layout", "hashtags", "status",
    "compliance_pass", "notes",
]
ILLUSTRATIVE_LINE = "Illustrative preview — not a guaranteed result"
PREVIEW_WORDS = ("preview", "before.", "after.", "simulator", "slider", "filter")


def parse(d: str) -> date:
    return datetime.strptime(d, "%Y-%m-%d").date()


def build_slots(sched: dict) -> list[date]:
    start = parse(sched["start_date"])
    end = start + timedelta(days=sched["window_days"])  # exclusive
    weekdays = {DAY_NAMES.index(w) for w in sched["weekdays"]}
    monday0 = parse(sched["alternating_monday_first"])
    skip = set(sched.get("skip_dates", {}))
    slots = []
    d = start
    while d < end:
        is_alt_monday = d.weekday() == 0 and (d - monday0).days % 14 == 0 and d >= monday0
        if (d.weekday() in weekdays or is_alt_monday) and d.isoformat() not in skip:
            slots.append(d)
        d += timedelta(days=1)
    return slots


def ordered_articles(articles: list[dict]) -> list[dict]:
    # Stable sort: keeps the JSON order inside each status group.
    return sorted(articles, key=lambda a: STATUS_ORDER[a["status"]])


def schedule(data: dict) -> list[dict]:
    sched = data["schedule"]
    slots = build_slots(sched)
    free = list(slots)
    posts: list[dict] = []
    articles = ordered_articles(data["articles"])

    if len(articles) > len(free):
        sys.exit(f"Not enough slots ({len(free)}) for {len(articles)} first shares")

    first_dates: dict[str, date] = {}
    for art in articles:
        d = free.pop(0)
        first_dates[art["slug"]] = d
        posts.append({"date": d, "article": art, "post_type": "first-share"})

    gap = timedelta(days=sched["second_angle_gap_days"])
    for art in articles:
        earliest = first_dates[art["slug"]] + gap
        for i, d in enumerate(free):
            if d >= earliest:
                free.pop(i)
                posts.append({"date": d, "article": art, "post_type": "second-angle"})
                break
        # No slot left inside the window: the second angle waits for the next pack.

    posts.sort(key=lambda p: (p["date"], p["post_type"] != "first-share"))
    return posts


def row_notes(art: dict, post_type: str, d: date, sched: dict) -> str:
    bits = []
    if post_type == "second-angle":
        bits.append("Second angle; different hook and card from the first share.")
    bits.append(art.get("notes", ""))
    flag = sched.get("flag_dates", {}).get(d.isoformat())
    if flag:
        bits.append(flag + ".")
    return " ".join(b for b in bits if b).strip()


def preview_implied(headline: str, sub: str, layout: str) -> bool:
    """Phone cards always imply a preview; type cards do when the copy says so."""
    if layout == "phone":
        return True
    text = f"{headline} {sub}".lower()
    return any(w in text for w in PREVIEW_WORDS)


def build(data: dict) -> tuple[list[dict], list[dict]]:
    sched = data["schedule"]
    posts = schedule(data)
    rows, cards = [], []
    for idx, p in enumerate(posts):
        art, d = p["article"], p["date"]
        variant = art["first"] if p["post_type"] == "first-share" else art["second"]
        layout = "phone" if (idx % sched["phone_every_nth"]) == sched["phone_every_nth"] - 1 else "type"
        caption = variant["caption"].replace("{url}", art["url"])
        rows.append({
            "date": d.isoformat(),
            "time_et": sched["time_et"],
            "platform": "LinkedIn Company Page",
            "article_slug": art["slug"],
            "article_url": art["url"],
            "post_type": p["post_type"],
            "caption": caption,
            "card_headline": variant["headline"],
            "card_layout": layout,
            "hashtags": " ".join(variant["hashtags"]),
            "status": "Pending Approval",
            "compliance_pass": "",  # filled by tools/social/check_linkedin_pack.py
            "notes": row_notes(art, p["post_type"], d, sched),
        })
        suffix = "1" if p["post_type"] == "first-share" else "2"
        card = {
            "date": d.isoformat(),
            "headline": variant["headline"],
            "sub": variant["sub"],
            "layout": layout,
            "size": "1080x1350",
            "slug": art["slug"],
            "post_type": p["post_type"],
            "file": f"cards/{d.isoformat()}_{art['slug']}_{suffix}.png",
            "illustrative_line": preview_implied(variant["headline"], variant["sub"], layout),
        }
        if "Before." in variant["headline"]:
            card["gold_word"] = "Before."
        cards.append(card)
    return rows, cards


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="print schedule, write nothing")
    args = ap.parse_args()

    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    rows, cards = build(data)

    for r in rows:
        day = DAY_NAMES[parse(r["date"]).weekday()]
        print(f"{r['date']} {day} {r['time_et']}  {r['post_type']:<12} {r['card_layout']:<5} {r['article_slug']}")
    print(f"{len(rows)} posts, {sum(r['post_type']=='first-share' for r in rows)} first shares, "
          f"{sum(r['post_type']=='second-angle' for r in rows)} second angles")
    if args.check:
        return

    with CSV_OUT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    CARDS_OUT.write_text(json.dumps({
        "_about": "Card rows for the article post pack. Compatible with tools/social/av_cards.py (headline, sub, layout, date). "
                  "Only the word 'Before.' may be gold; gold_word is present only on cards that contain it. "
                  "illustrative_line=true means the renderer burns in '" + ILLUSTRATIVE_LINE + "'. Size 1080x1350.",
        "cards": cards,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {CSV_OUT.relative_to(ROOT)} and {CARDS_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
