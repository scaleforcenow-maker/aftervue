## Summary

<!-- One or two sentences: what this PR does and why. Link the session plan row
     or issue if there is one. -->

## Changes

<!-- Bullet list of the meaningful changes, grouped by directory or stack. -->

-

## Test evidence

<!-- Paste the commands you ran and their results. Include the CI run link once
     it exists. "Ran the tests" without output does not count. -->

```
```

- [ ] CI is green on the latest commit (link: )

## Brand / compliance checklist

<!-- Tick what you checked. If an item does not apply, say "n/a" and why. -->

- [ ] No practice, location, or patient counts
- [ ] No outcome promises; previews described as illustrations with the disclaimer
- [ ] Photos are not stored, logged, or sent to error reporting
- [ ] AfterVue does not book consults in any copy or flow added here
- [ ] No beauty scores or numeric judgments of a face
- [ ] AI marketing team described as "managed and monitored by a dedicated human"
- [ ] People referred to by role alias only; no personal names or phone numbers
- [ ] No pricing in copy; no exclamation marks; no brand-name drugs in `_seo/drafts/`
- [ ] `python3 scripts/brand_check.py` passes (or allowlist change explained below)

## Secrets check

- [ ] `scripts/secret_scan.sh` passes on this branch
- [ ] No `.env*`, keys, tokens, service-account JSON, or `tools/stripe/catalog.json` added
- [ ] New config uses placeholders and documents where the real value lives
- [ ] Nothing in this PR needs a key rotation. If it does, list the key here:

## Needs the founder

<!-- Anything a cloud session could not do: a login, a payment, a DNS change,
     an Xcode build. Leave empty if nothing. -->
