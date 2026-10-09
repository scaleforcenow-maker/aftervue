# @aftervue/lead-emails

Transactional email templates for the AfterVue lead-management service
(`aftervue-leads`, Node/Express on Cloud Run, Postmark). Zero runtime
dependencies, Node 18.8 or later, ESM.

The package is self-contained so `aftervue-leads` can import it as a local
workspace package once the service code is merged into this repository:

```js
import { render } from '@aftervue/lead-emails';
import { createPostmarkSender } from '@aftervue/lead-emails/postmark';

const sender = createPostmarkSender({
  serverToken: process.env.POSTMARK_SERVER_TOKEN,
  messageStream: 'outbound',                 // any stream configured in Postmark
  dryRun: process.env.EMAIL_DRY_RUN === '1', // writes .eml files to out/ instead of sending
  outDir: 'out'
});

const email = render('new-lead', {
  practiceName: tenant.displayName,
  leadFirstName: lead.firstName,
  source: 'widget',                          // widget | ipad | website
  receivedAt: lead.createdAt.toISOString(),
  timeZone: tenant.timeZone,
  assigneeFirstName: assignee?.firstName,
  inboxUrl: `${APP_URL}/inbox/leads/${lead.id}`,
  manageNotificationsUrl: `${APP_URL}/settings/notifications`
}, { utm: tenant.settings.emailUtm === true });

await sender.send(email, { from: 'hello@getaftervue.com', to: recipients });
```

## Templates

| # | Name | To | Carries |
| --- | --- | --- | --- |
| 1 | `new-lead` | practice (owner and front desk) | lead first name, source, received time, inbox link |
| 2 | `nudge-24h` | assignee | lead first name, hours waiting, inbox link |
| 3 | `owner-cc-72h` | owner | lead first name, assignee first name, hours waiting, inbox link |
| 4 | `weekly-digest` | owner | counts by status, response-time summary, up to five first names of untouched leads |
| 5 | `magic-link` | anyone signing in | signed sign-in link, expiry |
| 6 | `front-desk-invite` | invited team member | inviter name, practice, signed accept link, expiry |
| 7 | `retention-purge` | owner | count of deleted records, cut-off date, retention window |
| 8 | `export-ready` | requester (BAA on file) | row count, date range, signed download link, expiry |

Every template has a plain-text part, a preheader, a subject under 60
characters, a footer with the support alias, a "why you received this" line
and a manage-notifications link.

### Privacy rules, enforced in code

Templates 1 to 4 carry lead information and have a **PII guard**:

- the schema only declares first-name fields, never phone, email, treatment
  interests or photos;
- any field whose name contains `phone`, `email`, `e-mail`, `photo` or
  `treatment` is rejected at any depth, even if a future schema change were
  to declare it;
- any plain string value that looks like an email address or a phone number
  (eight or more digits with optional separators) is rejected.

All templates reject unknown fields at any depth, enforce types, enum values,
maximum lengths, single-line strings, valid ISO-8601 dates, valid IANA time
zones and `https` URLs. Failed validation throws `TemplateDataError` with
`code` (`unknown`, `required`, `type`, `max`, `min`, `enum`, `url`, `date`,
`timezone`, `newline`, `pii`) and `field` (dotted path).

### Render output

```js
render(name, data, options) // -> { template, subject, preheader, html, text }
```

Options:

| Option | Default | Meaning |
| --- | --- | --- |
| `utm` | `false` | When `true`, links get `utm_source=aftervue-leads`, `utm_medium=email`, `utm_campaign=<template>`. Signed links (`magicLinkUrl`, `acceptUrl`, `downloadUrl`) are never decorated because an extra query parameter would break the signature. |
| `logoSrc` | `cid:aftervue-mark` | Reference for the AfterVue mark. Pass a hosted `https` URL to skip the inline attachment. The mark is never embedded as base64. |
| `supportAlias` | `support@getaftervue.com` | Footer address. |

`listTemplates()` returns `{ name, description, guardPii }` for each template,
and `TEMPLATES[name].schema` exposes the schema for documentation or form
generation.

## Why hand-written table HTML instead of MJML

- **Zero dependencies.** MJML pulls in about 60 packages. The service already
  runs under a HIPAA posture where every dependency is a review item, and
  this package needs none.
- **One layout, eight messages.** All eight emails are a single column: logo,
  card, heading, paragraphs, a key-value table, one button, footer. MJML earns
  its keep on multi-column marketing layouts; here it would compile to the same
  600 px table we wrote by hand.
- **Text part for free.** Templates produce a small content model (heading,
  blocks, "why" line) and `src/layout.js` renders both the HTML and the plain
  text from it, so the two parts cannot drift. MJML has no text-part story.
