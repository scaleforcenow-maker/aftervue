"""Article drafts: front matter parsing, the Article model, and validation.

A draft is a Markdown file in ``_seo/drafts/`` with YAML front matter:

    title, description, slug, date, cluster, target_page, internal_links,
    sources, status

``sources`` entries may be plain URL strings, strings with a trailing note
("https://example.com/page (unverified from sandbox)"), or mappings with
``url`` plus optional ``name`` / ``status``. All forms normalise to
:class:`Source`.

Validation rules (see :func:`validate`) are the mechanical half of
``_seo/EDITORIAL_STANDARD.md``. Every failure is a short, specific message so
a writer can fix the draft without reading this file.
"""
from __future__ import annotations

import datetime as _dt
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Set

import yaml

SITE_URL = "https://getaftervue.com"
RESOURCES_PATH = "/resources/"

# Site paths an internal link may point at besides built article pages.
KNOWN_PATHS = frozenset(
    {"/", "/app/", "/services.html", "/privacy.html", "/terms.html", "/support.html", RESOURCES_PATH}
)

# The only email addresses allowed in a public article.
ROLE_ALIASES = frozenset(
    {"hello@getaftervue.com", "privacy@getaftervue.com", "support@getaftervue.com"}
)

REQUIRED_KEYS = (
    "title", "description", "slug", "date", "cluster", "target_page",
    "internal_links", "sources", "status",
)

STATUS_DRAFT = "draft"
STATUS_REVIEWED = "reviewed"
STATUS_PUBLISHED = "published"
PUBLISH_STATUSES = frozenset({STATUS_REVIEWED, STATUS_PUBLISHED})
ALL_STATUSES = frozenset({STATUS_DRAFT, STATUS_REVIEWED, STATUS_PUBLISHED})

