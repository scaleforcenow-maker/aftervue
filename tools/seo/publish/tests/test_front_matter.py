import datetime as dt

import pytest

from articles import DraftError, Source, load_article, parse_source, split_front_matter
from conftest import write_draft


def test_split_front_matter_returns_meta_and_body():
    meta, body = split_front_matter("---\ntitle: Hello\nslug: hello\n---\n\nBody text.\n")
    assert meta == {"title": "Hello", "slug": "hello"}
    assert body.strip() == "Body text."


def test_missing_front_matter_is_a_draft_error():
    with pytest.raises(DraftError):
        split_front_matter("# No front matter\n\nJust text.\n")


def test_invalid_yaml_is_a_draft_error():
    with pytest.raises(DraftError):
        split_front_matter("---\ntitle: [unclosed\n---\nBody\n")


def test_load_article_reads_every_field(drafts):
    p = write_draft(drafts, "my-article", cluster="G", target_page="/app/",
                    internal_links=["/app/", "/services.html"], updated="2026-10-12")
    a = load_article(p)
    assert a.title == "A Short Title About Previews"
    assert a.slug == "my-article"
    assert a.date == dt.date(2026, 10, 9)
    assert a.updated == dt.date(2026, 10, 12)
    assert a.cluster == "G"
    assert a.target_page == "/app/"
    assert a.internal_links == ["/app/", "/services.html"]
    assert a.sources == [Source(url="https://www.americanmedspa.org/news/photos/")]
    assert a.status == "reviewed"
    assert a.load_errors == []
    assert a.url_path == "/resources/my-article/"
    assert a.canonical == "https://getaftervue.com/resources/my-article/"


def test_missing_required_keys_are_recorded(drafts):
    p = write_draft(drafts, "no-cluster", cluster=None, sources=None)
    a = load_article(p)
    assert any("`cluster`" in e for e in a.load_errors)
    assert any("`sources`" in e for e in a.load_errors)


def test_bad_date_is_recorded(drafts):
    p = write_draft(drafts, "bad-date", date="October 9")
    a = load_article(p)
    assert a.date is None
    assert any("`date`" in e for e in a.load_errors)


@pytest.mark.parametrize("item,expected", [
    ("https://example.com/page", Source("https://example.com/page")),
    ("https://example.com/page (unverified from sandbox)", Source("https://example.com/page", None, "unverified from sandbox")),
    ({"name": "Example", "url": "https://example.com/x", "status": "unverified"}, Source("https://example.com/x", "Example", "unverified")),
    ({"url": "https://example.com/y"}, Source("https://example.com/y")),
])
def test_parse_source_forms(item, expected):
    assert parse_source(item) == expected


def test_parse_source_without_url_fails():
    with pytest.raises(ValueError):
        parse_source("just a note, no link")
    with pytest.raises(ValueError):
        parse_source({"name": "No url"})


def test_flow_style_lists_and_yaml_comments(drafts):
    raw = (
        'title: "Flow Style"\n'
        'description: "Flow style lists parse too."\n'
        "slug: flow-style\n"
        "date: 2026-10-09\n"
        'cluster: "C"\n'
        'target_page: "/app/"\n'
        'internal_links: ["/app/", "/"]\n'
        "sources:\n"
        "  - https://www.americanmedspa.org/news/photos/  # trailing YAML comment\n"
        'status: "draft"\n'
    )
    p = write_draft(drafts, "flow-style", raw_front_matter=raw)
    a = load_article(p)
    assert a.internal_links == ["/app/", "/"]
    assert a.sources[0].url == "https://www.americanmedspa.org/news/photos/"
    assert a.status == "draft"
