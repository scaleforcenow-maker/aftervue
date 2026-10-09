import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, allLookupKeys } from '../lib/catalog.js';
import { sync, planSync, applyPlan, MANAGED_BY, idempotencyKey } from '../lib/sync.js';
import { createMockStripe } from './mock-stripe.js';

const SAMPLE_PATH = new URL('../catalog.sample.json', import.meta.url);

async function loadSample() {
  return validateCatalog(JSON.parse(await readFile(SAMPLE_PATH, 'utf8')));
}

describe('sync against an empty account', () => {
  test('creates every product, price and coupon exactly once', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    const actions = await sync(stripe, catalog);

    const priceCount = allLookupKeys(catalog).length;
    assert.equal(stripe.store.products.size, catalog.products.length);
    assert.equal(stripe.store.prices.size, priceCount);
    assert.equal(stripe.store.coupons.size, 1);
    assert.equal(actions.filter((a) => a.op === 'create').length, catalog.products.length + priceCount + 1);
    assert.equal(actions.filter((a) => a.op !== 'create').length, 0);

    const creates = stripe.writes().filter((w) => w.method === 'prices.create');
    assert.equal(creates.length, priceCount);
    assert.ok(creates.every((w) => typeof w.args.opts?.idempotencyKey === 'string'), 'every create carries an idempotency key');
  });

  test('products carry tax_code and sku/income_account metadata', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    await sync(stripe, catalog);
    const products = [...stripe.store.products.values()];
    const app = products.find((p) => p.metadata.sku === 'app');
    assert.equal(app.tax_code, 'txcd_10103001');
    assert.equal(app.metadata.income_account, '4000');
    assert.equal(app.metadata.managed_by, MANAGED_BY);
    assert.equal(app.metadata.plan_shape, 'monthly,prepaid');
    const ads = products.find((p) => p.metadata.sku === 'ads');
    assert.equal(ads.tax_code, 'txcd_20030000');
    assert.equal(ads.metadata.plan_shape, 'monthly,prepaid,setup,usage_anchor');
    assert.ok(products.every((p) => /^txcd_\d{8}$/.test(p.tax_code)), 'every product has a tax code');
  });

  test('prices have the right shape, recurrence, lookup_key and metadata', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    await sync(stripe, catalog);
    const byKey = new Map([...stripe.store.prices.values()].map((p) => [p.lookup_key, p]));

    const monthly = byKey.get('app_monthly');
    assert.equal(monthly.type, 'recurring');
    assert.deepEqual(monthly.recurring, { interval: 'month', interval_count: 1, usage_type: 'licensed' });
    assert.equal(monthly.unit_amount, 12345);
    assert.equal(monthly.currency, 'usd');
    assert.equal(monthly.tax_behavior, 'exclusive');
    assert.deepEqual(monthly.metadata, { sku: 'app', plan_shape: 'monthly', income_account: '4000', managed_by: MANAGED_BY });

    const prepaid = byKey.get('app_prepaid_12mo');
    assert.equal(prepaid.type, 'one_time');
    assert.equal(prepaid.recurring, null);
    assert.equal(prepaid.metadata.term_months, '12');
    assert.equal(prepaid.metadata.plan_shape, 'prepaid');

    const setup = byKey.get('ads_setup_6mo');
    assert.equal(setup.type, 'one_time');
    assert.equal(setup.metadata.income_account, '4090', 'setup fees post to 4090');
    assert.equal(setup.metadata.term_months, '6');
    assert.equal(byKey.has('ads_setup_12mo'), false, 'no setup fee for 12 months (waived)');
    assert.equal(byKey.has('ads_setup_24mo'), false, 'no setup fee for 24 months (waived)');

    const build = byKey.get('website_build_12_24');
    assert.equal(build.type, 'one_time');
    assert.equal(build.metadata.plan_shape, 'build');
    assert.equal(build.metadata.term_months, '12_24');
    assert.equal(build.metadata.income_account, '4020');

    for (const key of ['ads_usage_anchor', 'whitelabel_usage_anchor']) {
      const anchor = byKey.get(key);
      assert.equal(anchor.type, 'recurring');
      assert.equal(anchor.unit_amount, 0);
      assert.equal(anchor.recurring.usage_type, 'licensed', 'anchors are plain licensed prices, not metered');
      assert.equal(anchor.metadata.plan_shape, 'usage_anchor');
    }
    assert.equal(byKey.get('ads_usage_anchor').metadata.income_account, '4031');

    // every price points at the product with the same sku
    for (const price of stripe.store.prices.values()) {
      const product = stripe.store.products.get(price.product);
      assert.equal(product.metadata.sku, price.metadata.sku);
    }
  });

  test('creates the trial_conversion_5 coupon as 5% off once', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    await sync(stripe, catalog);
    const coupon = stripe.store.coupons.get('trial_conversion_5');
    assert.equal(coupon.percent_off, 5);
    assert.equal(coupon.duration, 'once');
    assert.equal(coupon.duration_in_months, null);
  });

  test('handles pagination when the account has many objects', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe({ pageSize: 7 });
    await sync(stripe, catalog);
    stripe.resetCalls();
    const actions = await sync(stripe, catalog);
    assert.equal(stripe.writes().length, 0);
    assert.ok(actions.every((a) => a.op === 'noop'));
  });

  test('prices.list({ lookup_keys }) is chunked by 10 and each chunk is paginated to completion', async () => {
    const catalog = await loadSample();
    const keys = allLookupKeys(catalog);
    assert.ok(keys.length > 10, `sample must have more than 10 lookup keys (has ${keys.length})`);

    // page size 3 < chunk size 10 forces has_more inside a single lookup_keys chunk
    const stripe = createMockStripe({ pageSize: 3 });
    await sync(stripe, catalog);
    stripe.resetCalls();
    const actions = await planSync(stripe, catalog);

    const lookups = stripe.calls.filter((c) => c.method === 'prices.list' && c.args.lookup_keys);
    assert.ok(lookups.every((c) => c.args.lookup_keys.length <= 10), 'never more than 10 lookup_keys per request');
    const firstPages = lookups.filter((c) => !c.args.starting_after);
    assert.equal(firstPages.length, Math.ceil(keys.length / 10), 'one chunk per 10 keys');
    assert.deepEqual(firstPages.flatMap((c) => c.args.lookup_keys), keys, 'every catalog key is requested exactly once, in order');
    const continuations = lookups.filter((c) => c.args.starting_after);
    assert.ok(continuations.length >= firstPages.length, 'has_more pages inside a chunk are followed');
    for (const c of continuations) {
      assert.ok(firstPages.some((f) => JSON.stringify(f.args.lookup_keys) === JSON.stringify(c.args.lookup_keys)), 'continuation keeps the same lookup_keys filter');
    }
    assert.equal(actions.filter((a) => a.kind === 'price' && a.op !== 'noop').length, 0, 'every price was found despite paging');
    assert.equal(stripe.writes().length, 0);
  });

  test('currency is taken from the catalog, normalized to lowercase, and fixed to usd for the sample', async () => {
    const catalog = await loadSample();
    assert.equal(catalog.currency, 'usd');
    const stripe = createMockStripe();
    await sync(stripe, catalog);
    const creates = stripe.writes().filter((w) => w.method === 'prices.create');
    assert.equal(creates.length, allLookupKeys(catalog).length);
    assert.ok(creates.every((w) => w.args.params.currency === 'usd'), 'every price is created in usd');
    assert.ok([...stripe.store.prices.values()].every((p) => p.currency === 'usd'));

    // "USD" in the file is accepted and normalized, so the second run is still a no-op
    const upper = JSON.parse(await readFile(SAMPLE_PATH, 'utf8'));
    upper.currency = 'USD';
    stripe.resetCalls();
    const actions = await sync(stripe, validateCatalog(upper));
    assert.equal(stripe.writes().length, 0);
    assert.ok(actions.every((a) => a.op === 'noop'));

    // currency is immutable on a Price: a change is a REPLACE for every price, never an in-place update
    const eur = structuredClone(catalog);
    eur.currency = 'eur';
    const plan = await planSync(stripe, eur);
    const priceOps = plan.filter((a) => a.kind === 'price');
    assert.ok(priceOps.every((a) => a.op === 'replace'), 'currency change replaces every price');
    assert.match(priceOps[0].detail, /currency usd -> eur/);
    assert.ok(plan.filter((a) => a.kind === 'product').every((a) => a.op === 'noop'), 'products are untouched by a currency change');
  });

  test('every product and price carries the full metadata key set', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    await sync(stripe, catalog);
    const REQUIRED = ['sku', 'plan_shape', 'income_account', 'managed_by'];
    for (const p of stripe.store.products.values()) {
      for (const k of REQUIRED) assert.ok(typeof p.metadata[k] === 'string' && p.metadata[k].length > 0, `product ${p.name} missing metadata.${k}`);
      assert.equal(p.metadata.managed_by, MANAGED_BY);
      assert.match(p.metadata.income_account, /^\d{4}$/);
    }
    const termKeys = new Set(catalog.products.flatMap((p) => p.prices.filter((pr) => pr.term_months !== null).map((pr) => pr.lookup_key)));
    for (const pr of stripe.store.prices.values()) {
      for (const k of REQUIRED) assert.ok(typeof pr.metadata[k] === 'string' && pr.metadata[k].length > 0, `price ${pr.lookup_key} missing metadata.${k}`);
      assert.equal(pr.metadata.managed_by, MANAGED_BY);
      assert.equal(termKeys.has(pr.lookup_key), 'term_months' in pr.metadata, `price ${pr.lookup_key} term_months metadata presence`);
      // Stripe metadata limits: 40 chars per key, 500 per value
      for (const [k, v] of Object.entries(pr.metadata)) assert.ok(k.length <= 40 && v.length <= 500, `metadata ${k} within Stripe limits`);
    }
    for (const c of stripe.store.coupons.values()) assert.equal(c.metadata.managed_by, MANAGED_BY);
  });

  test('idempotency keys stay under the 255-char Stripe limit for the longest allowed lookup_key', () => {
    const longKey = 'x'.repeat(200);
    const params = { lookup_key: longKey, metadata: { sku: 'x' }, unit_amount: 1 };
    const k = idempotencyKey('price', longKey, 'replace', params);
    assert.ok(k.length <= 255, `idempotency key is ${k.length} chars`);
    assert.equal(k, idempotencyKey('price', longKey, 'replace', structuredClone(params)), 'deterministic across runs');
    assert.notEqual(k, idempotencyKey('price', longKey, 'replace', { ...params, unit_amount: 2 }), 'changes with params');
    assert.notEqual(k, idempotencyKey('price', longKey.slice(0, 199) + 'y', 'replace', params), 'full key is in the digest, not just the truncated prefix');
  });
});

