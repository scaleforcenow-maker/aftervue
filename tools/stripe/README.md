# AfterVue Stripe catalog provisioning

Idempotent tool that makes a Stripe account's Products, Prices and Coupons match a
catalog JSON. Run it as often as you like: it creates what is missing, fixes drift,
and never deletes anything.

- `provision.js` - CLI
- `lib/catalog.js` - schema validation (amounts are integer cents)
- `lib/sync.js` - plan/apply reconciliation against Stripe
- `catalog.sample.json` - the full SKU/key layout with **fake** amounts
- `test/` - `node:test` suite with an in-memory Stripe mock (no network)

> **The real catalog is never committed.** This repository is public and AfterVue
> does not publish pricing. `tools/stripe/catalog.json` is gitignored; keep the real
> file outside the repo (for example `~/aftervue-private/stripe/catalog.json`) and
> pass it with `--catalog`. Only `catalog.sample.json`, with placeholder amounts
> like `12345`, lives in git.

## Running in test mode

Requirements: Node 20+, `npm install` in this directory (the only runtime dependency
is the official `stripe` package).

1. In the Stripe Dashboard (**test mode**), create a **restricted key** with write
   access to *Products*, *Prices* (part of Products) and *Coupons*. Nothing else.
   In a Claude Code cloud session, add it as a network secret for `api.stripe.com`
   and expose it as `STRIPE_SECRET_KEY`.
2. Preview:

   ```bash
   cd tools/stripe
   npm install
   STRIPE_SECRET_KEY=rk_test_... node provision.js --catalog ~/aftervue-private/stripe/catalog.json --mode test --dry-run
   ```

3. Apply:

   ```bash
   STRIPE_SECRET_KEY=rk_test_... node provision.js --catalog ~/aftervue-private/stripe/catalog.json --mode test
   ```

4. Run it again. The second run must print only `NOOP` rows and `Nothing to do.`

The `--mode` flag must match the key's prefix (`sk_test_`/`rk_test_` for `test`,
`sk_live_`/`rk_live_` for `live`); a mismatch is refused before any request is sent.

### Live mode

Live mode is refused unless **both** `--mode live` is passed **and** the environment
variable `STRIPE_ALLOW_LIVE=1` is set:

```bash
STRIPE_ALLOW_LIVE=1 STRIPE_SECRET_KEY=rk_live_... node provision.js --catalog ... --mode live --dry-run
STRIPE_ALLOW_LIVE=1 STRIPE_SECRET_KEY=rk_live_... node provision.js --catalog ... --mode live
```

Always dry-run live first and read every `REPLACE` row.

### Flags

| Flag | Meaning |
| --- | --- |
| `--catalog <path>` | Catalog JSON. Defaults to `./catalog.json` next to the script (gitignored). |
| `--mode test\|live` | Required. Which Stripe mode the key must belong to. |
| `--dry-run` | Compute and print the plan; write nothing. With a key, only read calls are made (`products.list`, `prices.list`, `coupons.retrieve`). With no `STRIPE_SECRET_KEY` the `stripe` package is not even loaded: the plan is computed against an empty account with zero API calls, which is handy for reviewing a catalog edit offline. |
| `--prune-archived` | Additionally **archive** (set `active=false`, never delete) managed Products and Prices that are no longer in the catalog. Without it, stale objects are left untouched and not reported. |

Exit codes: `0` success, `1` Stripe API error, `2` usage/catalog/sync error, `3`
applied but with warnings (see coupons below).

## What the dry run prints

One row per managed object, then a summary:

```
DRY RUN - no changes will be made  (test mode, key rk_test_...)
currency=usd tax_behavior=exclusive products=11 prices=54 coupons=1

  CREATE   product  app                 "Aftervue (App)" tax_code=txcd_10103001
  NOOP     product  ai_marketing        up to date
  UPDATE   product  video               update name, tax_code
  CREATE   price    app_monthly         monthly recurring/month $123.45 acct=4000
  REPLACE  price    ads_monthly         amount $123.45 -> $200.00 (archive price_1Abc, create replacement, transfer lookup_key)
  UPDATE   price    video_monthly       update nickname, metadata
  ARCHIVE  price    app_prepaid_6mo     not in catalog; set active=false        <- only with --prune-archived
  NOOP     coupon   trial_conversion_5  up to date
  WARN     coupon   trial_conversion_5  exists with different immutable fields (...)

Summary: create:product=1  noop:product=9  update:product=1  create:price=1 ...
```

