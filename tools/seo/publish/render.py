"""HTML rendering for AfterVue resource pages.

The live site's article template is not in this repository yet, so this is a
brand-faithful stand-in built from the known brand facts: Cormorant Garamond
headings, Inter body, plum / gold / porcelain palette, a ~720 px white content
card, the site nav and footer, self-hosted fonts under ``/fonts/`` with system
fallbacks, and the AI-preview disclaimer. When the real template lands in the
repo, replace :func:`page_shell` and keep the rest.
"""
from __future__ import annotations

import datetime as _dt
import html
import json
import re
from typing import List, Optional, Sequence

import markdown

from articles import Article, Source, SITE_URL, RESOURCES_PATH

BRAND = "AfterVue"
DEFAULT_OG_IMAGE = "/og/resources-default.png"
LOGO_PATH = "/og/aftervue-logo.png"
CONTACT_EMAIL = "hello@getaftervue.com"
DISCLAIMER = "Every preview is an AI-generated illustration, not a guarantee of results."
INDEX_TITLE = "Resources for Medspas and Injectors"
INDEX_DESCRIPTION = (
    "Practical guides for medspa owners and injectors on consult-room previews, "
    "patient photo privacy, marketing, and websites that turn visits into consults."
)

NAV_LINKS = (("/", "Home"), ("/app/", "App"), ("/services.html", "Services"), (RESOURCES_PATH, "Resources"))
FOOTER_LINKS = (("/privacy.html", "Privacy"), ("/terms.html", "Terms"))

MD_EXTENSIONS = ["extra", "toc", "sane_lists"]
MD_EXTENSION_CONFIGS = {"toc": {"anchorlink": False, "permalink": False}}

CSS = """
@font-face{font-family:"Cormorant Garamond";font-style:normal;font-weight:600;font-display:swap;src:url("/fonts/CormorantGaramond-SemiBold.woff2") format("woff2")}
@font-face{font-family:"Inter";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/Inter-Regular.woff2") format("woff2")}
@font-face{font-family:"Inter";font-style:normal;font-weight:600;font-display:swap;src:url("/fonts/Inter-SemiBold.woff2") format("woff2")}
:root{--plum:#1B0F2E;--gold:#C9A24B;--porcelain:#F8F4EF;--ink:#2A2233;--muted:#6B6472;--card:#FFFFFF;--line:#E6DED4;--serif:"Cormorant Garamond",Georgia,"Times New Roman",serif;--sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--porcelain);color:var(--ink);font-family:var(--sans);font-size:17px;line-height:1.65}
a{color:var(--plum);text-decoration:underline;text-decoration-color:var(--gold);text-underline-offset:3px}
a:hover{text-decoration-thickness:2px}
h1,h2,h3,h4{font-family:var(--serif);font-weight:600;color:var(--plum);line-height:1.2;margin:1.6em 0 .5em}
h1{font-size:2.4rem;margin-top:0}
h2{font-size:1.7rem}
h3{font-size:1.3rem}
p,ul,ol,table,blockquote,pre{margin:0 0 1.1em}
.skip{position:absolute;left:-999px;top:0;background:var(--card);padding:.5rem 1rem}
.skip:focus{left:1rem;z-index:10}
.site-header{background:var(--plum);color:var(--porcelain)}
.site-header .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;max-width:1040px;margin:0 auto;padding:.9rem 1rem}
.brand{font-family:var(--serif);font-weight:600;font-size:1.5rem;color:var(--porcelain);text-decoration:none;letter-spacing:.01em}
.brand span{color:var(--gold)}
.site-nav{display:flex;flex-wrap:wrap;gap:.25rem 1.2rem}
.site-nav a{color:var(--porcelain);text-decoration:none;font-size:.95rem;border-bottom:2px solid transparent;padding:.2rem 0}
.site-nav a:hover,.site-nav a[aria-current="page"]{border-bottom-color:var(--gold)}
main{padding:2rem 1rem 3rem}
.card{background:var(--card);max-width:720px;margin:0 auto;padding:2.2rem 1.4rem 2.6rem;border:1px solid var(--line);border-radius:14px;box-shadow:0 10px 30px rgba(27,15,46,.06)}
@media(min-width:640px){.card{padding:3rem 3.2rem 3.4rem}}
.breadcrumbs{font-size:.85rem;color:var(--muted);margin:0 0 1.2rem}
.breadcrumbs ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.4rem}
.breadcrumbs li+li::before{content:"/";margin-right:.4rem;color:var(--gold)}
.meta{color:var(--muted);font-size:.9rem;margin:0 0 1.6rem;display:flex;flex-wrap:wrap;gap:.4rem .8rem}
.lede{font-size:1.15rem;color:var(--ink)}
.article-body img{max-width:100%;height:auto}
.article-body table{width:100%;border-collapse:collapse;font-size:.95rem}
.article-body th,.article-body td{border:1px solid var(--line);padding:.5rem .6rem;text-align:left;vertical-align:top}
.article-body th{background:var(--porcelain);font-weight:600}
.article-body blockquote{border-left:3px solid var(--gold);margin-left:0;padding-left:1rem;color:var(--muted)}
.article-body code{background:var(--porcelain);padding:.1em .35em;border-radius:4px;font-size:.92em}
.article-body pre{background:var(--porcelain);padding:1rem;border-radius:8px;overflow:auto}
.disclaimer{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:.8rem 0;margin:2rem 0;font-size:.92rem;color:var(--muted)}
.sources ol{padding-left:1.3rem;font-size:.92rem;word-break:break-word}
.sources li{margin-bottom:.4rem}
.related{margin-top:2.4rem;padding-top:1.4rem;border-top:1px solid var(--line)}
.related h2{margin-top:0;font-size:1.4rem}
.related ul,.article-list{list-style:none;padding:0;margin:0}
.related li,.article-list li{margin:0 0 1.1rem}
.article-list h2{font-size:1.45rem;margin:0 0 .25rem}
.article-list p{margin:0 0 .3rem}
.article-list .meta{margin:0}
.cta{display:inline-block;background:var(--plum);color:var(--porcelain);padding:.7rem 1.2rem;border-radius:999px;text-decoration:none;font-weight:600;border:2px solid var(--gold)}
.cta:hover{background:#2a1a45}
.site-footer{background:var(--plum);color:var(--porcelain);padding:2rem 1rem;font-size:.9rem}
.site-footer .wrap{max-width:1040px;margin:0 auto;display:flex;flex-wrap:wrap;justify-content:space-between;gap:.8rem 1.5rem}
.site-footer a{color:var(--porcelain);text-decoration-color:var(--gold)}
.site-footer nav{display:flex;flex-wrap:wrap;gap:1.2rem}
""".strip()


