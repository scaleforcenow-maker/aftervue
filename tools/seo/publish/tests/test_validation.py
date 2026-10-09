"""One pass and one fail case per validation rule."""
from articles import load_article, validate
from conftest import make_body, write_draft


def failures(path, slugs=("a-short-title",)):
    return validate(load_article(path), slugs)


def test_valid_draft_has_no_failures(drafts):
    assert failures(write_draft(drafts)) == []


# --- title / description ---------------------------------------------------

def test_title_at_limit_passes(drafts):
    assert failures(write_draft(drafts, title="x" * 60)) == []


def test_title_over_limit_fails(drafts):
    f = failures(write_draft(drafts, title="x" * 61))
    assert any("title is 61 characters" in m for m in f)


def test_description_at_limit_passes(drafts):
    assert failures(write_draft(drafts, description="y" * 155)) == []


def test_description_over_limit_fails(drafts):
    f = failures(write_draft(drafts, description="y" * 156))
    assert any("description is 156 characters" in m for m in f)


# --- slug --------------------------------------------------------------------

def test_slug_must_match_filename(drafts):
    f = failures(write_draft(drafts, "file-name", slug="other-slug"), ["file-name"])
    assert any("does not match the filename" in m for m in f)


def test_slug_must_be_url_safe(drafts):
    f = failures(write_draft(drafts, "Bad_Slug", slug="Bad_Slug"), ["Bad_Slug"])
    assert any("lowercase letters" in m for m in f)


# --- status ------------------------------------------------------------------

def test_unknown_status_fails(drafts):
    f = failures(write_draft(drafts, status="final"))
    assert any("status 'final'" in m for m in f)


# --- internal links ----------------------------------------------------------

def test_known_paths_and_built_pages_resolve(drafts):
    body = make_body(extra="Read [privacy](/privacy.html), [support](/support.html), "
                           "[the other guide](/resources/other-guide/) and [demo](/services.html#demo).")
    p = write_draft(drafts, body=body, internal_links=["/", "/app/", "/terms.html", "/resources/"])
    assert failures(p, ["a-short-title", "other-guide"]) == []


def test_link_to_unbuilt_article_fails(drafts):
    body = make_body(extra="See [the other guide](/resources/not-built/).")
    f = failures(write_draft(drafts, body=body))
    assert any("'/resources/not-built/'" in m and "not in this set" in m for m in f)


def test_link_to_unknown_path_fails(drafts):
    f = failures(write_draft(drafts, internal_links=["/pricing.html"]))
    assert any("'/pricing.html'" in m and "not a built page" in m for m in f)


def test_fragment_only_and_external_links_are_ignored(drafts):
    body = make_body(extra="Jump to [a section](#section-1) or [an external page](https://example.com/x).")
    assert failures(write_draft(drafts, body=body)) == []


# --- exclamation marks -------------------------------------------------------

def test_exclamation_in_body_fails(drafts):
    f = failures(write_draft(drafts, body=make_body(extra="This is exciting!")))
    assert any("exclamation mark" in m for m in f)


def test_exclamation_in_code_or_url_is_fine(drafts):
    body = make_body(extra="Run `echo hi!` or visit https://example.com/path?x=!y and look at ![alt](/img.png).")
    assert [m for m in failures(write_draft(drafts, body=body)) if "exclamation" in m] == []


# --- dollar amounts near the brand -------------------------------------------

def test_dollar_near_brand_fails(drafts):
    f = failures(write_draft(drafts, body=make_body(extra="AfterVue costs $99 per month for the app.")))
    assert any("dollar amount" in m for m in f)


def test_dollar_far_from_brand_passes(drafts):
    filler = "word " * 30
    body = make_body(extra=f"Agencies often charge $2,500 a month. {filler}AfterVue is a preview app.")
    assert [m for m in failures(write_draft(drafts, body=body)) if "dollar" in m] == []


# --- Botox -------------------------------------------------------------------

def test_botox_once_in_body_passes(drafts):
    body = make_body(extra='People search for "Botox before and after" every day.')
    assert [m for m in failures(write_draft(drafts, body=body)) if "Botox" in m] == []


def test_botox_twice_in_body_fails(drafts):
    body = make_body(extra='People search "Botox" and also "botox near me".')
    f = failures(write_draft(drafts, body=body))
    assert any("appears 2 times" in m for m in f)


def test_botox_in_title_description_or_heading_fails(drafts):
    assert any("in the title" in m for m in failures(write_draft(drafts, title="Botox Previews Explained")))
    assert any("in the description" in m for m in failures(write_draft(drafts, description="Learn what Botox previews show.")))
    body = make_body(extra="## What a Botox simulator shows")
    assert any("in a heading" in m for m in failures(write_draft(drafts, body=body)))


# --- email addresses ---------------------------------------------------------

def test_role_alias_email_passes(drafts):
    body = make_body(extra="Write to hello@getaftervue.com or privacy@getaftervue.com.")
    assert [m for m in failures(write_draft(drafts, body=body)) if "email" in m] == []


def test_personal_email_fails(drafts):
    body = make_body(extra="Write to jane.doe@example.com for details.")
    f = failures(write_draft(drafts, body=body))
    assert any("'jane.doe@example.com' is not a role alias" in m for m in f)


# --- sources -----------------------------------------------------------------

def test_source_cited_inline_passes(drafts):
    assert failures(write_draft(drafts)) == []


def test_source_listed_in_a_sources_section_passes(drafts):
    body = make_body(extra="## Sources\n\n- HHS: https://www.hhs.gov/hipaa/index.html")
    p = write_draft(drafts, body=body, sources=["https://www.americanmedspa.org/news/photos/", "https://www.hhs.gov/hipaa/index.html"])
    assert failures(p) == []


def test_source_not_in_body_fails(drafts):
    p = write_draft(drafts, sources=["https://www.americanmedspa.org/news/photos/", "https://www.ftc.gov/guides"])
    f = failures(p)
    assert any("not cited" in m and "https://www.ftc.gov/guides" in m for m in f)


def test_source_match_ignores_www_scheme_and_trailing_slash(drafts):
    body = make_body(extra="Per [the FTC](http://ftc.gov/guides/).")
    p = write_draft(drafts, body=body, sources=["https://www.americanmedspa.org/news/photos/", "https://www.ftc.gov/guides"])
    assert failures(p) == []


# --- word count --------------------------------------------------------------

def test_word_count_bounds(drafts):
    assert failures(write_draft(drafts, body=make_body(words=700))) == []
    assert any("words" in m for m in failures(write_draft(drafts, body=make_body(words=600))))
    assert any("words" in m for m in failures(write_draft(drafts, body=make_body(words=1300))))


# --- body H1 -----------------------------------------------------------------

def test_h1_in_body_fails(drafts):
    f = failures(write_draft(drafts, body=make_body(intro="# Duplicate Title")))
    assert any("H1 heading" in m for m in f)
