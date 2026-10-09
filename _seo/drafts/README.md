# SEO article draft queue

This folder holds article drafts for getaftervue.com, one Markdown file per
keyword cluster, with YAML front matter (`title`, `description`, `slug`, `date`,
`cluster`, `target_page`, `internal_links`, `sources`, `status`).

Drafts here are consumed by `tools/seo/build_articles.py` on the main codebase,
which renders them into site pages and updates the sitemap. Each draft is opened
as its own pull request so it can be reviewed alone.

Before opening a PR, run `python3 scripts/check_seo_front_matter.py <draft.md>`
to confirm the title is 60 characters or fewer, the description is 155 or fewer,
the required front-matter keys are present, and the body length is in range.

Rules every draft follows: every statistic has a source URL; no practice or
location counts; no pricing; no personal names; every preview is described as an
illustrative AI preview, not a guarantee; photos are never stored by AfterVue;
AfterVue hands off to the practice's own booking page and does not book consults
itself; no beauty scores; no exclamation marks.