describe('idempotency', () => {
  test('second run performs no writes and reports every object as noop', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    await sync(stripe, catalog);
    stripe.resetCalls();

    const actions = await sync(stripe, catalog);
    assert.equal(stripe.writes().length, 0, `unexpected writes: ${JSON.stringify(stripe.writes().map((w) => w.method))}`);
    assert.equal(actions.length, catalog.products.length + allLookupKeys(catalog).length + 1);
    assert.ok(actions.every((a) => a.op === 'noop'), actions.filter((a) => a.op !== 'noop').map((a) => `${a.op} ${a.kind} ${a.key}`).join(', '));
    assert.equal(stripe.store.prices.size, allLookupKeys(catalog).length);
  });

  test('dry run plans but writes nothing', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    const actions = await sync(stripe, catalog, { dryRun: true });
    assert.equal(stripe.writes().length, 0);
    assert.equal(stripe.store.products.size, 0);
    assert.ok(actions.length > 0 && actions.every((a) => a.op === 'create'));
    // with a key, a dry run is read-only: only list/retrieve calls, even with --prune-archived
    await sync(stripe, catalog, { dryRun: true, pruneArchived: true });
    assert.ok(stripe.calls.every((c) => /\.(list|retrieve)$/.test(c.method)), `non-read call in dry run: ${stripe.calls.map((c) => c.method).join(',')}`);
  });

  test('a partially provisioned account is completed, not duplicated', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    const plan = await planSync(stripe, catalog);
    // simulate a crash after the products and the first 5 prices
    const partial = plan.filter((a) => a.kind === 'product' || a.kind === 'coupon').concat(plan.filter((a) => a.kind === 'price').slice(0, 5));
    await applyPlan(stripe, partial);
    stripe.resetCalls();

    const actions = await sync(stripe, catalog);
    const created = actions.filter((a) => a.op === 'create');
    assert.equal(created.length, allLookupKeys(catalog).length - 5);
    assert.ok(created.every((a) => a.kind === 'price'));
    assert.equal(stripe.store.products.size, catalog.products.length);
    assert.equal(stripe.store.prices.size, allLookupKeys(catalog).length);
  });
});

