#!/usr/bin/env python3
"""Validate App Store metadata in ops/41_metadata.json against Apple's rules.

Errors (exit 1), for every locale in the file:
  * each text field is present and within its character limit, counted in
    Unicode code points the way App Store Connect counts (name 30,
    subtitle 30, promotionalText 170, keywords 100, description 4000,
    whatsNew 4000; limits are read from the JSON)
  * no third-party trademark appears in any field (App Store Review
    Guideline 5.2); the list lives in this script, not in the upload file
  * the app name is not translated: `name` equals app.name in every locale,
    the description mentions it verbatim, and no translated variant of the
    name ("AfterVue IA") appears anywhere
  * keywords: no space after a comma, no empty or duplicate terms, and no
    word that is already indexed from the name or subtitle
  * every phrase in the locale's `requiredPhrases` (the disclaimers) is
    present verbatim in the description
  * no phone number or price pattern in any field (the repo is public)
  * when the Markdown review copy is present, its field tables, character
    counts and fenced descriptions agree with the JSON

Warnings (do not fail the run): missing supportUrl, URLs that are not
https, text that is not NFC-normalized.

Usage:
  python3 -I tools/appstore/check_metadata.py [metadata.json] [--markdown FILE | --no-markdown]
Standard library only; safe to run with `python3 -I`.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "ops" / "41_metadata.json"
DEFAULT_MARKDOWN_NAME = "41_App_Store_Localized_Metadata.md"

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

# Third-party trademarks that must never appear in listing metadata
# (guideline 5.2). Matched accent-folded and case-insensitive, so "Bótox",
# "BOTOX" and "botox" all fail. Kept here rather than in the JSON so the
# upload file itself never contains the word.
FORBIDDEN_TERMS = ("botox",)

# Translated spellings of the product name that must never appear.
TRANSLATED_NAME_PATTERNS = (r"aftervue\s+ia\b",)

PHONE_RE = re.compile(r"(?<!\d)(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)")
PRICE_RE = re.compile(
    r"(?:(?:US|MX|R|AR|CL|CO)?\$|€|£|USD|MXN|BRL|EUR)\s?\d"  # $9, R$ 99, USD 10
    r"|\d\s?(?:USD|MXN|BRL|EUR|dólares|pesos|reais|reales)\b"  # 10 USD, 99 reais
    r"|\d\s?/\s?(?:mes|mês|month|año|ano|year)\b",  # 9/mes
    re.IGNORECASE,
)

# Markdown table "Field" column -> JSON key.
MD_FIELD_KEYS = {
    "Name": "name",
    "Subtitle": "subtitle",
    "Promotional text": "promotionalText",
    "Keywords": "keywords",
    "What's New": "whatsNew",
    "Privacy policy URL": "privacyPolicyUrl",
    "Marketing URL": "marketingUrl",
}


def fold(text: str) -> str:
    """Lowercase and strip accents so 'Bótox' matches 'botox'."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def words(text: str) -> set[str]:
    return {w for w in re.split(r"[^\w]+", fold(text)) if w}


def check_locale(code: str, loc: dict, limits: dict, app_name: str | None):
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
        n = len(value)  # code points, as App Store Connect counts
        status = "ok" if n <= limit else "OVER"
        if n > limit:
            errors.append(f"{field}: {n} characters, limit {limit}")
        rows.append((field, n, limit, status))

        if unicodedata.normalize("NFC", value) != value:
            warnings.append(f"{field}: text is not NFC-normalized; App Store Connect may count it differently")

        folded = fold(value)
        for term in FORBIDDEN_TERMS:
            if fold(term) in folded:
                errors.append(f"{field}: contains forbidden trademark {term!r}")
        for pat in TRANSLATED_NAME_PATTERNS:
            if re.search(pat, folded):
                errors.append(f"{field}: app name must stay untranslated (matched /{pat}/)")
        if PHONE_RE.search(value):
            errors.append(f"{field}: looks like it contains a phone number")
        if PRICE_RE.search(value):
            errors.append(f"{field}: looks like it contains a price")

    name = loc.get("name")
    if app_name and isinstance(name, str) and name != app_name:
        errors.append(f"name: must be exactly {app_name!r} in every locale, got {name!r}")
    desc = loc.get("description")
    if app_name and isinstance(desc, str) and app_name not in desc:
        errors.append(f"description: does not mention the app name {app_name!r} verbatim")

    kw = loc.get("keywords")
    if isinstance(kw, str) and kw:
        if re.search(r",\s", kw):
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
        repeats = sorted({w for t in terms for w in words(t) if w in taken})
        if repeats:
            errors.append(
                "keywords: repeat words already indexed from name/subtitle "
                f"(wasted characters): {repeats}"
            )

    phrases = loc.get("requiredPhrases") or []
    if not phrases:
        warnings.append("requiredPhrases is empty: disclaimers are not being verified")
    for ph in phrases:
        if not isinstance(desc, str) or ph not in desc:
            errors.append(f"description: required disclaimer phrase missing: {ph!r}")

    for field in URL_FIELDS:
        url = loc.get(field)
        if url is None:
            if field == "supportUrl":
                warnings.append("supportUrl is not set (App Store Connect requires it)")
            continue
        if not isinstance(url, str) or not url.startswith("https://"):
            warnings.append(f"{field}: not an https URL: {url!r}")

    return rows, errors, warnings


