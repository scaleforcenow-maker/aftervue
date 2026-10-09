# Article draft queue

This folder is the SEO article draft queue. Each Markdown file is one article with YAML front matter (title, description, slug, date, cluster, target page, internal links, sources, status). Drafts here are consumed by `tools/seo/build_articles.py` in the main codebase, which renders them into site pages once their status moves from `draft` to `ready`. Keep every draft inside the house rules: no pricing, no personal names, no practice counts, no outcome promises, and every statistic sourced or omitted.
