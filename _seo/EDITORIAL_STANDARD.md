# AfterVue editorial standard for articles

Every article in `_seo/drafts/` must pass all of this before it is merged or published.
Reviewers fix the article, they do not just report.

## 1. Useful, not filler

- The searcher's question is answered in the first 120 words. No warm-up paragraph.
- The article contains at least one concrete, reusable artifact: a checklist, a script,
  a decision table, a question list for a vendor call, or a worked example. A reader
  should be able to act on it the same day without buying anything.
- Every section says something a competent clinic owner does not already know, or
  organizes what they know into a decision. Delete sections that only define terms.
- Specific over generic: name the tool, the setting, the regulation, the step. No
  "leverage", "unlock", "in today's fast-paced world", "it's important to note".
- No duplication with the eight live articles: no beauty scores (H); what patients
  search before they call (C); lip filler simulator searches (B); HIPAA photo checklist
  (I); website not converting (F); generic simulator apps (B/C); predicting vs.
  documenting tools (G); agency retainer costs (D/E). Link to them instead where
  relevant, using `/resources/` paths.

## 2. House rules (hard failures)

- No exclamation marks.
- No practice or location counts, stated or implied.
- No clinical outcome promises. Use "possible", "likely", "illustrative". Never
  "you will look".
- No AfterVue pricing. No competitor pricing.
- Every preview is an illustrative AI preview, labelled as such. Photos are never
  stored by AfterVue. AfterVue does not book consults; it hands off to the practice's
  own booking page. No beauty scores.
- The AI marketing team is "managed and monitored by a dedicated human" whenever it
  is mentioned.
- No personal names. Role aliases only: hello@getaftervue.com, privacy@getaftervue.com.
- Competitors named factually, without disparagement.
- "Botox" appears at most once, in quotation marks, only when quoting a search phrase,
  never in the title, description, headings, or keywords. Use "wrinkle relaxer".
- Medical or legal topics carry a one-sentence "not medical/legal advice" line.

## 3. Facts

- Every statistic and every claim about a named company has a source URL in the body
  and in the front matter `sources` list, verified by fetching it. If a URL cannot be
  fetched from the sandbox, keep it only when the reviewer is confident it exists and
  mark it "unverified from sandbox" in the PR, not in the article.
- No invented or "approximately" statistics. Prefer no number to an unsourced one.

## 4. SEO mechanics

- `title`: 60 characters or fewer, primary keyword in the first half.
- `description`: 155 characters or fewer, contains a verb, no ellipsis.
- Primary keyword appears naturally in the first 100 words and in one H2.
- H2s carry secondary terms naturally. No H1 in the body (the title is the H1).
- 800 to 1,000 words unless the brief says otherwise.
- Internal links: the listed `target_page`, plus at least one live article under
  `/resources/` when relevant. Use relative paths.
- Closing CTA: "Book a live demo" (practice audience) or "See it on your own face"
  linking to `/app/` (patient audience).
- Front matter is valid YAML; `slug` equals the filename; `status` moves from
  `draft` to `reviewed` when the editorial pass is complete.

## 5. Writing

- Confident, warm, specific. Short paragraphs. Varied sentence length.
- US spelling. No em-dash chains. No rhetorical questions as headings.
- Reads well to a busy clinic owner on a phone.

## 6. Process

1. Writer opens a draft PR with the house-rule checklist ticked.
2. A separate review session edits the article against this standard, sets
   `status: reviewed`, pushes to the same branch, and leaves one PR comment.
3. The article is merged into the default branch only after step 2.
4. Publishing: `tools/seo/publish/` builds `/resources/<slug>/` pages and the sitemap
   entry; deployment follows `tools/seo/publish/README.md`.