| Row | What it means |
| --- | --- |
| `CREATE` | Object does not exist; will be created (with an idempotency key, so a crashed run can be re-run safely). |
| `UPDATE` | Exists; mutable fields differ (name, description, tax_code, nickname, metadata, or it was archived and will be reactivated). |
| `REPLACE` | A Price's **immutable** field differs (amount, currency, one-time vs recurring, interval, tax_behavior, or it hangs off a different Product than the catalog one). The tool creates a new Price with `transfer_lookup_key: true` so the `lookup_key` moves to it atomically, then archives the old Price. Existing subscriptions keep the old Price. If the run dies between those two calls, the old Price stays active without a `lookup_key`; the next run with `--prune-archived` archives it. |
| `ARCHIVE` | `--prune-archived` only: a managed object left the catalog and will be set inactive. |
| `WARN` | A Coupon exists under the catalog id with different `percent_off`/`duration`. Coupons are immutable and this tool never deletes, so fix it in the Dashboard or pick a new id. |
| `NOOP` | Already matches. |

How objects are matched: Products by `metadata.sku` (two active Products with the
same sku is an error, not a guess), Prices by `lookup_key` via
`prices.list({ lookup_keys })`, Coupons by id. Products are listed in full and
filtered client-side rather than via `products.search`, whose results lag writes.

## Catalog format

See `catalog.sample.json`. The shape:

```jsonc
{
  "version": 1,
  "currency": "usd",
  "tax_behavior": "exclusive",            // or "inclusive"; applied to every Price
  "tax_codes": { "saas": "txcd_10103001", "services": "txcd_20030000" },
  "income_accounts": { "4000": "App Subscription Revenue", ... },
  "coupons": [ { "id": "trial_conversion_5", "name": "...", "percent_off": 5, "duration": "once" } ],
  "products": [
    {
      "sku": "ads",                        // snake_case; every lookup_key must start with "ads_"
      "name": "Paid Ads Management",
      "description": "...",                // optional
      "notes": "...",                      // optional, ignored by the tool
      "tax_code": "services",              // alias from tax_codes, or a literal txcd_ code
      "income_account": "4030",            // default for this product's prices
      "prices": [
        { "lookup_key": "ads_monthly",       "plan_shape": "monthly",      "amount": 12345 },
        { "lookup_key": "ads_prepaid_6mo",   "plan_shape": "prepaid",      "term_months": 6,  "amount": 67890 },
        { "lookup_key": "ads_prepaid_12mo",  "plan_shape": "prepaid",      "term_months": 12, "amount": 123450 },
        { "lookup_key": "ads_prepaid_24mo",  "plan_shape": "prepaid",      "term_months": 24, "amount": 234560 },
        { "lookup_key": "ads_setup_full",    "plan_shape": "setup",        "amount": 11111, "income_account": "4090" },
        { "lookup_key": "ads_setup_6mo",     "plan_shape": "setup",        "term_months": 6, "amount": 5555, "income_account": "4090" },
        { "lookup_key": "ads_usage_anchor",  "plan_shape": "usage_anchor", "amount": 0, "income_account": "4031" }
      ]
    }
  ]
}
```

Rules enforced by `lib/catalog.js` (all problems are reported at once, with paths
like `products[4].prices[1].amount`):

- `amount` is an integer number of cents. `12345` is $123.45; `123.45` is rejected.
- `lookup_key` is unique across the whole catalog and prefixed with its `sku`.
- `plan_shape` is one of `monthly | prepaid | setup | build | usage_anchor`.
  `monthly` and `usage_anchor` become recurring monthly Prices; the rest are one-time.
- `prepaid` requires `term_months` of 6, 12 or 24. `monthly`/`usage_anchor` take none.
  `term_months` may also be a string like `"12_24"` (the website build fee that
  applies to either term).
