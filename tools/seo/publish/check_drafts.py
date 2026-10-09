#!/usr/bin/env python3
"""Validate every draft in _seo/drafts/ and print a table. Builds nothing.

    python3 tools/seo/publish/check_drafts.py            # all drafts, any status
    python3 tools/seo/publish/check_drafts.py --drafts path/to/folder
    python3 tools/seo/publish/check_drafts.py --format markdown   # for a PR body

Exit status: 0 when every draft passes (or the folder is empty), 1 when any
draft fails, 2 on a usage error. Internal links to /resources/<slug>/ resolve
against every draft in the folder, whatever its status.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from articles import DraftError, load_drafts, validate_all  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DRAFTS = REPO_ROOT / "_seo" / "drafts"


def check(folder: Path) -> list:
    """Return rows of (file, status, failures) for every .md in the folder."""
    rows = []
    try:
        articles = load_drafts(folder)
    except DraftError:
        articles = []
        for p in sorted(folder.glob("*.md")):
            if p.name.lower() == "readme.md":
                continue
            try:
                from articles import load_article
                articles.append(load_article(p))
            except DraftError as e:
                rows.append((p.name, "?", [str(e)]))
    results = validate_all(articles)
    for a in articles:
        rows.append((a.path.name, a.status or "?", results[a.path]))
    rows.sort(key=lambda r: r[0])
    return rows


def format_table(rows, fmt: str = "text") -> str:
    if fmt == "markdown":
        out = ["| File | Status | Result |", "| --- | --- | --- |"]
        for name, status, fails in rows:
            result = "ok" if not fails else "<br>".join(f"- {f}" for f in fails)
            out.append(f"| `{name}` | {status} | {result} |")
        return "\n".join(out)
    width = max([len("file")] + [len(r[0]) for r in rows]) if rows else 4
    out = [f"{'file'.ljust(width)}  {'status'.ljust(8)}  failures", f"{'-' * width}  {'-' * 8}  {'-' * 8}"]
    for name, status, fails in rows:
        if not fails:
            out.append(f"{name.ljust(width)}  {status.ljust(8)}  ok")
            continue
        out.append(f"{name.ljust(width)}  {status.ljust(8)}  {fails[0]}")
        for f in fails[1:]:
            out.append(f"{' ' * width}  {' ' * 8}  {f}")
    return "\n".join(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--drafts", type=Path, default=DEFAULT_DRAFTS, help=f"drafts folder (default: {DEFAULT_DRAFTS})")
    ap.add_argument("--format", choices=("text", "markdown"), default="text")
    args = ap.parse_args(argv)

    folder = args.drafts
    if not folder.is_dir():
        print(f"check_drafts: no drafts folder at {folder} (nothing to check)")
        return 0
    rows = check(folder)
    if not rows:
        print(f"check_drafts: no drafts in {folder} (nothing to check)")
        return 0
    print(format_table(rows, args.format))
    failed = [r for r in rows if r[2]]
    print()
    if failed:
        print(f"check_drafts: {len(failed)} of {len(rows)} draft(s) failed")
        return 1
    print(f"check_drafts: {len(rows)} draft(s) ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
