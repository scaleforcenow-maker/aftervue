import json
import re

from articles import load_article
from conftest import make_body, write_draft
from render import DEFAULT_OG_IMAGE, DISCLAIMER, render_article, render_index, render_sitemap, sort_newest_first


def ld_blocks(html):
    return [json.loads(m.group(1).replace("<\\/", "</"))
            for m in re.finditer(r'<script type="application/ld\+json">\s*(.*?)\s*</script>', html, re.DOTALL)]


def test_article_page_has_title_canonical_meta_and_og(drafts):
    a = load_article(write_draft(drafts, "my-guide"))
    html = render_article(a)
    assert "<title>A Short Title About Previews | AfterVue</title>" in html
    assert '<link rel="canonical" href="https://getaftervue.com/resources/my-guide/">' in html
    assert '<meta name="description" content="A description with a verb that explains what the reader learns.">' in html
    assert '<meta property="og:type" content="article">' in html
    assert '<meta property="og:url" content="https://getaftervue.com/resources/my-guide/">' in html
    assert f'<meta property="og:image" content="https://getaftervue.com{DEFAULT_OG_IMAGE}">' in html
    assert '<meta name="twitter:card" content="summary_large_image">' in html
    assert '<meta property="article:published_time" content="2026-10-09">' in html


def test_article_json_ld_article_and_breadcrumbs(drafts):
    a = load_article(write_draft(drafts, "my-guide", updated="2026-10-12"))
    blocks = ld_blocks(render_article(a))
    types = {b["@type"]: b for b in blocks}
    art = types["Article"]
    assert art["headline"] == "A Short Title About Previews"
    assert art["datePublished"] == "2026-10-09"
    assert art["dateModified"] == "2026-10-12"
    assert art["author"]["@type"] == "Organization" and art["author"]["name"] == "AfterVue"
    assert art["publisher"]["name"] == "AfterVue"
    assert art["publisher"]["logo"]["url"].startswith("https://getaftervue.com/")
    assert art["mainEntityOfPage"]["@id"] == "https://getaftervue.com/resources/my-guide/"
    crumbs = types["BreadcrumbList"]["itemListElement"]
    assert [c["name"] for c in crumbs] == ["Home", "Resources", "A Short Title About Previews"]
    assert crumbs[2]["item"] == "https://getaftervue.com/resources/my-guide/"


def test_article_has_disclaimer_sources_reading_time_and_chrome(drafts):
    a = load_article(write_draft(drafts, "my-guide"))
    html = render_article(a)
    assert DISCLAIMER in html
    assert '<h2 id="sources-heading">Sources</h2>' in html
    assert 'href="https://www.americanmedspa.org/news/photos/" rel="noopener"' in html
    assert a.reading_minutes == -(-a.word_count // 200)  # ceil(words / 200 wpm)
    assert f"{a.reading_minutes} min read" in html
    for path in ("/", "/app/", "/services.html", "/resources/", "/privacy.html", "/terms.html"):
        assert f'href="{path}"' in html
    assert "hello@getaftervue.com" in html
    assert "/fonts/" in html and "fonts.googleapis.com" not in html
    assert "Cormorant Garamond" in html and "Georgia" in html and "Inter" in html


def test_disclaimer_only_when_previews_are_mentioned(drafts):
    body = make_body().replace("preview", "photo").replace("Preview", "Photo")
    a = load_article(write_draft(drafts, "no-previews", body=body,
                                 title="A Short Title About Photos", description="Nothing about them here."))
    assert DISCLAIMER not in render_article(a)


def test_markdown_renders_and_escapes(drafts):
    body = make_body(extra="A list:\n\n- one\n- two\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nAmpersand & <b>tag</b>.")
    a = load_article(write_draft(drafts, "md", title='Quotes "and" & Ampersands'))
    html = render_article(a)
    assert "<title>Quotes &quot;and&quot; &amp; Ampersands | AfterVue</title>" in html
    a2 = load_article(write_draft(drafts, "md2", body=body))
    html2 = render_article(a2)
    assert "<li>one</li>" in html2 and "<table>" in html2


def test_related_block_links_other_articles(drafts):
    a = load_article(write_draft(drafts, "one", cluster="A"))
    b = load_article(write_draft(drafts, "two", cluster="A", title="Second Guide"))
    c = load_article(write_draft(drafts, "three", cluster="B", title="Third Guide"))
    html = render_article(a, [a, b, c])
    assert "Related reading" in html
    assert 'href="/resources/two/"' in html and 'href="/resources/three/"' in html
    assert html.count('href="/resources/one/"') == 0
    assert "Related reading" not in render_article(a, [a])


def test_index_orders_newest_first(drafts):
    old = load_article(write_draft(drafts, "old", date="2026-09-01", title="Older Guide"))
    new = load_article(write_draft(drafts, "new", date="2026-10-09", title="Newest Guide"))
    mid = load_article(write_draft(drafts, "mid", date="2026-10-01", title="Middle Guide"))
    assert [a.slug for a in sort_newest_first([old, new, mid])] == ["new", "mid", "old"]
    html = render_index([old, new, mid])
    assert html.index("/resources/new/") < html.index("/resources/mid/") < html.index("/resources/old/")
    assert '<link rel="canonical" href="https://getaftervue.com/resources/">' in html
    assert DISCLAIMER in html
    assert "<title>Resources for Medspas and Injectors | AfterVue</title>" in html
    items = ld_blocks(html)[0]["mainEntity"]["itemListElement"]
    assert [i["name"] for i in items] == ["Newest Guide", "Middle Guide", "Older Guide"]


def test_sitemap_lists_index_and_articles(drafts):
    a = load_article(write_draft(drafts, "one", date="2026-10-09"))
    b = load_article(write_draft(drafts, "two", date="2026-09-01", updated="2026-10-02"))
    xml = render_sitemap([a, b])
    assert "<loc>https://getaftervue.com/resources/</loc>" in xml
    assert "<loc>https://getaftervue.com/resources/one/</loc>" in xml
    assert "<lastmod>2026-10-02</lastmod>" in xml  # updated wins over date
    assert xml.index("/resources/one/") < xml.index("/resources/two/")