- `usage_anchor` amounts must be `0`; every other amount must be `> 0`.
- `income_account` (per product, optionally per price) must be a key of
  `income_accounts`. `tax_code` must resolve to a `txcd_` code.

### Contract shapes

Only two contract shapes exist, and the catalog models exactly those:

| Shape | Stripe object | lookup_key |
| --- | --- | --- |
| Month-to-month | one recurring monthly Price per SKU | `<sku>_monthly` |
| Prepaid term (6/12/24 months), charged once at signing | one one-time Price per term for the full-term total | `<sku>_prepaid_6mo`, `_12mo`, `_24mo` |
| Setup fee (SKUs that have one) | one-time; full price month-to-month, discounted on a 6-month term, waived on 12/24 | `<sku>_setup_full`, `<sku>_setup_6mo` |
| Website build (one-time only) | one-time; full, or discounted with a 12/24-month hosting term | `website_build_full`, `website_build_12_24` |
| Usage lines (never prepaid) | $0 recurring monthly anchor + Invoice Items | `ads_usage_anchor`, `whitelabel_usage_anchor` |

There is deliberately **no** "term contract billed monthly" shape.

## Usage lines: the Invoice Item pattern

Ad spend passthrough, the 10% overage above the managed-spend threshold, and the
White-Label per-active-client fee are billed **monthly in arrears** and are never
prepaid. They are *not* metered Prices. Instead:

1. The customer's subscription includes the `$0` anchor Price
   (`ads_usage_anchor` or `whitelabel_usage_anchor`) as a subscription item. This
   keeps a monthly invoice cycle alive even for customers who prepaid their term,
   and gives the usage charges an invoice to land on.
2. Before each cycle's invoice finalizes (listen for `invoice.upcoming`, or run a
   job shortly before the billing anchor), compute the previous month's usage and add
   one Invoice Item per line to the **next** invoice:

   ```js
   import Stripe from 'stripe';
   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

   // Ad spend passthrough for the month that just closed
   await stripe.invoiceItems.create({
     customer: customerId,
     subscription: subscriptionId,        // attaches to that subscription's next invoice
     currency: 'usd',
     amount: adSpendCents,                // integer cents, in arrears
     description: 'Ad spend passthrough - September 2026',
     tax_code: 'txcd_20030000',           // Stripe Tax: services
     metadata: { sku: 'ads', plan_shape: 'usage', income_account: '4031', period: '2026-09' },
   }, { idempotencyKey: `ads-spend:${subscriptionId}:2026-09` });

   // 10% overage above the managed-spend threshold (only when exceeded)
   if (adSpendCents > thresholdCents) {
     await stripe.invoiceItems.create({
       customer: customerId,
       subscription: subscriptionId,
       currency: 'usd',
       amount: Math.round((adSpendCents - thresholdCents) * 0.10),
       description: 'Managed-spend overage (10%) - September 2026',
       tax_code: 'txcd_20030000',
       metadata: { sku: 'ads', plan_shape: 'usage', income_account: '4030', period: '2026-09' },
     }, { idempotencyKey: `ads-overage:${subscriptionId}:2026-09` });
   }

   // White-Label per-active-client fee
   await stripe.invoiceItems.create({
     customer: partnerCustomerId,
     subscription: partnerSubscriptionId,
     currency: 'usd',
     quantity: activeClients,
     unit_amount: perClientCents,
     description: `Active clients (${activeClients}) - September 2026`,
     tax_code: 'txcd_20030000',
     metadata: { sku: 'whitelabel', plan_shape: 'usage', income_account: '4080', period: '2026-09' },
   }, { idempotencyKey: `wl-clients:${partnerSubscriptionId}:2026-09` });
   ```

3. Use an idempotency key per `(line, subscription, period)` so a retried job never
   double-bills. Put `income_account` and `period` in metadata so the export to the
   ledger needs no lookup.

Do not switch the anchors to metered billing; the anchor exists only so the invoice
exists.

## Metadata and the chart of accounts

Every Product and Price carries:

