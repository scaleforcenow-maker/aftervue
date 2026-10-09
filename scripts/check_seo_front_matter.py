#!/usr/bin/env python3
"""Check an SEO draft's front matter and body against the house limits."""
import re
import sys

REQUIRED = ["title", "description", "slug", "date", "cluster", "target_page",
            "internal_links", "sources", "status"]
TITLE_MAX, DESC_MAX, WORDS_MIN, WORDS_MAX = 60, 155, 800, 1000


def main(path):
    text = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        print("FAIL: no YAML front matter"); return 1
    fm, body = m.group(1), m.group(2)
    # HTML comments are build-time notes, not content: ignore them.
    body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
    ok = True
    for key in REQUIRED:
        if not re.search(rf"^{key}:", fm, re.M):
            print(f"FAIL: missing front-matter key {key}"); ok = False

    def scalar(key):
        mm = re.search(rf'^{key}:\s*"?(.*?)"?\s*$', fm, re.M)
        return mm.group(1) if mm else ""

    title, desc = scalar("title"), scalar("description")
    words = len(re.findall(r"\b[\w'-]+\b", re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", body)))
    for label, val, mx in (("title", len(title), TITLE_MAX), ("description", len(desc), DESC_MAX)):
        status = "ok" if val <= mx else "FAIL"
        print(f"{status}: {label} length {val} (max {mx})")
        ok = ok and val <= mx
    status = "ok" if WORDS_MIN <= words <= WORDS_MAX else "FAIL"
    print(f"{status}: body words {words} (range {WORDS_MIN}-{WORDS_MAX})")
    ok = ok and WORDS_MIN <= words <= WORDS_MAX
    if "!" in body:
        print("FAIL: exclamation mark in body"); ok = False
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