# --- helpers ----------------------------------------------------------------

def esc(text: str) -> str:
    """Escape for HTML text and double-quoted attributes (apostrophes stay readable)."""
    return html.escape(text or "", quote=True).replace("&#x27;", "'")


def absolute(path_or_url: str) -> str:
    if re.match(r"^https?://", path_or_url or "", re.IGNORECASE):
        return path_or_url
    return SITE_URL + ("/" + path_or_url.lstrip("/") if path_or_url else "")


def json_ld(data: dict) -> str:
    text = json.dumps(data, ensure_ascii=False, indent=2)
    text = text.replace("</", "<\\/")
    return f'<script type="application/ld+json">\n{text}\n</script>'


def long_date(d: _dt.date) -> str:
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def iso_date(d: Optional[_dt.date]) -> str:
    return d.isoformat() if d else ""


def render_markdown(body: str) -> str:
    md = markdown.Markdown(extensions=MD_EXTENSIONS, extension_configs=MD_EXTENSION_CONFIGS, output_format="html5")
    out = md.convert(body)
    return _mark_external_links(out)


def _mark_external_links(html_text: str) -> str:
    def repl(m: re.Match) -> str:
        tag = m.group(0)
        if re.search(r"\brel=", tag, re.IGNORECASE):
            return tag
        return tag[:-1] + ' rel="noopener">'
    return re.sub(r"<a\s+[^>]*href=[\"']https?://[^\"']+[\"'][^>]*>", repl, html_text, flags=re.IGNORECASE)


def organization() -> dict:
    return {
        "@type": "Organization",
        "name": BRAND,
        "url": SITE_URL + "/",
        "logo": {"@type": "ImageObject", "url": absolute(LOGO_PATH)},
    }


def breadcrumb_ld(items: Sequence[tuple]) -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i, "name": name, "item": absolute(path)}
            for i, (name, path) in enumerate(items, 1)
        ],
    }


# --- page shell -------------------------------------------------------------

