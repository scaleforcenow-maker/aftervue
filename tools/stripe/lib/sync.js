// Idempotent reconciliation of the catalog against a Stripe account.
//
//   plan  = await planSync(stripe, catalog, { pruneArchived })
//   await applyPlan(stripe, plan)            // or skip for --dry-run
//
// Rules:
//   * Products are matched by metadata.sku, Prices by lookup_key, Coupons by id.
//   * Missing objects are created. Mutable drift (name, description, tax_code,
//     metadata, nickname) is updated in place.
//   * Immutable drift on a Price (amount, currency, type, recurring interval,
//     tax_behavior) archives the old Price and creates a replacement with
//     transfer_lookup_key: true so the lookup_key moves atomically.
//   * Nothing is ever deleted. --prune-archived only sets active=false on
//     managed objects that are no longer in the catalog.

import { createHash } from 'node:crypto';

export const MANAGED_BY = 'aftervue-stripe-catalog';
const LOOKUP_KEYS_PER_REQUEST = 10; // Stripe limit on prices.list({lookup_keys})
const PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Desired state
// ---------------------------------------------------------------------------

export function productMetadata(product) {
  const shapes = [...new Set(product.prices.map((p) => p.plan_shape))];
  return {
    sku: product.sku,
    plan_shape: shapes.join(','),
    income_account: product.income_account,
    managed_by: MANAGED_BY,
  };
}

export function priceMetadata(product, price) {
  const md = {
    sku: product.sku,
    plan_shape: price.plan_shape,
    income_account: price.income_account,
    managed_by: MANAGED_BY,
  };
  if (price.term_months !== null && price.term_months !== undefined) md.term_months = String(price.term_months);
  return md;
}

export function desiredProductParams(product) {
  const params = {
    name: product.name,
    tax_code: product.tax_code,
    metadata: productMetadata(product),
  };
  if (product.description) params.description = product.description;
  return params;
}

export function desiredPriceParams(catalog, product, price, productId) {
  const params = {
    product: productId,
    currency: catalog.currency,
    unit_amount: price.amount,
    lookup_key: price.lookup_key,
    nickname: price.nickname,
    tax_behavior: catalog.tax_behavior,
    metadata: priceMetadata(product, price),
  };
  if (price.recurring) {
    params.recurring = { interval: price.recurring.interval, interval_count: price.recurring.interval_count, usage_type: 'licensed' };
  }
  return params;
}

export function desiredCouponParams(coupon) {
  const params = {
    id: coupon.id,
    name: coupon.name,
    percent_off: coupon.percent_off,
    duration: coupon.duration,
    metadata: { managed_by: MANAGED_BY },
  };
  if (coupon.duration === 'repeating') params.duration_in_months = coupon.duration_in_months;
  return params;
}

// ---------------------------------------------------------------------------
// Reading current state
// ---------------------------------------------------------------------------

/** Paginate a Stripe list endpoint to completion without autoPaging helpers. */
export async function listAll(resource, params = {}) {
  const out = [];
  let starting_after;
  for (;;) {
    const page = await resource.list({ ...params, limit: PAGE_SIZE, ...(starting_after ? { starting_after } : {}) });
    out.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    starting_after = page.data[page.data.length - 1].id;
  }
  return out;
}

async function fetchManagedProducts(stripe) {
  // Products carry metadata.sku; list everything (active and archived) and
  // index client-side. products.search is eventually consistent, which would
  // make two back-to-back runs disagree, so we avoid it.
  const all = await listAll(stripe.products);
  const bySku = new Map();
  for (const prod of all) {
    const sku = prod.metadata?.sku;
    if (!sku) continue;
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push(prod);
  }
  return { all, bySku };
}

async function fetchPricesByLookupKey(stripe, lookupKeys) {
  const found = new Map();
  for (let i = 0; i < lookupKeys.length; i += LOOKUP_KEYS_PER_REQUEST) {
    const chunk = lookupKeys.slice(i, i + LOOKUP_KEYS_PER_REQUEST);
    const prices = await listAll(stripe.prices, { lookup_keys: chunk });
    for (const price of prices) {
      if (!price.lookup_key) continue;
      if (!found.has(price.lookup_key)) found.set(price.lookup_key, []);
      found.get(price.lookup_key).push(price);
    }
  }
  return found;
}

