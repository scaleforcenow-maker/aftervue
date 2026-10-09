# SEO article draft queue

This folder is the article draft queue consumed by `tools/seo/build_articles.py` in the main codebase. Each Markdown file carries YAML front matter (title, description, slug, date, cluster, target page, internal links, sources, status) followed by the article body; the build script turns drafts marked `status: draft` into published pages and updates the sitemap once they are reviewed.