def page_shell(*, title: str, description: str, canonical: str, body_html: str,
               og_type: str = "website", og_image: str = DEFAULT_OG_IMAGE,
               head_extra: str = "", current_path: str = RESOURCES_PATH,
               published: Optional[_dt.date] = None, modified: Optional[_dt.date] = None) -> str:
    full_title = f"{title} | {BRAND}"
    nav = "".join(
        f'<a href="{esc(p)}"{" aria-current=\"page\"" if p == current_path else ""}>{esc(label)}</a>'
        for p, label in NAV_LINKS
    )
    footer_links = "".join(f'<a href="{esc(p)}">{esc(label)}</a>' for p, label in FOOTER_LINKS)
    article_meta = ""
    if og_type == "article":
        if published:
            article_meta += f'\n  <meta property="article:published_time" content="{iso_date(published)}">'
        if modified:
            article_meta += f'\n  <meta property="article:modified_time" content="{iso_date(modified)}">'
    year = (modified or published or _dt.date.today()).year
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(full_title)}</title>
  <meta name="description" content="{esc(description)}">
  <link rel="canonical" href="{esc(canonical)}">
  <meta property="og:type" content="{esc(og_type)}">
  <meta property="og:site_name" content="{BRAND}">
  <meta property="og:title" content="{esc(full_title)}">
  <meta property="og:description" content="{esc(description)}">
  <meta property="og:url" content="{esc(canonical)}">
  <meta property="og:image" content="{esc(absolute(og_image))}">{article_meta}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(full_title)}">
  <meta name="twitter:description" content="{esc(description)}">
  <meta name="twitter:image" content="{esc(absolute(og_image))}">
  <link rel="icon" href="/favicon.ico">
  <style>
{CSS}
  </style>
{head_extra}
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="/">After<span>Vue</span></a>
      <nav class="site-nav" aria-label="Site">{nav}</nav>
    </div>
  </header>
  <main id="main">
{body_html}
  </main>
  <footer class="site-footer">
    <div class="wrap">
      <div>&copy; {year} {BRAND}. <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a></div>
      <nav aria-label="Legal">{footer_links}</nav>
    </div>
  </footer>
</body>
</html>
"""


# --- article page -----------------------------------------------------------

def sources_html(sources: Sequence[Source]) -> str:
    if not sources:
        return ""
    items = []
    for s in sources:
        label = esc(s.label)
        items.append(f'<li><a href="{esc(s.url)}" rel="noopener">{label}</a></li>')
    return f"""
<section class="sources" aria-labelledby="sources-heading">
  <h2 id="sources-heading">Sources</h2>
  <ol>
    {chr(10).join(items)}
  </ol>
</section>"""


def related_articles(article: Article, others: Sequence[Article], limit: int = 3) -> List[Article]:
    pool = [o for o in others if o.slug != article.slug]
    same = sorted((o for o in pool if o.cluster and o.cluster == article.cluster),
                  key=lambda o: (o.date or _dt.date.min), reverse=True)
    rest = sorted((o for o in pool if o not in same),
                  key=lambda o: (o.date or _dt.date.min), reverse=True)
    return (same + rest)[:limit]


def related_html(related: Sequence[Article]) -> str:
    if not related:
        return ""
    items = "\n    ".join(
        f'<li><a href="{esc(o.url_path)}">{esc(o.title)}</a><br><span class="meta">{esc(o.description)}</span></li>'
        for o in related
    )
    return f"""
<aside class="related" aria-labelledby="related-heading">
  <h2 id="related-heading">Related reading</h2>
  <ul>
    {items}
  </ul>
</aside>"""


def article_ld(article: Article, og_image: str) -> dict:
    modified = article.updated or article.date
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": article.title,
        "description": article.description,
        "image": absolute(og_image),
        "datePublished": iso_date(article.date),
        "dateModified": iso_date(modified),
        "author": organization(),
        "publisher": organization(),
        "mainEntityOfPage": {"@type": "WebPage", "@id": article.canonical},
        "wordCount": article.word_count,
        "inLanguage": "en",
    }


def render_article(article: Article, others: Sequence[Article] = ()) -> str:
    og_image = article.image or DEFAULT_OG_IMAGE
    body = render_markdown(article.body)
    date_html = ""
    if article.date:
        date_html = f'<time datetime="{iso_date(article.date)}">{esc(long_date(article.date))}</time>'
        if article.updated and article.updated != article.date:
            date_html += f' <span>Updated <time datetime="{iso_date(article.updated)}">{esc(long_date(article.updated))}</time></span>'
    disclaimer = f'\n<p class="disclaimer">{esc(DISCLAIMER)}</p>' if article.mentions_previews else ""
    head_extra = "\n".join([
        json_ld(article_ld(article, og_image)),
        json_ld(breadcrumb_ld([("Home", "/"), ("Resources", RESOURCES_PATH), (article.title, article.url_path)])),
    ])
    body_html = f"""
