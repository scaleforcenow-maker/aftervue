#!/usr/bin/env python3
"""Validate App Store metadata in ops/41_metadata.json against Apple's limits.

Checks, for every locale in the file:
  * each text field is present and within the character limit
    (name 30, subtitle 30, promotionalText 170, keywords 100,
     description 4000, whatsNew 4000; limits are read from the JSON)
  * no forbidden trademark appears in any field ("Botox", see App Store
    Review Guideline 5.2); the term list is read from the JSON
  * keywords: no space after a comma, no empty or duplicate terms
  * warnings (do not fail the run): keyword terms that repeat a word already
    in the name or subtitle, missing supportUrl, URLs that are not https

Usage:
  python3 tools/appstore/check_metadata.py [path/to/metadata.json]
Exit status 0 when every locale passes, 1 on any error.
Standard library only; safe to run with `python3 -I`.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "ops" / "41_metadata.json"

TEXT_FIELDS = ("name", "subtitle", "promotionalText", "keywords", "description", "whatsNew")
URL_FIELDS = ("privacyPolicyUrl", "marketingUrl", "supportUrl")

DEFAULT_LIMITS = {
    "name": 30,
    "subtitle": 30,
    "promotionalText": 170,
    "keywords": 100,
    "description": 4000,
    "whatsNew": 4000,
}
DEFAULT_FORBIDDEN = ["botox"]


def fold(text: str) -> str:
    """Lowercase and strip accents so 'Bótox' matches 'botox'."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def words(text: str) -> set[str]:
    return {w for w in re.split(r"[^\w]+", fold(text)) if w}


def check_locale(code: str, loc: dict, limits: dict, forbidden: list[str]):
    errors: list[str] = []
    warnings: list[str] = []
    rows: list[tuple[str, int, int, str]] = []

    for field in TEXT_FIELDS:
        value = loc.get(field)
        limit = limits[field]
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{field}: missing or empty")
            rows.append((field, 0, limit, "MISSING"))
            continue
        n = len(value)
        status = "ok" if n <= limit else "OVER"
        if n > limit:
            errors.append(f"{field}: {n} characters, limit {limit}")
        rows.append((field, n, limit, status))

        folded = fold(value)
        for term in sorted({fold(t) for t in forbidden}):
            if term in folded:
                errors.append(f"{field}: contains forbidden term {term!r}")

    kw = loc.get("keywords")
    if isinstance(kw, str) and kw:
        if ", " in kw or re.search(r",\s", kw):
            errors.append("keywords: space after a comma (use 'a,b,c')")
        terms = kw.split(",")
        if any(not t.strip() for t in terms):
            errors.append("keywords: empty term (double comma or trailing comma)")
        if any(t != t.strip() for t in terms):
            errors.append("keywords: leading/trailing whitespace in a term")
        folded_terms = [fold(t) for t in terms]
        dupes = {t for t in folded_terms if folded_terms.count(t) > 1}
        if dupes:
            errors.append(f"keywords: duplicate terms {sorted(dupes)}")
        taken = words(loc.get("name", "")) | words(loc.get("subtitle", ""))
        repeats = sorted(w for t in terms for w in words(t) if w in taken)
        if repeats:
            warnings.append(
                "keywords repeat words already indexed from name/subtitle "
                f"(wasted characters): {repeats}"
            )

    for field in URL_FIELDS:
        url = loc.get(field)
        if url is None:
            if field == "supportUrl":
                warnings.append("supportUrl is not set (App Store Connect requires it)")
            continue
        if not isinstance(url, str) or not url.startswith("https://"):
            warnings.append(f"{field}: not an https URL: {url!r}")

    return rows, errors, warnings


def main(argv: list[str]) -> int:
    path = Path(argv[1]) if len(argv) > 1 else DEFAULT_PATH
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    limits = {**DEFAULT_LIMITS, **data.get("limits", {})}
    forbidden = data.get("forbiddenTerms") or DEFAULT_FORBIDDEN
    locales = data.get("locales") or {}
    if not locales:
        print(f"ERROR: no locales found in {path}")
        return 1

    total_errors = 0
    print(f"Checking {path}")
    print(f"Locales: {', '.join(locales)}")
    print(f"Forbidden terms: {', '.join(forbidden)}\n")

    for code, loc in locales.items():
        rows, errors, warnings = check_locale(code, loc, limits, forbidden)
        print(f"== {code} ==")
        print(f"{'field':<17}{'chars':>6}{'limit':>7}  status")
        for field, n, limit, status in rows:
            print(f"{field:<17}{n:>6}{limit:>7}  {status}")
        for w in warnings:
            print(f"  warning: {w}")
        for e in errors:
            print(f"  ERROR: {e}")
        print("  result:", "PASS" if not errors else f"FAIL ({len(errors)} error(s))")
        print()
        total_errors += len(errors)

    if total_errors:
        print(f"FAILED: {total_errors} error(s) across {len(locales)} locale(s)")
        return 1
    print(f"OK: all {len(locales)} locale(s) within Apple's limits, no forbidden terms")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
