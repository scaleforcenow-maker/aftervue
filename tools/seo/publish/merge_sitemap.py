#!/usr/bin/env python3
"""Merge resource <url> entries into an existing sitemap.xml.

    python3 merge_sitemap.py --into site/sitemap.xml --from site_out/sitemap-resources.xml

Entries are matched on <loc>. An existing entry is updated in place (its
children replaced by the incoming ones); a new entry is appended. Every other
<url> in the target is left exactly as it was, in its original order. Running
the merge twice is a no-op the second time. If the target does not exist it is
created with just the incoming entries.

Stdlib only.
"""
from __future__ import annotations

import argparse
import copy
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional

SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
NS = {"sm": SITEMAP_NS}
ET.register_namespace("", SITEMAP_NS)
ET.register_namespace("xhtml", "http://www.w3.org/1999/xhtml")
ET.register_namespace("image", "http://www.google.com/schemas/sitemap-image/1.1")


def _q(tag: str) -> str:
    return f"{{{SITEMAP_NS}}}{tag}"


def _loc(url_el: ET.Element) -> Optional[str]:
    loc = url_el.find("sm:loc", NS)
    if loc is None or loc.text is None:
        return None
    return loc.text.strip()


def _indent(elem: ET.Element, level: int = 0) -> None:
    pad = "\n" + "  " * level
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = pad + "  "
        for child in elem:
            _indent(child, level + 1)
            if not child.tail or not child.tail.strip():
                child.tail = pad + "  "
        if not child.tail or not child.tail.strip():  # last child
            child.tail = pad
    elif level and (not elem.tail or not elem.tail.strip()):
        elem.tail = pad


def merge_sitemaps(target_xml: Optional[str], incoming_xml: str) -> tuple:
    """Return (merged_xml, added, updated). ``target_xml`` may be None (no file yet)."""
    incoming_root = ET.fromstring(incoming_xml)
    if incoming_root.tag != _q("urlset"):
        raise ValueError("incoming sitemap is not a <urlset>")

    if target_xml is None or not target_xml.strip():
        root = ET.Element(_q("urlset"))
    else:
        root = ET.fromstring(target_xml)
        if root.tag != _q("urlset"):
            raise ValueError("target sitemap is not a <urlset> (sitemap index files are not supported)")

    existing = {}
    for url_el in root.findall("sm:url", NS):
        loc = _loc(url_el)
        if loc:
            existing[loc] = url_el

    added = updated = 0
    for incoming in incoming_root.findall("sm:url", NS):
        loc = _loc(incoming)
        if not loc:
            continue
        fresh = copy.deepcopy(incoming)
        if loc in existing:
            current = existing[loc]
            if _canonical(current) != _canonical(fresh):
                for child in list(current):
                    current.remove(child)
                for child in list(fresh):
                    current.append(child)
                updated += 1
        else:
            root.append(fresh)
            existing[loc] = fresh
            added += 1

    _indent(root)
    body = ET.tostring(root, encoding="unicode")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + body + "\n", added, updated


def _canonical(el: ET.Element) -> str:
    c = copy.deepcopy(el)
    for node in c.iter():
        if node.text:
            node.text = node.text.strip()
        node.tail = None
    return ET.tostring(c, encoding="unicode")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--into", required=True, help="existing sitemap.xml to update (created if missing)")
    ap.add_argument("--from", dest="source", required=True, help="sitemap-resources.xml produced by build.py")
    ap.add_argument("--out", help="write the merged sitemap here instead of overwriting --into")
    ap.add_argument("--dry-run", action="store_true", help="print the merged sitemap, write nothing")
    args = ap.parse_args(argv)

    target = Path(args.into)
    source = Path(args.source)
    if not source.exists():
        print(f"merge_sitemap: {source} not found", file=sys.stderr)
        return 2
    target_xml = target.read_text(encoding="utf-8") if target.exists() else None
    try:
        merged, added, updated = merge_sitemaps(target_xml, source.read_text(encoding="utf-8"))
    except (ET.ParseError, ValueError) as e:
        print(f"merge_sitemap: {e}", file=sys.stderr)
        return 2

    if args.dry_run:
        sys.stdout.write(merged)
    else:
        out = Path(args.out) if args.out else target
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(merged, encoding="utf-8")
        print(f"merge_sitemap: {out} ({added} added, {updated} updated, "
              f"{len(ET.fromstring(merged).findall('sm:url', NS))} total)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