<article class="card">
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <ol>
      <li><a href="/">Home</a></li>
      <li><a href="{RESOURCES_PATH}">Resources</a></li>
      <li aria-current="page">{esc(article.title)}</li>
    </ol>
  </nav>
  <h1>{esc(article.title)}</h1>
  <p class="meta">{date_html}<span>{article.reading_minutes} min read</span></p>
  <p class="lede">{esc(article.description)}</p>
  <div class="article-body">
{body}
  </div>{disclaimer}{sources_html(article.sources)}{related_html(related_articles(article, others))}
</article>"""
    return page_shell(
        title=article.title, description=article.description, canonical=article.canonical,
        body_html=body_html, og_type="article", og_image=og_image, head_extra=head_extra,
        published=article.date, modified=article.updated or article.date,
    )


# --- index page -------------------------------------------------------------

def sort_newest_first(articles: Sequence[Article]) -> List[Article]:
    return sorted(articles, key=lambda a: ((a.date or _dt.date.min), a.title.lower()), reverse=True)


def render_index(articles: Sequence[Article]) -> str:
    ordered = sort_newest_first(articles)
    canonical = SITE_URL + RESOURCES_PATH
    items = []
    for a in ordered:
        date_html = f'<time datetime="{iso_date(a.date)}">{esc(long_date(a.date))}</time>' if a.date else ""
        items.append(
            f'<li><h2><a href="{esc(a.url_path)}">{esc(a.title)}</a></h2>'
            f'<p>{esc(a.description)}</p>'
            f'<p class="meta">{date_html}<span>{a.reading_minutes} min read</span></p></li>'
        )
    listing = "\n    ".join(items) if items else "<li>New guides are on the way.</li>"
    head_extra = "\n".join([
        json_ld({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": f"{INDEX_TITLE} | {BRAND}",
            "description": INDEX_DESCRIPTION,
            "url": canonical,
            "publisher": organization(),
            "mainEntity": {
                "@type": "ItemList",
                "itemListElement": [
                    {"@type": "ListItem", "position": i, "url": a.canonical, "name": a.title}
                    for i, a in enumerate(ordered, 1)
                ],
            },
        }),
        json_ld(breadcrumb_ld([("Home", "/"), ("Resources", RESOURCES_PATH)])),
    ])
    body_html = f"""
<section class="card">
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <ol>
      <li><a href="/">Home</a></li>
      <li aria-current="page">Resources</li>
    </ol>
  </nav>
  <h1>{esc(INDEX_TITLE)}</h1>
  <p class="lede">{esc(INDEX_DESCRIPTION)}</p>
  <p class="disclaimer">{esc(DISCLAIMER)}</p>
  <ul class="article-list">
    {listing}
  </ul>
  <p><a class="cta" href="/app/">See it on your own face</a></p>
</section>"""
    return page_shell(title=INDEX_TITLE, description=INDEX_DESCRIPTION, canonical=canonical,
                      body_html=body_html, og_type="website", head_extra=head_extra)


# --- sitemap ----------------------------------------------------------------

def render_sitemap(articles: Sequence[Article], generated: Optional[_dt.date] = None) -> str:
    ordered = sort_newest_first(articles)
    dates = [a.updated or a.date for a in ordered if (a.updated or a.date)]
    index_lastmod = max(dates) if dates else (generated or _dt.date.today())
    entries = [(SITE_URL + RESOURCES_PATH, index_lastmod, "weekly", "0.6")]
    for a in ordered:
        entries.append((a.canonical, a.updated or a.date, "monthly", "0.5"))
    urls = "\n".join(
        "  <url>\n"
        f"    <loc>{esc(loc)}</loc>\n"
        + (f"    <lastmod>{iso_date(lastmod)}</lastmod>\n" if lastmod else "")
        + f"    <changefreq>{freq}</changefreq>\n"
        f"    <priority>{prio}</priority>\n"
        "  </url>"
        for loc, lastmod, freq, prio in entries
    )
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"{urls}\n</urlset>\n")