TITLE_MAX = 60
DESCRIPTION_MAX = 155
WORDS_MIN = 700
WORDS_MAX = 1200
DOLLAR_WINDOW = 80  # characters between "$<digits>" and "AfterVue"
WORDS_PER_MINUTE = 200

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
FRONT_MATTER_RE = re.compile(r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*\r?\n?", re.DOTALL)
FENCED_CODE_RE = re.compile(r"^(```|~~~).*?^\1[ \t]*$", re.MULTILINE | re.DOTALL)
INLINE_CODE_RE = re.compile(r"`[^`\n]*`")
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
URL_RE = re.compile(r"(?:https?://|www\.)[^\s<>()\[\]\"']+")
IMAGE_BANG_RE = re.compile(r"!(?=\[)")
HEADING_RE = re.compile(r"^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$", re.MULTILINE)
MD_LINK_RE = re.compile(r"(?<!!)\[([^\]]*)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
HTML_HREF_RE = re.compile(r"<a\s+[^>]*href=[\"']([^\"']+)[\"']", re.IGNORECASE)
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
DOLLAR_RE = re.compile(r"\$\d")
BRAND_RE = re.compile(r"\bAfterVue\b")
BOTOX_RE = re.compile(r"\bbotox\b", re.IGNORECASE)
PREVIEW_RE = re.compile(r"\bpreviews?\b", re.IGNORECASE)


class DraftError(Exception):
    """The file cannot be read as a draft at all (no front matter, bad YAML)."""


@dataclass(frozen=True)
class Source:
    url: str
    name: Optional[str] = None
    note: Optional[str] = None

    @property
    def label(self) -> str:
        return self.name or self.url


@dataclass
class Article:
    path: Path
    meta: dict
    body: str
    title: str = ""
    description: str = ""
    slug: str = ""
    date: Optional[_dt.date] = None
    updated: Optional[_dt.date] = None
    cluster: str = ""
    target_page: str = ""
    internal_links: List[str] = field(default_factory=list)
    sources: List[Source] = field(default_factory=list)
    status: str = ""
    image: Optional[str] = None
    load_errors: List[str] = field(default_factory=list)

    # --- derived -----------------------------------------------------------

    @property
    def file_slug(self) -> str:
        return self.path.stem

    @property
    def url_path(self) -> str:
        return f"{RESOURCES_PATH}{self.slug or self.file_slug}/"

    @property
    def canonical(self) -> str:
        return SITE_URL + self.url_path

    @property
    def word_count(self) -> int:
        return len(plain_words(self.body))

    @property
    def reading_minutes(self) -> int:
        return max(1, -(-self.word_count // WORDS_PER_MINUTE))  # ceil

    @property
    def mentions_previews(self) -> bool:
        return bool(PREVIEW_RE.search(self.title) or PREVIEW_RE.search(self.description)
                    or PREVIEW_RE.search(self.body))

    @property
    def headings(self) -> List[tuple]:
        """(level, text) for every ATX heading in the body, code blocks excluded."""
        text = _blank_out(self.body, FENCED_CODE_RE)
        return [(len(m.group(1)), m.group(2).strip()) for m in HEADING_RE.finditer(text)]

    def internal_link_targets(self) -> List[str]:
        """Every site-relative link: front matter plus body (Markdown and HTML)."""
        targets: List[str] = [self.target_page] + list(self.internal_links)
        body = _blank_out(self.body, FENCED_CODE_RE)
        body = _blank_out(body, INLINE_CODE_RE)
        for m in MD_LINK_RE.finditer(body):
            targets.append(m.group(2))
        for m in HTML_HREF_RE.finditer(body):
            targets.append(m.group(1))
        return [t for t in targets if t and is_internal(t)]


# --- parsing ----------------------------------------------------------------

def split_front_matter(text: str) -> tuple:
    """Return (meta, body). Raises DraftError when there is no valid front matter."""
    m = FRONT_MATTER_RE.match(text)
    if not m:
        raise DraftError("no YAML front matter block at the top of the file")
    try:
        meta = yaml.safe_load(m.group(1))
    except yaml.YAMLError as e:
        raise DraftError(f"front matter is not valid YAML: {e}") from e
    if meta is None:
        meta = {}
    if not isinstance(meta, dict):
        raise DraftError("front matter must be a YAML mapping")
    return meta, text[m.end():]


def parse_source(item) -> Source:
    """Normalise one ``sources`` entry. Raises ValueError when no URL is found."""
    if isinstance(item, dict):
        url = str(item.get("url") or "").strip()
        name = item.get("name") or item.get("title")
        note = item.get("status") or item.get("note")
        if not url:
            raise ValueError(f"source entry has no url: {item!r}")
        return Source(url=_clean_url(url), name=str(name).strip() if name else None,
                      note=str(note).strip() if note else None)
    text = str(item).strip()
    m = URL_RE.search(text)
    if not m:
        raise ValueError(f"source entry has no URL: {text!r}")
    url = _clean_url(m.group(0))
    rest = (text[:m.start()] + " " + text[m.end():]).strip(" -:;,()")
    return Source(url=url, name=None, note=rest or None)


def _clean_url(url: str) -> str:
    return url.strip().rstrip(".,;:")


def parse_date(value) -> Optional[_dt.date]:
    if isinstance(value, _dt.datetime):
        return value.date()
    if isinstance(value, _dt.date):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return _dt.date.fromisoformat(value.strip()[:10])
        except ValueError:
            return None
    return None


def load_article(path: Path) -> Article:
    """Parse a draft. Structural problems land in ``load_errors`` (reported by validate)."""
    path = Path(path)
    text = path.read_text(encoding="utf-8")
    meta, body = split_front_matter(text)
    art = Article(path=path, meta=meta, body=body)

    for key in REQUIRED_KEYS:
        if key not in meta or meta[key] in (None, ""):
            art.load_errors.append(f"front matter is missing `{key}`")

    art.title = _as_str(meta.get("title"))
    art.description = _as_str(meta.get("description"))
    art.slug = _as_str(meta.get("slug"))
    art.cluster = _as_str(meta.get("cluster"))
    art.target_page = _as_str(meta.get("target_page"))
    art.status = _as_str(meta.get("status")).lower()
    art.image = _as_str(meta.get("image")) or None

    art.date = parse_date(meta.get("date"))
    if "date" in meta and meta.get("date") not in (None, "") and art.date is None:
        art.load_errors.append(f"`date` is not an ISO date (YYYY-MM-DD): {meta.get('date')!r}")
    art.updated = parse_date(meta.get("updated"))
    if "updated" in meta and meta.get("updated") not in (None, "") and art.updated is None:
        art.load_errors.append(f"`updated` is not an ISO date (YYYY-MM-DD): {meta.get('updated')!r}")

    links = meta.get("internal_links") or []
    if isinstance(links, str):
        links = [links]
    if not isinstance(links, list):
        art.load_errors.append("`internal_links` must be a list of site paths")
        links = []
    art.internal_links = [_as_str(x) for x in links if _as_str(x)]

    sources = meta.get("sources") or []
    if isinstance(sources, (str, dict)):
        sources = [sources]
    if not isinstance(sources, list):
        art.load_errors.append("`sources` must be a list of URLs or {name, url} mappings")
        sources = []
    for item in sources:
        try:
            art.sources.append(parse_source(item))
        except ValueError as e:
            art.load_errors.append(str(e))
    return art


def load_drafts(folder: Path, pattern: str = "*.md") -> List[Article]:
    """Load every draft in a folder (README.md and other non-drafts are skipped)."""
    folder = Path(folder)
    out: List[Article] = []
    for p in sorted(folder.glob(pattern)):
        if p.name.lower() == "readme.md":
            continue
        out.append(load_article(p))
    return out


def _as_str(v) -> str:
    if v is None:
        return ""
    return str(v).strip()


# --- text helpers -----------------------------------------------------------

def _blank_out(text: str, pattern: re.Pattern) -> str:
    """Replace matches with spaces (newlines kept) so offsets still line up."""
    def repl(m: re.Match) -> str:
        return "".join("\n" if ch == "\n" else " " for ch in m.group(0))
    return pattern.sub(repl, text)


def prose_text(body: str) -> str:
    """Body with code, comments, URLs and image bangs blanked; same length as input."""
    text = _blank_out(body, FENCED_CODE_RE)
    text = _blank_out(text, HTML_COMMENT_RE)
    text = _blank_out(text, INLINE_CODE_RE)
    text = _blank_out(text, URL_RE)
    text = _blank_out(text, IMAGE_BANG_RE)
    return text


def plain_words(body: str) -> List[str]:
    """Words a reader sees: Markdown syntax and link URLs removed."""
    text = FENCED_CODE_RE.sub(" ", body)
    text = HTML_COMMENT_RE.sub(" ", text)
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", " ", text)            # images
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)            # links -> text
    text = re.sub(r"\[([^\]]*)\]\[[^\]]*\]", r"\1", text)           # ref links
    text = re.sub(r"^\s*\[[^\]]+\]:\s*\S+.*$", " ", text, flags=re.MULTILINE)  # ref defs
    text = re.sub(r"<[^>]+>", " ", text)                             # html tags
    text = re.sub(r"^[ \t]*#{1,6}[ \t]+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[ \t]*(?:[-*+]|\d+[.)])[ \t]+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[ \t]*>[ \t]?", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[ \t]*\|?[\s:|-]+\|?[ \t]*$", " ", text, flags=re.MULTILINE)  # table rules
    text = text.replace("|", " ")
    text = re.sub(r"[*_`~]+", "", text)
    return [w for w in re.split(r"\s+", text) if re.search(r"[A-Za-z0-9]", w)]


def is_internal(target: str) -> bool:
    t = target.strip()
    if not t or t.startswith("#"):
        return False
    low = t.lower()
    if re.match(r"^[a-z][a-z0-9+.-]*:", low):  # http:, https:, mailto:, tel: ...
        return False
    if low.startswith("//"):
        return False
    return True


def normalise_path(target: str) -> str:
    """Strip query/fragment; add the trailing slash on /resources/<slug>."""
    t = target.strip().split("#", 1)[0].split("?", 1)[0]
    if not t:
        return "/"
    if not t.startswith("/"):
        t = "/" + t
    if re.fullmatch(r"/resources/[^/]+", t):
        t += "/"
    if t.endswith("/index.html"):
        t = t[: -len("index.html")]
    return t


def normalise_url(url: str) -> str:
    u = _clean_url(url)
    u = re.sub(r"^http://", "https://", u, flags=re.IGNORECASE)
    u = re.sub(r"^(https://)www\.", r"\1", u, flags=re.IGNORECASE)
    return u.rstrip("/").lower()


def body_urls(body: str) -> Set[str]:
    return {normalise_url(m.group(0)) for m in URL_RE.finditer(body)}


# --- validation -------------------------------------------------------------

def validate(article: Article, resolvable_slugs: Iterable[str] = ()) -> List[str]:
    """Return every rule the draft breaks (empty list means publish-ready).

    ``resolvable_slugs`` are the article slugs that ``/resources/<slug>/`` links
    may point at: the pages in the current build, or every draft in the folder
    when only checking.
    """
    a = article
    slugs = set(resolvable_slugs)
    fails: List[str] = list(a.load_errors)
    prose = prose_text(a.body)

    # title / description
    if a.title and len(a.title) > TITLE_MAX:
        fails.append(f"title is {len(a.title)} characters (max {TITLE_MAX})")
    if a.description and len(a.description) > DESCRIPTION_MAX:
        fails.append(f"description is {len(a.description)} characters (max {DESCRIPTION_MAX})")

    # slug
    if a.slug:
        if not SLUG_RE.match(a.slug):
            fails.append(f"slug {a.slug!r} must be lowercase letters, digits and hyphens")
        if a.slug != a.file_slug:
            fails.append(f"slug {a.slug!r} does not match the filename {a.path.name!r}")

    # status
    if a.status and a.status not in ALL_STATUSES:
        fails.append(f"status {a.status!r} is not one of {', '.join(sorted(ALL_STATUSES))}")

    # body structure
    h1s = [t for lvl, t in a.headings if lvl == 1]
    if h1s:
        fails.append(f"body has an H1 heading ({h1s[0]!r}); the title is the H1, use H2 and below")

    # internal links
    seen = set()
    for target in a.internal_link_targets():
        p = normalise_path(target)
        if p in seen:
            continue
        seen.add(p)
        if p in KNOWN_PATHS:
            continue
        m = re.fullmatch(r"/resources/([^/]+)/", p)
        if m and m.group(1) in slugs:
            continue
        if m:
            fails.append(f"internal link {target!r} points to an article that is not in this set")
        else:
            fails.append(f"internal link {target!r} is not a built page or a known site path")

    # exclamation marks
    for m in re.finditer(r"!", prose):
        line = prose.count("\n", 0, m.start()) + 1
        fails.append(f"exclamation mark in body text (line {line})")
        break

    # "$<digits>" near "AfterVue"
    brand_spans = [(m.start(), m.end()) for m in BRAND_RE.finditer(prose)]
    for d in DOLLAR_RE.finditer(prose):
        near = any(min(abs(d.start() - be), abs(bs - d.end())) <= DOLLAR_WINDOW for bs, be in brand_spans)
        if near:
            line = prose.count("\n", 0, d.start()) + 1
            fails.append(f"dollar amount within {DOLLAR_WINDOW} characters of \"AfterVue\" (line {line}); no pricing in copy")
            break

    # Botox
    if BOTOX_RE.search(a.title):
        fails.append("\"Botox\" in the title; use \"wrinkle relaxer\"")
    if BOTOX_RE.search(a.description):
        fails.append("\"Botox\" in the description; use \"wrinkle relaxer\"")
    for _, text in a.headings:
        if BOTOX_RE.search(text):
            fails.append(f"\"Botox\" in a heading ({text!r}); use \"wrinkle relaxer\"")
            break
    botox_hits = len(BOTOX_RE.findall(prose))
    if botox_hits > 1:
        fails.append(f"\"Botox\" appears {botox_hits} times in the body (max once, in quotation marks, quoting a search phrase)")

    # personal email addresses (checked across the whole file)
    raw = _blank_out(a.path.read_text(encoding="utf-8") if a.path.exists() else a.body, URL_RE)
    for m in EMAIL_RE.finditer(raw):
        addr = m.group(0).lower().strip(".")
        if addr not in ROLE_ALIASES:
            fails.append(f"email address {addr!r} is not a role alias ({', '.join(sorted(ROLE_ALIASES))})")
            break

    # sources must be cited
    cited = body_urls(a.body)
    for s in a.sources:
        if normalise_url(s.url) not in cited:
            fails.append(f"source URL not cited in the body or a Sources section: {s.url}")

    # word count
    wc = a.word_count
    if wc < WORDS_MIN or wc > WORDS_MAX:
        fails.append(f"body is {wc} words (must be {WORDS_MIN} to {WORDS_MAX:,})")

    return fails


def validate_all(articles: Sequence[Article], resolvable_slugs: Optional[Iterable[str]] = None) -> dict:
    """Map each article path to its failure list."""
    if resolvable_slugs is None:
        resolvable_slugs = [a.slug or a.file_slug for a in articles]
    return {a.path: validate(a, resolvable_slugs) for a in articles}
