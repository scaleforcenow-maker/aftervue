#!/usr/bin/env python3
"""Compliance check for the LinkedIn article post pack CSV.

Validates every row of content_calendar_articles_2026-10.csv against the
AfterVue LinkedIn brand rules and the cadence, prints a pass/fail table, and
writes compliance_pass back into the CSV (Y when every hard check passes,
N otherwise) unless --no-write is given.

Hard checks (FAIL blocks scheduling):
  words          caption is 120 to 200 words (URL and hashtags excluded)
  hook           caption starts with a one-line hook
  url            caption contains the row's article_url
  banned         no banned terms (brand name of the toxin, exclamation mark,
                 currency, guarantee, blanket HIPAA-compliant claim,
                 outcome promise, practice/location counts, personal names,
                 claims that AfterVue contacts patients)
  team_line      if the AI marketing team is mentioned, the caption says it is
                 managed and monitored by a dedicated human at AfterVue
  hashtags       3 to 5 tags, all from the approved pool, no duplicates
  time           time_et is 08:30
  day            date is a Monday, Tuesday or Thursday
  headline       card_headline is 8 words or fewer; only 'Before.' may be gold
  layout         card_layout is type or phone
  status         status is Pending Approval
  dup            no duplicate (article_slug, post_type)

Soft checks (WARN, reported but not failing):
  url_placeholder  article_url still contains <VERIFY-SLUG>
  phone_ratio      roughly one phone card in three

Exit code 1 when any hard check fails.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CSV = ROOT / "06_Media" / "social_launch" / "linkedin_page" / "content_calendar_articles_2026-10.csv"

HASHTAG_POOL = {"#medspa", "#medspamarketing", "#aestheticpractice", "#injector", "#medspaowner"}
ALLOWED_DAYS = {0, 1, 3}  # Mon, Tue, Thu
REQUIRED_TIME = "08:30"
MIN_WORDS, MAX_WORDS = 120, 200
MAX_HEADLINE_WORDS = 8

# Each entry: (label, compiled regex). Case-insensitive.
BANNED = [
    ("toxin brand name", re.compile(r"\bbotox\b", re.I)),
    ("exclamation mark", re.compile(r"!")),
    ("currency / price", re.compile(r"[$€£]\s?\d|\b\d+\s?(?:dollars|usd|per month|/mo)\b", re.I)),
    ("guarantee", re.compile(r"\bguarantee[sd]?\b", re.I)),
    ("blanket HIPAA-compliant claim", re.compile(r"\bhipaa[\s-]+compliant\b", re.I)),
    ("outcome promise", re.compile(r"\byou will look\b|\byou'll look\b|\bguaranteed result\b", re.I)),
    ("practice/location count", re.compile(r"\b(?:\d+|hundreds|thousands|dozens)\s*\+?\s*(?:practices|medspas|med spas|clinics|locations|injectors)\b", re.I)),
    ("personal email", re.compile(r"\b[\w.+-]+@(?!getaftervue\.com)[\w-]+\.[\w.]+\b", re.I)),
    ("non-role email", re.compile(r"\b(?!hello@|privacy@|operations@)[\w.+-]+@getaftervue\.com\b", re.I)),
    ("AfterVue contacts patients", re.compile(r"\baftervue\s+(?:contacts|calls|texts|emails|messages|reaches out to)\s+(?:your\s+)?patients\b", re.I)),
    ("beauty score offered", re.compile(r"\byour (?:beauty|attractiveness) score\b", re.I)),
    ("old working name", re.compile(r"\bbefore\s?vue\b", re.I)),
]
# Personal names never live in this public repo, not even as a banned-word list.
# On the Mac, put one regex per line in tools/social/banned_terms.local.txt
# (gitignored), e.g. the founder's first and last name, and they are checked too.
LOCAL_BANNED = Path(__file__).resolve().parent / "banned_terms.local.txt"
if LOCAL_BANNED.exists():
    for _line in LOCAL_BANNED.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#"):
            BANNED.append(("personal name (local list)", re.compile(_line, re.I)))

TEAM_MENTION = re.compile(r"\bai marketing team\b|\bai team\b", re.I)
TEAM_LINE = re.compile(r"managed and monitored by a dedicated human at aftervue", re.I)
PLACEHOLDER = "<VERIFY-SLUG>"
URL_RE = re.compile(r"https?://\S+")


def word_count(caption: str) -> int:
    text = URL_RE.sub(" ", caption)
    text = re.sub(r"(?<!\S)#\w+", " ", text)
    return len(text.split())


def check_row(r: dict) -> tuple[dict[str, str], list[str]]:
    """Return ({check: 'PASS'|'FAIL'|'WARN'}, [messages])."""
    res: dict[str, str] = {}
    msgs: list[str] = []
    cap = r["caption"]

    n = word_count(cap)
    res["words"] = "PASS" if MIN_WORDS <= n <= MAX_WORDS else "FAIL"
    if res["words"] == "FAIL":
        msgs.append(f"caption is {n} words (need {MIN_WORDS}-{MAX_WORDS})")

    first_line = cap.strip().split("\n", 1)[0].strip()
    hook_ok = 0 < len(first_line.split()) <= 25 and not first_line.startswith("http")
    res["hook"] = "PASS" if hook_ok else "FAIL"
    if not hook_ok:
        msgs.append("first line is not a short hook")

    res["url"] = "PASS" if r["article_url"] and r["article_url"] in cap else "FAIL"
    if res["url"] == "FAIL":
        msgs.append("caption does not contain article_url")

    hits = []
    for field in ("caption", "card_headline", "notes"):
        for label, rx in BANNED:
            if rx.search(r[field]):
                hits.append(f"{label} in {field}")
    res["banned"] = "PASS" if not hits else "FAIL"
    msgs.extend(hits)

    if TEAM_MENTION.search(cap):
        res["team_line"] = "PASS" if TEAM_LINE.search(cap) else "FAIL"
        if res["team_line"] == "FAIL":
            msgs.append("AI marketing team mentioned without the dedicated-human line")
    else:
        res["team_line"] = "PASS"

    tags = r["hashtags"].split()
    tag_ok = 3 <= len(tags) <= 5 and set(tags) <= HASHTAG_POOL and len(set(tags)) == len(tags)
    res["hashtags"] = "PASS" if tag_ok else "FAIL"
    if not tag_ok:
        msgs.append(f"hashtags '{r['hashtags']}' not 3-5 unique tags from the pool")
    if "#" in cap:
        res["hashtags"] = "FAIL"
        msgs.append("hashtags belong in the hashtags column, not the caption")

    res["time"] = "PASS" if r["time_et"] == REQUIRED_TIME else "FAIL"
    if res["time"] == "FAIL":
        msgs.append(f"time_et {r['time_et']} is not {REQUIRED_TIME}")

    try:
        wd = datetime.strptime(r["date"], "%Y-%m-%d").weekday()
        res["day"] = "PASS" if wd in ALLOWED_DAYS else "FAIL"
        if res["day"] == "FAIL":
            msgs.append(f"{r['date']} is not Mon/Tue/Thu")
    except ValueError:
        res["day"] = "FAIL"
        msgs.append(f"bad date {r['date']}")

    hw = len(r["card_headline"].split())
    res["headline"] = "PASS" if 0 < hw <= MAX_HEADLINE_WORDS else "FAIL"
    if res["headline"] == "FAIL":
        msgs.append(f"card_headline has {hw} words (max {MAX_HEADLINE_WORDS})")

    res["layout"] = "PASS" if r["card_layout"] in {"type", "phone"} else "FAIL"
    if res["layout"] == "FAIL":
        msgs.append(f"card_layout {r['card_layout']} is not type|phone")

    res["status"] = "PASS" if r["status"] == "Pending Approval" else "FAIL"
    if res["status"] == "FAIL":
        msgs.append(f"status is '{r['status']}'")

    res["url_placeholder"] = "WARN" if PLACEHOLDER in r["article_url"] else "PASS"
    if res["url_placeholder"] == "WARN":
        msgs.append("URL placeholder: verify the live slug before scheduling")

    return res, msgs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", nargs="?", default=str(DEFAULT_CSV))
    ap.add_argument("--no-write", action="store_true", help="do not write compliance_pass back")
    args = ap.parse_args()
    path = Path(args.csv)

    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        fieldnames = reader.fieldnames or []
        rows = list(reader)

    keys = Counter((r["article_slug"], r["post_type"]) for r in rows)
    dups = {k for k, c in keys.items() if c > 1}
    slots = Counter((r["date"], r["time_et"]) for r in rows)
    dup_slots = {k for k, c in slots.items() if c > 1}

    checks = ["words", "hook", "url", "banned", "team_line", "hashtags", "time", "day",
              "headline", "layout", "status", "dup"]
    results = []
    any_fail = False
    for r in rows:
        res, msgs = check_row(r)
        key = (r["article_slug"], r["post_type"])
        res["dup"] = "PASS"
        if key in dups:
            res["dup"] = "FAIL"
            msgs.append("duplicate slug/post_type")
        if (r["date"], r["time_et"]) in dup_slots:
            res["dup"] = "FAIL"
            msgs.append("two posts in the same slot")
        hard_fail = any(res[c] == "FAIL" for c in checks)
        any_fail = any_fail or hard_fail
        r["compliance_pass"] = "N" if hard_fail else "Y"
        results.append((r, res, msgs))

    # Table
    head = f"{'date':<10} {'type':<6} {'slug':<44} " + " ".join(f"{c[:5]:<5}" for c in checks) + " words result"
    print(head)
    print("-" * len(head))
    for r, res, msgs in results:
        marks = " ".join(("ok   " if res[c] == "PASS" else "FAIL ") for c in checks)
        ptype = "first" if r["post_type"] == "first-share" else "2nd"
        print(f"{r['date']:<10} {ptype:<6} {r['article_slug'][:44]:<44} {marks} {word_count(r['caption']):>5} {r['compliance_pass']}")
        for m in msgs:
            print(f"{'':<10} {'':<6} - {m}")

    n_fail = sum(1 for r, _, _ in results if r["compliance_pass"] == "N")
    n_warn = sum(1 for _, res, _ in results if res.get("url_placeholder") == "WARN")
    phone = sum(1 for r, _, _ in results if r["card_layout"] == "phone")
    ratio_ok = rows and abs(phone / len(rows) - 1 / 3) <= 0.1
    print("-" * len(head))
    print(f"rows: {len(rows)}   pass: {len(rows) - n_fail}   fail: {n_fail}   "
          f"url placeholders (WARN): {n_warn}   phone cards: {phone}/{len(rows)} "
          f"({'ok' if ratio_ok else 'WARN: aim for one in three'})")
    print("RESULT:", "FAIL" if any_fail else "PASS")

    if not args.no_write and fieldnames:
        with path.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fieldnames, lineterminator="\n")
            w.writeheader()
            w.writerows(rows)
    return 1 if any_fail else 0


if __name__ == "__main__":
    sys.exit(main())
