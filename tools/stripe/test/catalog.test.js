import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, loadCatalog, CatalogError, allLookupKeys } from '../lib/catalog.js';

const SAMPLE_PATH = new URL('../catalog.sample.json', import.meta.url);

async function sample() {
  return JSON.parse(await readFile(SAMPLE_PATH, 'utf8'));
}

function expectProblems(raw, ...patterns) {
  let err;
  try {
    validateCatalog(raw);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof CatalogError, 'expected a CatalogError');
  for (const p of patterns) {
    assert.ok(err.problems.some((m) => p.test(m)), `expected a problem matching ${p}, got:\n${err.problems.join('\n')}`);
  }
  return err;
}

describe('catalog schema', () => {
  test('the committed sample is valid and covers every SKU and key shape', async () => {
    const catalog = await loadCatalog(SAMPLE_PATH);
    const skus = catalog.products.map((p) => p.sku);
    assert.deepEqual(skus, ['app', 'ai_marketing', 'website_hosting', 'website_build', 'ads', 'video', 'local_seo', 'analytics', 'multi_location', 'whitelabel', 'full_package']);
    const keys = new Set(allLookupKeys(catalog));
    for (const sku of skus.filter((s) => s !== 'website_build')) {
      for (const suffix of ['monthly', 'prepaid_6mo', 'prepaid_12mo', 'prepaid_24mo']) {
        assert.ok(keys.has(`${sku}_${suffix}`), `missing ${sku}_${suffix}`);
      }
    }
    for (const k of ['website_build_full', 'website_build_12_24', 'ads_usage_anchor', 'whitelabel_usage_anchor', 'ads_setup_full', 'ads_setup_6mo']) {
      assert.ok(keys.has(k), `missing ${k}`);
    }
    assert.ok(![...keys].some((k) => /_setup_(12|24)mo$/.test(k)), 'no 12/24-month setup fees (waived)');
    assert.equal(catalog.coupons[0].id, 'trial_conversion_5');
    // sample amounts are obviously fake placeholders
    for (const p of catalog.products) for (const pr of p.prices) {
      assert.ok([0, 12345, 67890, 123450, 234560, 11111, 5555, 99999, 55555].includes(pr.amount), `${pr.lookup_key} amount ${pr.amount} is not a placeholder`);
    }
  });

  test('rejects a non-integer amount', async () => {
    const raw = await sample();
    raw.products[0].prices[0].amount = 123.45;
    expectProblems(raw, /products\[0\]\.prices\[0\]\.amount: must be an integer number of cents \(got 123\.45\)/);
    raw.products[0].prices[0].amount = '12345';
    expectProblems(raw, /products\[0\]\.prices\[0\]\.amount: must be an integer number of cents \(got "12345"\)/);
  });

  test('rejects a duplicate lookup_key, naming both locations', async () => {
    const raw = await sample();
    raw.products[1].prices[0].lookup_key = 'ai_marketing_prepaid_6mo';
    expectProblems(raw, /products\[1\]\.prices\[1\]\.lookup_key: duplicate lookup_key "ai_marketing_prepaid_6mo" \(also products\[1\]\.prices\[0\]\)/);
  });

  test('rejects a duplicate sku', async () => {
    const raw = await sample();
    raw.products[1].sku = 'app';
    expectProblems(raw, /products\[1\]\.sku: duplicate sku "app"/);
  });

  test('collects every problem instead of stopping at the first', async () => {
    const raw = await sample();
    raw.products[0].prices[0].amount = 1.5;
    raw.products[2].tax_code = 'nope';
    raw.products[3].income_account = '1234';
    delete raw.products[4].prices[1].term_months;
    const err = expectProblems(raw, /amount/, /tax_code: "nope"/, /income_account: must be one of/, /term_months: is required on prepaid/);
    assert.ok(err.problems.length >= 4);
    assert.match(err.message, /Invalid catalog \(\d+ problems\)/);
  });

  test('usage anchors must be zero and other prices must not be', async () => {
    const raw = await sample();
    const ads = raw.products.find((p) => p.sku === 'ads');
    ads.prices.find((p) => p.plan_shape === 'usage_anchor').amount = 100;
    ads.prices.find((p) => p.plan_shape === 'monthly').amount = 0;
    expectProblems(raw, /usage_anchor prices must be 0/, /must be greater than 0 for non-anchor prices/);
  });

  test('prepaid terms are limited to 6, 12 or 24 and monthly prices take no term', async () => {
    const raw = await sample();
    raw.products[0].prices[1].term_months = 3;
    raw.products[0].prices[0].term_months = 12;
    expectProblems(raw, /prepaid terms must be 6, 12 or 24/, /is not allowed on monthly prices/);
  });

  test('lookup keys must be prefixed with their sku', async () => {
    const raw = await sample();
    raw.products[0].prices[0].lookup_key = 'premium_monthly';
    expectProblems(raw, /must start with "app_"/);
  });

  test('tax codes resolve from aliases or literals and must look like txcd_', async () => {
    const raw = await sample();
    raw.products[0].tax_code = 'txcd_10103001';
    const ok = validateCatalog(raw);
    assert.equal(ok.products[0].tax_code, 'txcd_10103001');
    assert.equal(ok.products[1].tax_code, 'txcd_20030000');
    raw.tax_codes.saas = 'TXCD_1';
    expectProblems(raw, /tax_codes\.saas: must look like "txcd_12345678"/);
  });

  test('coupon validation', async () => {
    const raw = await sample();
    raw.coupons.push({ id: 'trial_conversion_5', name: 'dup', percent_off: 150, duration: 'repeating' });
    expectProblems(raw, /coupons\[1\]\.id: duplicate coupon id/, /percent_off: must be a number greater than 0 and at most 100/, /duration_in_months: is required/);
  });

  test('price income_account defaults to the product account and can be overridden', async () => {
    const catalog = validateCatalog(await sample());
    const ads = catalog.products.find((p) => p.sku === 'ads');
    assert.equal(ads.prices.find((p) => p.lookup_key === 'ads_monthly').income_account, '4030');
    assert.equal(ads.prices.find((p) => p.lookup_key === 'ads_usage_anchor').income_account, '4031');
    assert.equal(ads.prices.find((p) => p.lookup_key === 'ads_setup_full').income_account, '4090');
  });

  test('unreadable or malformed files produce a CatalogError', async () => {
    await assert.rejects(loadCatalog('/nonexistent/catalog.json'), (e) => e instanceof CatalogError && /cannot read/.test(e.message));
    const tmp = new URL('./bad.json', new URL(process.env.TMPDIR ? `file://${process.env.TMPDIR}/` : 'file:///tmp/'));
    const { writeFile, rm } = await import('node:fs/promises');
    await writeFile(tmp, '{ not json');
    try {
      await assert.rejects(loadCatalog(tmp), (e) => e instanceof CatalogError && /not valid JSON/.test(e.message));
    } finally {
      await rm(tmp, { force: true });
    }
  });
});