async function fetchCoupon(stripe, id) {
  try {
    return await stripe.coupons.retrieve(id);
  } catch (err) {
    if (err?.code === 'resource_missing' || err?.statusCode === 404) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

function metadataMatches(actual = {}, desired) {
  return Object.entries(desired).every(([k, v]) => String(actual[k] ?? '') === String(v));
}

function productDrift(existing, desired) {
  const changes = {};
  if (existing.name !== desired.name) changes.name = desired.name;
  if ((existing.description ?? null) !== (desired.description ?? null)) changes.description = desired.description ?? '';
  const existingTax = typeof existing.tax_code === 'object' && existing.tax_code ? existing.tax_code.id : existing.tax_code;
  if ((existingTax ?? null) !== desired.tax_code) changes.tax_code = desired.tax_code;
  if (!metadataMatches(existing.metadata, desired.metadata)) changes.metadata = desired.metadata;
  if (existing.active === false) changes.active = true;
  return Object.keys(changes).length ? changes : null;
}

/** Fields Stripe does not allow changing after creation. */
function priceImmutableDrift(existing, desired) {
  const reasons = [];
  if (existing.unit_amount !== desired.unit_amount) reasons.push(`amount ${fmt(existing.unit_amount)} -> ${fmt(desired.unit_amount)}`);
  if (existing.currency !== desired.currency) reasons.push(`currency ${existing.currency} -> ${desired.currency}`);
  const wantType = desired.recurring ? 'recurring' : 'one_time';
  if (existing.type !== wantType) reasons.push(`type ${existing.type} -> ${wantType}`);
  if (desired.recurring && existing.recurring) {
    if (existing.recurring.interval !== desired.recurring.interval || (existing.recurring.interval_count ?? 1) !== desired.recurring.interval_count) {
      reasons.push(`interval ${existing.recurring.interval_count ?? 1} ${existing.recurring.interval} -> ${desired.recurring.interval_count} ${desired.recurring.interval}`);
    }
    if ((existing.recurring.usage_type ?? 'licensed') !== 'licensed') reasons.push(`usage_type ${existing.recurring.usage_type} -> licensed`);
  }
  const existingTB = existing.tax_behavior ?? 'unspecified';
  if (existingTB !== 'unspecified' && existingTB !== desired.tax_behavior) reasons.push(`tax_behavior ${existingTB} -> ${desired.tax_behavior}`);
  const existingProduct = typeof existing.product === 'object' && existing.product ? existing.product.id : existing.product;
  if (desired.product === null) {
    // The catalog Product for this sku does not exist yet (it is being created
    // in this run), so whatever Product this price hangs off is the wrong one.
    reasons.push(`product ${existingProduct} -> new product for this sku`);
  } else if (existingProduct !== desired.product) {
    reasons.push(`product ${existingProduct} -> ${desired.product}`);
  }
  return reasons;
}

function priceMutableDrift(existing, desired) {
  const changes = {};
  if ((existing.nickname ?? null) !== desired.nickname) changes.nickname = desired.nickname;
  if (!metadataMatches(existing.metadata, desired.metadata)) changes.metadata = desired.metadata;
  if ((existing.tax_behavior ?? 'unspecified') === 'unspecified') changes.tax_behavior = desired.tax_behavior;
  if (existing.active === false) changes.active = true;
  return Object.keys(changes).length ? changes : null;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Action
 * @property {'create'|'update'|'archive'|'replace'|'noop'|'warn'} op
 * @property {'product'|'price'|'coupon'} kind
 * @property {string} key       sku, lookup_key or coupon id
 * @property {string} detail    human-readable explanation
 * @property {object} [params]  request body for create/update
 * @property {string} [id]      Stripe id of the existing object
 * @property {string} [sku]     owning product sku (prices)
 */

/**
 * Compute the list of actions needed to make Stripe match the catalog.
 * Pure reads; nothing is written.
 */
export async function planSync(stripe, catalog, { pruneArchived = false } = {}) {
  const actions = [];
  const push = (a) => actions.push(a);

  const { all: allProducts, bySku } = await fetchManagedProducts(stripe);
  const catalogSkus = new Set(catalog.products.map((p) => p.sku));
  const catalogKeys = new Set(catalog.products.flatMap((p) => p.prices.map((pr) => pr.lookup_key)));

  // Products ------------------------------------------------------------------
  const productIdBySku = new Map();
  for (const product of catalog.products) {
    const matches = bySku.get(product.sku) ?? [];
    const desired = desiredProductParams(product);
    if (matches.length > 1) {
      const active = matches.filter((m) => m.active);
      if (active.length !== 1) {
        throw new SyncError(`${matches.length} Products carry metadata.sku="${product.sku}" (${matches.map((m) => m.id).join(', ')}) and ${active.length} of them are active; exactly one must be active. Archive or reactivate in the Dashboard before re-running`);
      }
      matches.splice(0, matches.length, active[0]);
    }
    if (matches.length === 0) {
      push({ op: 'create', kind: 'product', key: product.sku, detail: `"${product.name}" tax_code=${product.tax_code}`, params: desired });
      continue;
    }
    const existing = matches[0];
    productIdBySku.set(product.sku, existing.id);
    const drift = productDrift(existing, desired);
    if (drift) {
      push({ op: 'update', kind: 'product', key: product.sku, id: existing.id, detail: `update ${Object.keys(drift).join(', ')}`, params: drift });
    } else {
      push({ op: 'noop', kind: 'product', key: product.sku, id: existing.id, detail: 'up to date' });
    }
  }

  // Prices --------------------------------------------------------------------
  const existingByKey = await fetchPricesByLookupKey(stripe, [...catalogKeys]);
  for (const product of catalog.products) {
    const productId = productIdBySku.get(product.sku) ?? null; // null => product not yet created
    for (const price of product.prices) {
      const desired = desiredPriceParams(catalog, product, price, productId);
      const candidates = existingByKey.get(price.lookup_key) ?? [];
      const existing = candidates.find((c) => c.active) ?? candidates[0];
      if (!existing) {
        push({ op: 'create', kind: 'price', key: price.lookup_key, sku: product.sku, detail: describePrice(catalog, price), params: desired });
        continue;
      }
      const reasons = priceImmutableDrift(existing, desired);
      if (reasons.length) {
        push({
          op: 'replace', kind: 'price', key: price.lookup_key, sku: product.sku, id: existing.id,
          detail: `${reasons.join('; ')} (archive ${existing.id}, create replacement, transfer lookup_key)`,
          params: { ...desired, transfer_lookup_key: true },
        });
        continue;
      }
      const drift = priceMutableDrift(existing, desired);
      if (drift) {
        push({ op: 'update', kind: 'price', key: price.lookup_key, sku: product.sku, id: existing.id, detail: `update ${Object.keys(drift).join(', ')}`, params: drift });
      } else {
        push({ op: 'noop', kind: 'price', key: price.lookup_key, sku: product.sku, id: existing.id, detail: 'up to date' });
      }
    }
  }

  // Coupons -------------------------------------------------------------------
  for (const coupon of catalog.coupons) {
    const desired = desiredCouponParams(coupon);
    const existing = await fetchCoupon(stripe, coupon.id);
    if (!existing) {
      push({ op: 'create', kind: 'coupon', key: coupon.id, detail: `${coupon.percent_off}% off, duration=${coupon.duration}`, params: desired });
      continue;
    }
    const immutable = [];
    if (existing.percent_off !== coupon.percent_off) immutable.push(`percent_off ${existing.percent_off} -> ${coupon.percent_off}`);
    if (existing.duration !== coupon.duration) immutable.push(`duration ${existing.duration} -> ${coupon.duration}`);
    if (coupon.duration === 'repeating' && existing.duration_in_months !== coupon.duration_in_months) immutable.push(`duration_in_months ${existing.duration_in_months} -> ${coupon.duration_in_months}`);
    if (immutable.length) {
      // Coupon ids are user-chosen and coupons are immutable; recreating under
      // the same id would require deleting, which this tool never does.
      push({ op: 'warn', kind: 'coupon', key: coupon.id, id: existing.id, detail: `exists with different immutable fields (${immutable.join('; ')}); delete it in the Dashboard or change the catalog id` });
      continue;
    }
    const changes = {};
    if ((existing.name ?? null) !== coupon.name) changes.name = coupon.name;
    if (!metadataMatches(existing.metadata, desired.metadata)) changes.metadata = desired.metadata;
    if (Object.keys(changes).length) {
      push({ op: 'update', kind: 'coupon', key: coupon.id, id: existing.id, detail: `update ${Object.keys(changes).join(', ')}`, params: changes });
    } else {
      push({ op: 'noop', kind: 'coupon', key: coupon.id, id: existing.id, detail: 'up to date' });
    }
  }

  // Prune (archive only) ------------------------------------------------------
  if (pruneArchived) {
    const managedProducts = allProducts.filter((p) => p.metadata?.managed_by === MANAGED_BY || catalogSkus.has(p.metadata?.sku));
    for (const prod of managedProducts) {
      const sku = prod.metadata?.sku ?? prod.id; // a managed product always has a sku; fall back so printing never sees undefined
      const inCatalog = catalogSkus.has(prod.metadata?.sku);
      if (!inCatalog && prod.active) {
        push({ op: 'archive', kind: 'product', key: sku, id: prod.id, detail: `sku no longer in catalog; set active=false`, params: { active: false } });
      }
      const prices = await listAll(stripe.prices, { product: prod.id, active: true });
      for (const price of prices) {
        if (price.lookup_key && catalogKeys.has(price.lookup_key)) continue;
        push({ op: 'archive', kind: 'price', key: price.lookup_key ?? price.id, sku, id: price.id, detail: `${inCatalog ? 'not in catalog' : 'belongs to pruned product'}; set active=false`, params: { active: false } });
      }
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

/**
 * Execute a plan. Returns the same actions annotated with `result`.
 * Products are created before the prices that depend on them.
 */
export async function applyPlan(stripe, actions, { log = () => {} } = {}) {
  const productIdBySku = new Map();
  for (const a of actions) if (a.kind === 'product' && a.id) productIdBySku.set(a.key, a.id);

  const order = { product: 0, price: 1, coupon: 2 };
  const sorted = [...actions].sort((x, y) => order[x.kind] - order[y.kind]);

  for (const a of sorted) {
    if (a.op === 'noop' || a.op === 'warn') continue;
    const idem = (suffix) => ({ idempotencyKey: idempotencyKey(a.kind, a.key, suffix, a.params) });

    if (a.kind === 'product') {
      if (a.op === 'create') {
        const created = await stripe.products.create(a.params, idem('create'));
        productIdBySku.set(a.key, created.id);
        a.result = created;
      } else {
        a.result = await stripe.products.update(a.id, a.params);
      }
    } else if (a.kind === 'price') {
      if (a.op === 'create' || a.op === 'replace') {
        const params = { ...a.params };
        if (!params.product) {
          params.product = productIdBySku.get(a.sku);
          if (!params.product) throw new SyncError(`cannot create price ${a.key}: product for sku "${a.sku}" was not created`);
        }
        const created = await stripe.prices.create(params, idem(a.op));
        a.result = created;
        if (a.op === 'replace') {
          // transfer_lookup_key has already moved the key; archive the old price.
          a.archived = await stripe.prices.update(a.id, { active: false });
        }
      } else {
        a.result = await stripe.prices.update(a.id, a.params);
      }
    } else if (a.kind === 'coupon') {
      if (a.op === 'create') {
        a.result = await stripe.coupons.create(a.params, idem('create'));
      } else {
        a.result = await stripe.coupons.update(a.id, a.params);
      }
    }
    log(a);
  }
  return actions;
}

/** Plan and (unless dryRun) apply in one call. */
export async function sync(stripe, catalog, { dryRun = false, pruneArchived = false, log } = {}) {
  const actions = await planSync(stripe, catalog, { pruneArchived });
  if (!dryRun) await applyPlan(stripe, actions, { log });
  return actions;
}

export function summarize(actions) {
  const counts = {};
  for (const a of actions) {
    const k = `${a.op}:${a.kind}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

export class SyncError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'SyncError';
  }
}

/**
 * Stripe caps idempotency keys at 255 characters and lookup_keys at 200, so the
 * object key is truncated for readability and the full (key, params) pair goes
 * into the digest. Same key + same params => same idempotency key across runs.
 */
export function idempotencyKey(kind, key, suffix, params) {
  const digest = createHash('sha256').update(`${key}\0${JSON.stringify(params ?? {})}`).digest('hex').slice(0, 32);
  return `${MANAGED_BY}:${kind}:${suffix}:${String(key).slice(0, 64)}:${digest}`;
}

function describePrice(catalog, price) {
  const kind = price.recurring ? `recurring/${price.recurring.interval}` : 'one_time';
  const term = price.term_months ? ` term=${price.term_months}` : '';
  return `${price.plan_shape} ${kind} ${fmt(price.amount, catalog.currency)}${term} acct=${price.income_account}`;
}

export function fmt(cents, currency = 'usd') {
  if (typeof cents !== 'number') return String(cents);
  const major = (cents / 100).toFixed(2);
  return currency === 'usd' ? `$${major}` : `${major} ${currency.toUpperCase()}`;
}