- **No build step to forget.** With MJML the compiled HTML would have to be
  committed and kept in sync. Here the source is the artifact.

The cost is that layout changes are edits to table markup in `src/layout.js`.
The client checklist in `docs/email-client-checklist.md` lists what to re-test
after such a change.

## Brand

Plum `#1B0F2E`, gold `#C9A24B`, porcelain `#F8F4EF`, white cards.
Cormorant Garamond for headings (Georgia fallback), Inter for body (system
sans fallback), loaded from Google Fonts in clients that allow it and
excluded for Outlook with a conditional comment so it does not fall back to
Times. Gold is used for rules, borders, the button outline and the eyebrow
colour only; gold text on white does not meet contrast, so body links are
plum.

Dark mode: the `<head>` carries `color-scheme`/`supported-color-schemes` and a
`prefers-color-scheme: dark` block that swaps page, card, text and rule
colours and turns the button gold with plum text. Outlook.com's `[data-ogsc]`
selectors are covered too. Gmail's partial inversion is left alone: plum on
white and white on plum invert to readable pairs.

Voice: no exclamation marks, no marketing copy, no beauty-score or outcome
language. `render()` throws if a subject or preheader contains `!`, and the
tests check the visible HTML text and the text part. The raw HTML does
contain `!` in the DOCTYPE, in Outlook conditional comments and in
`!important` inside the dark-mode stylesheet; none of it is visible.

## Postmark adapter

`postmark.js` has no dependency on the Postmark SDK.

- `toPostmarkMessage(rendered, envelope)` maps render output to the
  `POST /email` body: `From`, `To`, `Cc`, `Bcc`, `ReplyTo`, `Subject`,
  `HtmlBody`, `TextBody`, `MessageStream`, `Tag` (defaults to the template
  name), `Metadata`, `Headers`, and `Attachments` when `inlineLogo` is given.
  No `TemplateId` or `TemplateModel`. Open and link tracking are off, because
  tracking pixels and rewritten links are not appropriate for PHI-adjacent
  mail.
- `createPostmarkSender({ serverToken, messageStream, dryRun, outDir, fetch })`
  returns `{ send(rendered, envelope) }`. In dry-run mode it writes an RFC 5322
  `.eml` (multipart/alternative, or multipart/related with the logo attached)
  to `outDir` and never touches the network. Otherwise it posts with `fetch`
  and throws `PostmarkError` with `status` and `errorCode` on failure.
- The logo: templates reference `cid:aftervue-mark`. Pass
  `inlineLogo: { content: <base64 of the PNG>, contentType: 'image/png' }` in
  the envelope to attach it (read the file at send time), or render with
  `logoSrc` set to a hosted URL.

## Previews

```
npm run previews            # renders fixtures to out/ (gitignored)
npm run previews -- --utm   # same, with UTM parameters on links
npm run previews:commit     # refreshes the committed set in previews/
```

Open `out/index.html` or `previews/index.html` in a browser. Each template
shows its subject and preheader with character counts, the HTML in an iframe
and the text part beside it. The previews use a placeholder SVG wordmark from
`assets/`; production supplies the real mark.

## Tests

```
npm test
```

`node:test`, no test framework. Covers: every template renders with its
fixture; strict validation (unknown, nested unknown, missing, wrong type, bad
URL, bad date, bad time zone, over-long, multi-line); PII rejection by key and
by value on templates 1 to 4; no `!` in subject, preheader, visible HTML or
text; subject length with maximum-length inputs; text part present and
carrying every link; UTM only when the flag is set and never on signed links;
HTML escaping; CID and hosted logo; Postmark message shape, configurable
`MessageStream`, dry-run `.eml` output, send through a mocked `fetch`, error
surfacing.

## Fixtures

`fixtures/index.js` uses placeholder names (`A. Sample`, `B. Sample`), the
practice `Sample Medspa`, and no phone numbers, email addresses, treatment
interests or photos. The only addresses anywhere in the package are the role
aliases `hello@getaftervue.com` and `support@getaftervue.com`.

## Layout of the package

```
src/index.js            render(), listTemplates(), TEMPLATES
src/validate.js         strict schema validation and the PII guard
src/layout.js           HTML and text rendering from the content model
src/links.js            UTM decoration
src/util.js             date and number formatting, HTML escaping
src/templates/*.js      one file per template: schema + build(data) -> content
postmark.js             Postmark adapter and dry-run .eml writer
fixtures/index.js       fixture data for tests and previews
scripts/build-previews.js
previews/               committed renders of every template
docs/email-client-checklist.md
```