def parse_markdown(text: str) -> dict[str, dict]:
    """Extract per-locale field values, counts and descriptions from the review copy.

    Returns {locale: {"fields": {key: (value, chars)}, "description": (text, chars)}}.
    """
    out: dict[str, dict] = {}
    # Any "### …" heading that names a locale code and is not a description heading.
    locale_re = re.compile(r"^### (?!\s*[a-z]{2}-[A-Z]{2} \(\d+/).*?\b([a-z]{2}-[A-Z]{2})\b.*$", re.M)
    sections = list(locale_re.finditer(text))
    for i, m in enumerate(sections):
        code = m.group(1)
        end = sections[i + 1].start() if i + 1 < len(sections) else len(text)
        body = text[m.end():end]
        fields: dict[str, tuple[str, int | None]] = {}
        for line in body.splitlines():
            if not line.startswith("|"):
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) < 4 or cells[0] in ("Field", "---"):
                continue
            label, value, chars = cells[0], cells[1], cells[2]
            key = MD_FIELD_KEYS.get(label)
            if key is None:
                continue
            value = value.strip("`")
            n = int(chars) if chars.isdigit() else None
            fields[key] = (value, n)
        if fields:
            out.setdefault(code, {})["fields"] = fields

    desc_re = re.compile(r"^### ([a-z]{2}-[A-Z]{2}) \((\d+)/\d+ chars\)\s*\n\n```text\n(.*?)\n```", re.M | re.S)
    for m in desc_re.finditer(text):
        out.setdefault(m.group(1), {})["description"] = (m.group(3), int(m.group(2)))
    return out


def check_markdown(md_path: Path, locales: dict) -> list[str]:
    """Return a list of disagreements between the Markdown review copy and the JSON."""
    errors: list[str] = []
    parsed = parse_markdown(md_path.read_text(encoding="utf-8"))
    for code, loc in locales.items():
        section = parsed.get(code)
        if not section:
            errors.append(f"{code}: no locale section found in {md_path.name}")
            continue
        fields = section.get("fields", {})
        for key in ("name", "subtitle", "promotionalText", "keywords", "whatsNew", "privacyPolicyUrl", "marketingUrl"):
            if key not in fields:
                errors.append(f"{code}: {key} row missing from the Markdown table")
                continue
            md_value, md_chars = fields[key]
            json_value = loc.get(key)
            if md_value != json_value:
                errors.append(f"{code}: {key} differs between Markdown and JSON")
            if key in TEXT_FIELDS and isinstance(json_value, str) and md_chars != len(json_value):
                errors.append(f"{code}: {key} char count in Markdown is {md_chars}, JSON has {len(json_value)}")
        desc = section.get("description")
        if desc is None:
            errors.append(f"{code}: fenced description block missing from the Markdown")
        else:
            md_text, md_chars = desc
            if md_text != loc.get("description"):
                errors.append(f"{code}: description text differs between Markdown and JSON")
            if isinstance(loc.get("description"), str) and md_chars != len(loc["description"]):
                errors.append(f"{code}: description char count in Markdown is {md_chars}, JSON has {len(loc['description'])}")
    return errors


def run(data: dict, md_path: Path | None, label: str = "") -> tuple[int, str]:
    """Validate a loaded metadata dict. Returns (exit_code, report_text)."""
    out: list[str] = []
    limits = {**DEFAULT_LIMITS, **data.get("limits", {})}
    app_name = (data.get("app") or {}).get("name")
    locales = data.get("locales") or {}
    if not locales:
        return 1, f"ERROR: no locales found in {label}\n"

    total_errors = 0
    out.append(f"Checking {label}")
    out.append(f"Locales: {', '.join(locales)}")
    out.append(f"Trademark terms blocked: {len(FORBIDDEN_TERMS)}; app name required verbatim: {app_name!r}\n")

    for code, loc in locales.items():
        rows, errors, warnings = check_locale(code, loc, limits, app_name)
        out.append(f"== {code} ==")
        out.append(f"{'field':<17}{'chars':>6}{'limit':>7}  status")
        for field, n, limit, status in rows:
            out.append(f"{field:<17}{n:>6}{limit:>7}  {status}")
        for w in warnings:
            out.append(f"  warning: {w}")
        for e in errors:
            out.append(f"  ERROR: {e}")
        out.append("  result: " + ("PASS" if not errors else f"FAIL ({len(errors)} error(s))"))
        out.append("")
        total_errors += len(errors)

    if md_path is not None:
        out.append(f"== Markdown cross-check: {md_path.name} ==")
        md_errors = check_markdown(md_path, locales)
        for e in md_errors:
            out.append(f"  ERROR: {e}")
        out.append("  result: " + ("PASS (tables and descriptions match the JSON)" if not md_errors else f"FAIL ({len(md_errors)} error(s))"))
        out.append("")
        total_errors += len(md_errors)

    if total_errors:
        out.append(f"FAILED: {total_errors} error(s) across {len(locales)} locale(s)")
        return 1, "\n".join(out) + "\n"
    out.append(f"OK: all {len(locales)} locale(s) within Apple's limits, disclaimers present, no forbidden terms")
    return 0, "\n".join(out) + "\n"


def main(argv: list[str]) -> int:
    args = list(argv[1:])
    md_path: Path | None = None
    skip_md = False
    positional: list[str] = []
    while args:
        a = args.pop(0)
        if a == "--markdown":
            md_path = Path(args.pop(0))
        elif a == "--no-markdown":
            skip_md = True
        else:
            positional.append(a)
    path = Path(positional[0]) if positional else DEFAULT_PATH
    if md_path is None and not skip_md:
        candidate = path.parent / DEFAULT_MARKDOWN_NAME
        md_path = candidate if candidate.exists() else None

    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    code, report = run(data, md_path, label=str(path))
    sys.stdout.write(report)
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
