# Article build kit (`tools/seo/publish/`)

Turns reviewed article drafts in `_seo/drafts/` into publish-ready static pages
for `https://getaftervue.com/resources/<slug>/`, plus the listing page and a
sitemap fragment. It also validates every draft against the mechanical half of
`_seo/EDITORIAL_STANDARD.md`.

**This kit never deploys.** It writes files to a local folder and stops. Putting
them on the live site is a separate, manual step described under
"Publishing handoff" below.

## Requirements

Python 3.11 or newer. Dependencies are pinned in `requirements.txt`
(`markdown`, `pyyaml`, and `pytest` for the tests); everything else is the
standard library.

```bash
python3 -m pip install -r tools/seo/publish/requirements.txt
```

## Commands

Run from the repository root.

| Command | What it does |
| --- | --- |
| `python3 tools/seo/publish/check_drafts.py` | Validates every draft in `_seo/drafts/` (any status) and prints a table of file, status and failures. Exit 1 if any fail. Used by CI. `--format markdown` prints a table for a PR body. |
| `python3 tools/seo/publish/build.py` | Validates and builds the drafts with `status: reviewed` (or `published`) into `site_out/`. Exit 1 and writes nothing if any selected draft fails. |
| `python3 tools/seo/publish/build.py --include-drafts` | Same, but also builds `status: draft` articles (for previewing work in progress). |
| `python3 tools/seo/publish/build.py --skip-invalid` | Builds the valid articles, leaves the failing ones out, still exits 1. CI uses this so the artifact is useful even when a draft fails. |
| `python3 tools/seo/publish/merge_sitemap.py --into sitemap.xml --from site_out/sitemap-resources.xml` | Inserts or updates the `/resources/` `<url>` entries in an existing `sitemap.xml`. Other URLs are not touched. Safe to run repeatedly. |
| `python3 -m pytest -q tools/seo/publish` | Runs the tests. |

Options shared by `build.py` and `check_drafts.py`: `--drafts <folder>` (default
`_seo/drafts/`). `build.py` also takes `--out <folder>` (default `site_out/`).

## What the output is

```
site_out/
  resources/
    index.html                 listing page, newest first
    <slug>/index.html          one page per article
  sitemap-resources.xml        <url> entries for /resources/ and each article
  build-manifest.json          what was built (slug, title, status, date, words)
```

Each article page carries: `<title>` as `<title> | AfterVue`, meta description,
canonical URL, Open Graph and Twitter tags (`og:image` defaults to
`/og/resources-default.png`; set `image:` in the front matter to override),
JSON-LD `Article` (headline, datePublished, dateModified from `updated:` or
`date:`, author and publisher Organization "AfterVue" with a logo URL,
mainEntityOfPage) and `BreadcrumbList`, the date and reading time, the body,
the AI-preview disclaimer whenever the article mentions previews, a Sources
section built from the front matter, and a Related block linking up to three
other built articles (same cluster first, then newest).

`site_out/` is git-ignored output. Do not commit it.

### The template

The live site's article template is not in this repository yet, and the site
cannot be fetched from a cloud session (the network policy blocks
`getaftervue.com`), so `render.py` is a brand-faithful stand-in built from the
known brand facts: Cormorant Garamond 600 headings (fallback Georgia), Inter
body (fallback system sans), plum `#1B0F2E`, gold `#C9A24B`, porcelain
`#F8F4EF` background, a white content card about 720 px wide, the site nav
(`/`, `/app/`, `/services.html`, `/resources/`) and footer (`/privacy.html`,
`/terms.html`, `hello@getaftervue.com`). Fonts are referenced as self-hosted
files under `/fonts/` with system fallbacks; there are no Google Fonts links.

Two paths are assumptions to confirm against the site folder on the Mac:
the font file names in the `@font-face` rules at the top of `render.py`
(`CormorantGaramond-SemiBold.woff2`, `Inter-Regular.woff2`,
`Inter-SemiBold.woff2`) and the publisher logo `LOGO_PATH`
(`/og/aftervue-logo.png`). Edit the constants if the real names differ.

## Validation rules

`check_drafts.py` and `build.py` apply the same rules. Each failure is one
line naming the file and the problem.

- Front matter is valid YAML with `title`, `description`, `slug`, `date`,
  `cluster`, `target_page`, `internal_links`, `sources`, `status`.
- `title` is 60 characters or fewer; `description` 155 or fewer.
- `slug` is lowercase letters, digits and hyphens, and equals the filename.
- `status` is `draft`, `reviewed` or `published`.
- No H1 in the body (the title is the H1).
- Every internal link (front matter and body) resolves to a built page or a
  known path: `/`, `/app/`, `/services.html`, `/privacy.html`, `/terms.html`,
  `/support.html`, `/resources/`. Fragments such as `/#demo` are fine.
  `/resources/<slug>/` must point at an article in the same set: every draft
  in the folder for `check_drafts.py`, the articles selected for this build in
  `build.py`.
- No exclamation marks in body text (code, URLs and image syntax excluded).
- No `$` followed by digits within 80 characters of "AfterVue".
- "Botox" at most once per article and never in the title, description or a
  heading.
- No email addresses other than the role aliases (`hello@`, `privacy@`,
  `support@` at getaftervue.com).
- Every URL in `sources` is cited in the body, either where the claim is made
  or in a `## Sources` section the writer adds. The built page always renders
  a Sources section from the front matter, so this rule is about the draft
  text: a source that nothing in the article points at is a source the reader
  cannot connect to a claim.
- Body word count between 700 and 1,200.

`sources` entries can be plain URLs, URLs with a trailing note
(`https://... (unverified from sandbox)`), or mappings with `url`, `name` and
`status`. Names are used as link text on the page; notes are not published.

## Publishing handoff (manual, on the Mac)

The production site is a static site on Vercel built from the founder's Mac.
Until the site code is in this repository, publishing is a copy:

1. Merge the article PR (status must be `reviewed`).
2. On the Mac, in this repository: `python3 tools/seo/publish/build.py`.
   Or download the `resources-pages` artifact from the Articles workflow run
   on the merge commit.
3. Copy `site_out/resources/*` into the site folder's `resources/` directory,
   replacing the files that are already there.
4. Merge the sitemap:
   `python3 tools/seo/publish/merge_sitemap.py --into <site folder>/sitemap.xml --from site_out/sitemap-resources.xml`
5. Check that `/og/resources-default.png` and the `/fonts/` files exist in
   the site folder. Open one page locally.
6. Run the site's normal deploy. This kit does not do that step.

Once the site code lives in this repository, call `build.py --out <site
folder>` from the site's build script and run `merge_sitemap.py` after it, so
articles are rebuilt with every site build. The kit will still not deploy;
the site's existing deploy does.

## CI

`.github/workflows/articles.yml` runs on pull requests and pushes that touch
`_seo/drafts/**` or `tools/seo/publish/**`: installs the pinned requirements,
runs the tests, runs `check_drafts.py` (the job fails if any draft fails),
builds with `--include-drafts --skip-invalid`, and uploads `site_out/` plus
the validation report as the `resources-pages` workflow artifact. There is no
deploy step.
