#!/usr/bin/env python3
"""Build publish-ready /resources/ pages from reviewed drafts. Deploys nothing.

    python3 tools/seo/publish/build.py                   # status: reviewed (and published)
    python3 tools/seo/publish/build.py --include-drafts  # also status: draft
    python3 tools/seo/publish/build.py --out site_out --drafts _seo/drafts

Output (under --out, default site_out/):
    resources/<slug>/index.html   one page per article
    resources/index.html          the listing, newest first
    sitemap-resources.xml         <url> entries for the listing and each article
    build-manifest.json           what was built, for CI and the PR body

Every selected draft is validated first. If any fails, nothing is written and
the exit status is 1, unless --skip-invalid is given: then the failing drafts
are left out, the rest are built, and the exit status is still 1 so CI stays
red while the artifact remains useful.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from articles import (  # noqa: E402
    PUBLISH_STATUSES, STATUS_DRAFT, Article, DraftError, load_article, validate,
)
from render import render_article, render_index, render_sitemap, sort_newest_first  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DRAFTS = REPO_ROOT / "_seo" / "drafts"
DEFAULT_OUT = REPO_ROOT / "site_out"


def select_articles(folder: Path, include_drafts: bool) -> tuple:
    """Return (selected, skipped_by_status, unreadable) from the drafts folder."""
    wanted = set(PUBLISH_STATUSES) | ({STATUS_DRAFT} if include_drafts else set())
    selected, skipped, unreadable = [], [], []
    for p in sorted(folder.glob("*.md")):
        if p.name.lower() == "readme.md":
            continue
        try:
            a = load_article(p)
        except DraftError as e:
            unreadable.append((p, str(e)))
            continue
        if a.status in wanted:
            selected.append(a)
        else:
            skipped.append(a)
    return selected, skipped, unreadable


def build(articles, out: Path, clean: bool = True) -> dict:
    """Write pages, index and sitemap for already-validated articles."""
    resources = out / "resources"
    if clean and resources.exists():
        shutil.rmtree(resources)
    resources.mkdir(parents=True, exist_ok=True)
    ordered = sort_newest_first(articles)
    pages = []
    for a in ordered:
        page_dir = resources / a.slug
        page_dir.mkdir(parents=True, exist_ok=True)
        (page_dir / "index.html").write_text(render_article(a, ordered), encoding="utf-8")
        pages.append({
            "slug": a.slug, "title": a.title, "status": a.status, "date": a.date.isoformat() if a.date else None,
            "cluster": a.cluster, "words": a.word_count, "reading_minutes": a.reading_minutes,
            "path": str((page_dir / "index.html").relative_to(out)), "url": a.canonical,
        })
    (resources / "index.html").write_text(render_index(ordered), encoding="utf-8")
    (out / "sitemap-resources.xml").write_text(render_sitemap(ordered), encoding="utf-8")
    manifest = {
        "generated": _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat(),
        "pages": pages,
        "index": "resources/index.html",
        "sitemap": "sitemap-resources.xml",
    }
    (out / "build-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--drafts", type=Path, default=DEFAULT_DRAFTS, help=f"drafts folder (default: {DEFAULT_DRAFTS})")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help=f"output folder (default: {DEFAULT_OUT})")
    ap.add_argument("--include-drafts", action="store_true", help='also build articles with status "draft"')
    ap.add_argument("--skip-invalid", action="store_true",
                    help="build the valid articles even when some fail validation (exit status stays 1)")
    ap.add_argument("--no-clean", action="store_true", help="do not delete <out>/resources before writing")
    args = ap.parse_args(argv)

    folder: Path = args.drafts
    out: Path = args.out
    if not folder.is_dir():
        print(f"build: no drafts folder at {folder}; building an empty listing")
        selected, skipped, unreadable = [], [], []
    else:
        selected, skipped, unreadable = select_articles(folder, args.include_drafts)

    for p, msg in unreadable:
        print(f"build: {p.name}: {msg}")
    for a in skipped:
        print(f"build: skipping {a.path.name} (status {a.status or 'missing'!r})")

    slugs = [a.slug or a.file_slug for a in selected]
    failures = [(a, validate(a, slugs)) for a in selected]
    bad = [a for a, f in failures if f]
    for a, msgs in failures:
        for msg in msgs:
            print(f"build: {a.path.name}: {msg}")

    exit_code = 1 if (bad or unreadable) else 0
    if bad and not args.skip_invalid:
        print(f"build: {len(bad)} of {len(selected)} article(s) failed validation; nothing written "
              f"(use --skip-invalid to build the rest)")
        return exit_code
    if bad:
        # Drop the failing pages, then re-resolve links among what is left.
        good = [a for a in selected if a not in bad]
        slugs = [a.slug for a in good]
        still_bad = [a for a in good if validate(a, slugs)]
        for a in still_bad:
            print(f"build: {a.path.name}: links to a skipped article; left out as well")
        good = [a for a in good if a not in still_bad]
    else:
        good = selected

    manifest = build(good, out, clean=not args.no_clean)
    print(f"build: wrote {len(manifest['pages'])} article page(s), resources/index.html and "
          f"sitemap-resources.xml to {out}")
    if bad:
        print(f"build: {len(bad)} article(s) left out because they failed validation")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
