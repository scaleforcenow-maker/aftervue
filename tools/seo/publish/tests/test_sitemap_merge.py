import xml.etree.ElementTree as ET

from merge_sitemap import NS, merge_sitemaps, main as merge_main

EXISTING = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://getaftervue.com/</loc><lastmod>2026-09-01</lastmod><priority>1.0</priority></url>
  <url><loc>https://getaftervue.com/app/</loc><lastmod>2026-09-01</lastmod></url>
  <url><loc>https://getaftervue.com/resources/old-guide/</loc><lastmod>2026-08-01</lastmod><changefreq>monthly</changefreq></url>
</urlset>
"""

INCOMING = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://getaftervue.com/resources/</loc><lastmod>2026-10-09</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
  <url><loc>https://getaftervue.com/resources/old-guide/</loc><lastmod>2026-10-09</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>
  <url><loc>https://getaftervue.com/resources/new-guide/</loc><lastmod>2026-10-09</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>
</urlset>
"""


def entries(xml):
    root = ET.fromstring(xml)
    out = []
    for u in root.findall("sm:url", NS):
        loc = u.find("sm:loc", NS).text
        lastmod = u.find("sm:lastmod", NS)
        out.append((loc, lastmod.text if lastmod is not None else None))
    return out


def test_merge_adds_updates_and_keeps_other_urls():
    merged, added, updated = merge_sitemaps(EXISTING, INCOMING)
    assert (added, updated) == (2, 1)
    got = entries(merged)
    assert got[0] == ("https://getaftervue.com/", "2026-09-01")       # untouched, same position
    assert got[1] == ("https://getaftervue.com/app/", "2026-09-01")   # untouched
    assert got[2] == ("https://getaftervue.com/resources/old-guide/", "2026-10-09")  # updated in place
    assert got[3][0] == "https://getaftervue.com/resources/"
    assert got[4][0] == "https://getaftervue.com/resources/new-guide/"
    assert "ns0:" not in merged
    assert 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' in merged


def test_merge_is_idempotent():
    once, _, _ = merge_sitemaps(EXISTING, INCOMING)
    twice, added, updated = merge_sitemaps(once, INCOMING)
    assert (added, updated) == (0, 0)
    assert twice == once


def test_merge_into_missing_sitemap_creates_it():
    merged, added, updated = merge_sitemaps(None, INCOMING)
    assert (added, updated) == (3, 0)
    assert [e[0] for e in entries(merged)] == [
        "https://getaftervue.com/resources/",
        "https://getaftervue.com/resources/old-guide/",
        "https://getaftervue.com/resources/new-guide/",
    ]


def test_cli_writes_target(tmp_path, capsys):
    target = tmp_path / "sitemap.xml"
    target.write_text(EXISTING, encoding="utf-8")
    source = tmp_path / "sitemap-resources.xml"
    source.write_text(INCOMING, encoding="utf-8")
    assert merge_main(["--into", str(target), "--from", str(source)]) == 0
    assert "2 added, 1 updated, 5 total" in capsys.readouterr().out
    assert len(entries(target.read_text(encoding="utf-8"))) == 5
    # second run: nothing changes
    assert merge_main(["--into", str(target), "--from", str(source)]) == 0
    assert "0 added, 0 updated, 5 total" in capsys.readouterr().out


def test_cli_rejects_sitemap_index(tmp_path, capsys):
    target = tmp_path / "sitemap.xml"
    target.write_text('<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>', encoding="utf-8")
    source = tmp_path / "in.xml"
    source.write_text(INCOMING, encoding="utf-8")
    assert merge_main(["--into", str(target), "--from", str(source)]) == 2
    assert "sitemap index" in capsys.readouterr().err