describe('drift handling', () => {
  test('an amount change archives the old price and creates a replacement with transfer_lookup_key', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    await sync(stripe, catalog);
    const oldPrice = [...stripe.store.prices.values()].find((p) => p.lookup_key === 'app_monthly');
    stripe.resetCalls();

    const changed = structuredClone(catalog);
    changed.products.find((p) => p.sku === 'app').prices.find((p) => p.lookup_key === 'app_monthly').amount = 20000;
    const actions = await sync(stripe, changed);

    const replace = actions.filter((a) => a.op === 'replace');
    assert.equal(replace.length, 1);
    assert.equal(replace[0].key, 'app_monthly');
    assert.match(replace[0].detail, /amount \$123\.45 -> \$200\.00/);
    assert.ok(actions.filter((a) => a.op !== 'noop' && a.op !== 'replace').length === 0, 'nothing else changed');

    const writes = stripe.writes();
    assert.deepEqual(writes.map((w) => w.method), ['prices.create', 'prices.update']);
    assert.equal(writes[0].args.params.transfer_lookup_key, true);
    assert.equal(writes[0].args.params.unit_amount, 20000);
    assert.equal(writes[0].args.params.lookup_key, 'app_monthly');
    assert.deepEqual(writes[1].args, { id: oldPrice.id, params: { active: false } });

    const archived = stripe.store.prices.get(oldPrice.id);
    assert.equal(archived.active, false);
    assert.equal(archived.lookup_key, null, 'lookup_key moved off the archived price');
    const live = [...stripe.store.prices.values()].filter((p) => p.lookup_key === 'app_monthly');
    assert.equal(live.length, 1);
    assert.equal(live[0].unit_amount, 20000);
    assert.equal(live[0].active, true);
    assert.equal(stripe.store.prices.size, allLookupKeys(catalog).length + 1, 'nothing deleted');

    stripe.resetCalls();
    await sync(stripe, changed);
    assert.equal(stripe.writes().length, 0, 'third run is a no-op again');
  });

  test('a renamed Product is updated in place and its default price nicknames follow, with no replacement', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    await sync(stripe, catalog);
    const before = { products: stripe.store.products.size, prices: stripe.store.prices.size };
    const videoId = [...stripe.store.products.values()].find((p) => p.metadata.sku === 'video').id;
    stripe.resetCalls();

    const renamed = structuredClone(catalog);
    const video = renamed.products.find((p) => p.sku === 'video');
    video.name = 'Video Production';
    for (const pr of video.prices) pr.nickname = pr.nickname.replace('Video & Creative Production', 'Video Production');
    const actions = await sync(stripe, renamed);

    const productUpdates = actions.filter((a) => a.kind === 'product' && a.op === 'update');
    assert.deepEqual(productUpdates.map((a) => [a.key, a.params]), [['video', { name: 'Video Production' }]], 'only the name is sent');
    assert.equal(actions.filter((a) => a.op === 'create' || a.op === 'replace' || a.op === 'archive').length, 0, 'a rename never creates or archives anything');
    const priceUpdates = actions.filter((a) => a.kind === 'price' && a.op === 'update');
    assert.deepEqual(priceUpdates.map((a) => a.key).sort(), ['video_monthly', 'video_prepaid_12mo', 'video_prepaid_24mo', 'video_prepaid_6mo']);
    assert.ok(priceUpdates.every((a) => Object.keys(a.params).join() === 'nickname'), 'only nickname changes on the prices');
    assert.equal(stripe.store.products.get(videoId).name, 'Video Production', 'same Stripe Product id, new name');
    assert.equal(stripe.store.prices.size, before.prices);
    assert.equal(stripe.store.products.size, before.products);
    assert.equal([...stripe.store.prices.values()].find((p) => p.lookup_key === 'video_monthly').nickname, 'Video Production - monthly');

    stripe.resetCalls();
    const again = await sync(stripe, renamed);
    assert.equal(stripe.writes().length, 0);
    assert.ok(again.every((a) => a.op === 'noop'));
  });

  test('a price whose lookup_key exists on a foreign Product is replaced onto the new catalog Product in one run', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    const foreign = await stripe.products.create({ name: 'Hand-made in the Dashboard', metadata: {} });
    await stripe.prices.create({ product: foreign.id, currency: 'usd', unit_amount: 12345, lookup_key: 'app_monthly', recurring: { interval: 'month' } });
    stripe.resetCalls();

    const actions = await sync(stripe, catalog);
    const replace = actions.find((a) => a.kind === 'price' && a.key === 'app_monthly');
    assert.equal(replace.op, 'replace');
    assert.match(replace.detail, /new product for this sku/);
    const app = [...stripe.store.products.values()].find((p) => p.metadata.sku === 'app');
    const live = [...stripe.store.prices.values()].filter((p) => p.lookup_key === 'app_monthly');
    assert.equal(live.length, 1);
    assert.equal(live[0].product, app.id, 'the lookup_key now lives on the catalog product');
    const old = [...stripe.store.prices.values()].find((p) => p.product === foreign.id);
    assert.equal(old.active, false, 'the foreign price is archived, not deleted');
    assert.equal(old.lookup_key, null);

    stripe.resetCalls();
    assert.ok((await sync(stripe, catalog)).every((a) => a.op === 'noop'), 'converged in one run');
    assert.equal(stripe.writes().length, 0);
  });

  test('metadata or nickname drift is updated in place without archiving', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    await sync(stripe, catalog);
    const price = [...stripe.store.prices.values()].find((p) => p.lookup_key === 'video_monthly');
    price.metadata.income_account = '9999';
    price.nickname = 'stale';
    const product = stripe.store.products.get(price.product);
    product.name = 'Old Name';
    product.tax_code = 'txcd_99999999';
    stripe.resetCalls();

    const actions = await sync(stripe, catalog);
    const updates = actions.filter((a) => a.op === 'update');
    assert.deepEqual(updates.map((a) => `${a.kind}:${a.key}`).sort(), ['price:video_monthly', 'product:video']);
    assert.equal(actions.filter((a) => a.op === 'replace').length, 0);
    assert.equal(stripe.store.prices.get(price.id).metadata.income_account, '4040');
    assert.equal(stripe.store.prices.get(price.id).nickname, 'Video & Creative Production - monthly');
    assert.equal(product.name, 'Video & Creative Production');
    assert.equal(product.tax_code, 'txcd_20030000');
  });

  test('archived product or price with matching attributes is reactivated, not duplicated', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    await sync(stripe, catalog);
    const price = [...stripe.store.prices.values()].find((p) => p.lookup_key === 'local_seo_monthly');
    price.active = false;
    stripe.store.products.get(price.product).active = false;
    stripe.resetCalls();

    const actions = await sync(stripe, catalog);
    assert.deepEqual(stripe.writes().map((w) => w.method).sort(), ['prices.update', 'products.update']);
    assert.equal(actions.filter((a) => a.op === 'create' || a.op === 'replace').length, 0);
    assert.equal(price.active, true);
  });

  test('--prune-archived archives managed prices and products that left the catalog, deleting nothing', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    await sync(stripe, catalog);
    const before = { products: stripe.store.products.size, prices: stripe.store.prices.size };

    const trimmed = structuredClone(catalog);
    trimmed.products = trimmed.products.filter((p) => p.sku !== 'video');
    trimmed.products.find((p) => p.sku === 'app').prices = trimmed.products.find((p) => p.sku === 'app').prices.filter((p) => p.lookup_key !== 'app_prepaid_6mo');

    // without the flag: stale objects are left alone
    stripe.resetCalls();
    await sync(stripe, trimmed);
    assert.equal(stripe.writes().length, 0);

    stripe.resetCalls();
    const actions = await sync(stripe, trimmed, { pruneArchived: true });
    const archived = actions.filter((a) => a.op === 'archive');
    assert.deepEqual(archived.map((a) => `${a.kind}:${a.key}`).sort(), [
      'price:app_prepaid_6mo', 'price:video_monthly', 'price:video_prepaid_12mo', 'price:video_prepaid_24mo', 'price:video_prepaid_6mo', 'product:video',
    ]);
    assert.ok(stripe.writes().every((w) => w.method.endsWith('.update') && w.args.params.active === false));
    assert.equal(stripe.store.products.size, before.products, 'products never deleted');
    assert.equal(stripe.store.prices.size, before.prices, 'prices never deleted');
    assert.equal([...stripe.store.products.values()].find((p) => p.metadata.sku === 'video').active, false);
  });

  test('a coupon that exists with different immutable fields is reported, not recreated', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    await stripe.coupons.create({ id: 'trial_conversion_5', percent_off: 10, duration: 'forever' });
    stripe.resetCalls();
    const actions = await sync(stripe, catalog);
    const warn = actions.find((a) => a.kind === 'coupon');
    assert.equal(warn.op, 'warn');
    assert.match(warn.detail, /percent_off 10 -> 5/);
    assert.equal(stripe.writes().filter((w) => w.method.startsWith('coupons.')).length, 0);
  });

  test('refuses to guess when two active products share a sku', async () => {
    const catalog = await loadSample();
    const stripe = createMockStripe();
    await stripe.products.create({ name: 'A', metadata: { sku: 'app' } });
    await stripe.products.create({ name: 'B', metadata: { sku: 'app' } });
    await assert.rejects(sync(stripe, catalog), /2 Products carry metadata.sku="app"/);
  });
});
