# Email client checklist

A Litmus-style matrix for the eight `@aftervue/lead-emails` templates. The
"Automated" column is what `npm test` verifies on every run. The client
columns are to be filled in by sending the dry-run `.eml` files (or the
`previews/*.html` files) through Litmus or Email on Acid, or by forwarding
them to real accounts. Until that run happens the client columns are
**unverified**; nothing here claims a client was tested that was not.

How to produce test messages:

```
EMAIL_DRY_RUN=1 node -e "
  import('@aftervue/lead-emails').then(async ({ render }) => {
    const { createPostmarkSender } = await import('@aftervue/lead-emails/postmark');
    const { fixtures } = await import('@aftervue/lead-emails/fixtures');
    const s = createPostmarkSender({ dryRun: true, outDir: 'out' });
    for (const name of Object.keys(fixtures)) await s.send(render(name, fixtures[name]), { from: 'hello@getaftervue.com', to: 'support@getaftervue.com' });
  })"
```

Each `.eml` in `out/` can be dragged into Apple Mail, imported by Thunderbird,
or uploaded to a testing service.

## Structural checks (automated)

| Check | How it is enforced |
| --- | --- |
| 600 px maximum width, centred | `width="600"` + `max-width:600px` on the container, `.av-container { width:100% }` under 620 px |
| All CSS inlined on elements | Styles are string-built per element; `<style>` holds only resets, the mobile query and the dark-mode query |
| Plain-text part present | `renderText()` from the same content model; test asserts every HTML link appears in the text |
| Preheader present | Hidden `div` with zero-width padding; test asserts it appears in the HTML |
| Subject under 60 chars | `SUBJECT_MAX = 59`, tested with maximum-length names |
| No exclamation marks | Validation rejects `!` in any string field; `render()` throws if the text part carries one; tests check subject, preheader, visible HTML and text |
| No base64 images | Test asserts no `src="data:` |
| Logo by CID or hosted URL | `cid:aftervue-mark` default, `logoSrc` option tested |
| Dark-mode declarations | `color-scheme` and `supported-color-schemes` metas, `prefers-color-scheme` block, `[data-ogsc]` selectors |
| No PII beyond first names (templates 1 to 4) | Schema, key guard (any depth, any casing), value guard on strings and on URL query/path/fragment; output scanned for phone and email shapes |
| Links UTM-tagged only when flagged | Tested on and off, signed links excluded |
| `role="presentation"` on layout tables | Every layout `<table>` |
| Alt text on the only image | `alt="AfterVue"` so blocked images still show the brand; the logo link has an explicit colour plus a dark-mode override so the alt text is readable on the dark page |
| Outlook for Windows fonts | MSO conditional `<style>` with `!important` forces Arial for body and Georgia for the heading, since inline font stacks would otherwise fall to Times New Roman |
| Outlook.com dark mode | `[data-ogsc]` for text and `[data-ogsb]` for backgrounds |
| Dry-run `.eml` is RFC 5322 clean | Quoted-printable bodies, CRLF only, no line over 998 characters, 7-bit; tested for every template |
| `lang="en"` on `<html>` | Set in the layout |

## Rendering checks (manual, per client)

Legend: ☐ not yet checked, ☑ pass, ◐ pass with a known quirk (note it).

Rendered in a Chromium headless browser at 760 px and 390 px, in light and
dark schemes, during development: layout, mobile stacking and the dark-mode
palette were confirmed there. That is not an email client and is noted here
only so the next person knows what has and has not been looked at.

| Client | Fonts fall back cleanly | 600 px card | Mobile stacking | Dark mode readable | Button renders | Preheader shows | Images off: alt text | Text part readable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Apple Mail (macOS) | ☐ | ☐ | n/a | ☐ | ☐ | ☐ | ☐ | ☐ |
| Mail (iOS) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Gmail (web) | ☐ | ☐ | n/a | ☐ | ☐ | ☐ | ☐ | ☐ |
| Gmail (iOS app) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Gmail (Android app) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Outlook 365 (Windows, Word engine) | ☐ | ☐ | n/a | ☐ | ☐ | ☐ | ☐ | ☐ |
| Outlook (macOS) | ☐ | ☐ | n/a | ☐ | ☐ | ☐ | ☐ | ☐ |
| Outlook.com (web) | ☐ | ☐ | n/a | ☐ | ☐ | ☐ | ☐ | ☐ |
| Yahoo Mail (web) | ☐ | ☐ | n/a | ☐ | ☐ | ☐ | ☐ | ☐ |
| Samsung Mail | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

## Known behaviour to expect

- **Google Fonts.** Cormorant Garamond and Inter load in Apple Mail, iOS Mail,
  Outlook for Mac/iOS, Samsung Mail and Thunderbird. Gmail, Outlook.com and
  Yahoo strip the `<link>`, so headings fall back to Georgia and body to the
  system sans. The MSO conditional forces Georgia/Arial in Outlook for Windows
  so it does not substitute Times New Roman.
- **Dark mode.** Apple Mail and iOS Mail honour `prefers-color-scheme` and will
  show the dark palette (plum page, darker card, porcelain text, gold button).
  Outlook.com uses `[data-ogsc]`. Gmail ignores the media query and partially
  inverts: expect the porcelain page to go dark grey and plum text to go light;
  both remain readable. The real AfterVue mark should be a PNG that reads on
  both light and dark backgrounds, or a hosted URL to a version with a light
  plate; the preview SVG uses dark gold for that reason.
- **Outlook for Windows.** Border-radius on the card and button is ignored
  (square corners). The MSO ghost table keeps the 600 px width. The
  `border-top` gold rule renders.
- **Preheader.** Gmail and Apple Mail show it in the list view. Outlook
  desktop shows the first line of body text instead; the hidden div is
  harmless there.
- **Images off.** The only image is the mark, with `alt="AfterVue"`. Nothing
  in the body depends on an image.
- **Link wrapping.** The "copy this link" URL uses `word-break:break-all` on the
  anchor only, so the label wraps on words and the URL wraps on characters.
- **Signed links.** Magic link, invitation and export URLs are never UTM
  decorated. Postmark link tracking is off (`TrackLinks: 'None'`) so those URLs
  are also not rewritten through a click-tracking domain.

## Re-test after

Any edit to `src/layout.js` (the shared shell), a change to the colour tokens
in `BRAND`, or a new block type. Template copy changes only need `npm test`.