| Key | Values | Notes |
| --- | --- | --- |
| `sku` | `app`, `ai_marketing`, ... | Primary match key for Products. |
| `plan_shape` | `monthly`, `prepaid`, `setup`, `build`, `usage_anchor` | On Products: comma-joined list of the shapes its prices use. |
| `term_months` | `6`, `12`, `24`, `12_24` | Only on prices where a term applies. |
| `income_account` | `4000` ... `4090` | Chart-of-accounts id (below). |
| `managed_by` | `aftervue-stripe-catalog` | Marks objects this tool owns (used by `--prune-archived`). |

Chart of accounts in the sample (the catalog's `income_accounts` block is the source
of truth; the tool only checks that every reference resolves):

| Account | Name | Lands on |
| --- | --- | --- |
| 4000 | App Subscription Revenue | `app_*`, `full_package_*` (see open questions) |
| 4010 | AI Marketing Team | `ai_marketing_*` |
| 4020 | Website Build Fees | `website_build_*` |
| 4021 | Website Hosting | `website_hosting_*` |
| 4030 | Paid Ads Mgmt | `ads_monthly`, `ads_prepaid_*`, overage Invoice Items |
| 4031 | Ad Spend Passthrough | `ads_usage_anchor`, passthrough Invoice Items |
| 4040 | Video | `video_*` |
| 4050 | Local SEO | `local_seo_*` |
| 4060 | Analytics | `analytics_*` |
| 4070 | Multi-Location | `multi_location_*` |
| 4080 | White-Label | `whitelabel_*`, per-client Invoice Items |
| 4090 | Setup Fees | every `*_setup_*` price |

To post revenue, group Stripe invoice line items by `price.metadata.income_account`
(or `invoice_item.metadata.income_account` for usage lines). Because a prepaid term
is one one-time Price, recognize it over `metadata.term_months` months in the ledger.

## Tax

Every Product carries a Stripe Tax `tax_code`; every Price carries `tax_behavior`
(`exclusive` by default). The codes live in the catalog's `tax_codes` block, not in
the code, so they can be changed without a release:

| Alias | Code | Stripe name | Used for |
| --- | --- | --- | --- |
| `saas` | `txcd_10103001` | Software as a Service (SaaS) - Business Use | Aftervue (App), Multi-Location, Full Package |
| `services` | `txcd_20030000` | General - Services | all services lines, setup and build fees |

Verification status (2026-10-09): `docs.stripe.com` is not reachable from the
cloud sessions that wrote and reviewed this tool, so neither code was read from
Stripe's page directly. `txcd_10103001` = "Software as a service (SaaS) - business
use" is confirmed by search results quoting `docs.stripe.com/tax/tax-codes` and
`docs.stripe.com/tax/ai`. `txcd_20030000` = "General - Services" is confirmed only
by third-party integrations that mirror Stripe's list; Stripe's own page names the
category but the search excerpt truncated the id. **Before the first test-mode
run, confirm both ids with the API, which needs no special permission:**

```bash
curl -s https://api.stripe.com/v1/tax_codes/txcd_10103001 -u "$STRIPE_SECRET_KEY:"
curl -s https://api.stripe.com/v1/tax_codes/txcd_20030000 -u "$STRIPE_SECRET_KEY:"
```

If Stripe has renamed or split a code, change the catalog, not the tool. Enabling
Stripe Tax itself, setting the origin address, and registrations are Dashboard
steps outside this tool.

## Tests

```bash
cd tools/stripe
npm test
```

Covers: creation on an empty account, no-op on the second run, partial-run
completion, amount change -> archive + replacement with `transfer_lookup_key`, a
Product rename (in place; default nicknames follow; nothing replaced), a
`lookup_key` found on a foreign Product (replaced onto the catalog Product in one
run), in-place metadata updates, reactivation, `--prune-archived`, dry run making
only read calls, `prices.list({ lookup_keys })` chunked by 10 with `has_more`
paging inside a chunk, currency from the catalog (`usd`, uppercase normalized, a
change is a REPLACE), the full metadata key set on every Product and Price,
idempotency keys under Stripe's 255-char cap, the CLI run from a path containing
a space, the live mode guard, key/mode mismatch, and schema rejections
(non-integer amount, duplicate lookup_key, duplicate sku, bad tax code, bad
account, missing term, non-zero anchor). No network: the Stripe client is
`test/mock-stripe.js`.
