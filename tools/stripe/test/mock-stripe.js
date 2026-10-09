// In-memory stand-in for the parts of the Stripe Node client the sync uses.
// No network. Records every write so tests can assert idempotency.

export class MockStripeError extends Error {
  constructor(message, { code, statusCode = 400, type = 'StripeInvalidRequestError' } = {}) {
    super(message);
    this.type = type;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function createMockStripe({ pageSize = 100 } = {}) {
  const store = { products: new Map(), prices: new Map(), coupons: new Map() };
  const calls = [];
  let counter = 0;
  const nextId = (prefix) => `${prefix}_${String(++counter).padStart(4, '0')}`;
  const record = (method, args) => calls.push({ method, args: structuredClone(args) });

  function paginate(items, params = {}) {
    const limit = Math.min(params.limit ?? 10, pageSize);
    let start = 0;
    if (params.starting_after) {
      const idx = items.findIndex((i) => i.id === params.starting_after);
      if (idx === -1) throw new MockStripeError(`No such object: ${params.starting_after}`, { code: 'resource_missing', statusCode: 404 });
      start = idx + 1;
    }
    const data = items.slice(start, start + limit).map((i) => structuredClone(i));
    return { object: 'list', data, has_more: start + limit < items.length };
  }

  const products = {
    async list(params = {}) {
      record('products.list', params);
      let items = [...store.products.values()];
      if (typeof params.active === 'boolean') items = items.filter((p) => p.active === params.active);
      return paginate(items, params);
    },
    async create(params, opts) {
      record('products.create', { params, opts });
      const prod = {
        id: nextId('prod'), object: 'product', active: true, name: params.name,
        description: params.description ?? null, tax_code: params.tax_code ?? null,
        metadata: { ...(params.metadata ?? {}) },
      };
      store.products.set(prod.id, prod);
      return structuredClone(prod);
    },
    async update(id, params) {
      record('products.update', { id, params });
      const prod = store.products.get(id);
      if (!prod) throw new MockStripeError(`No such product: ${id}`, { code: 'resource_missing', statusCode: 404 });
      for (const [k, v] of Object.entries(params)) {
        if (k === 'metadata') prod.metadata = { ...prod.metadata, ...v };
        else prod[k] = v === '' ? null : v;
      }
      return structuredClone(prod);
    },
  };

  const prices = {
    async list(params = {}) {
      record('prices.list', params);
      let items = [...store.prices.values()];
      if (params.lookup_keys) {
        if (params.lookup_keys.length > 10) throw new MockStripeError('You can specify up to 10 lookup_keys');
        items = items.filter((p) => p.lookup_key && params.lookup_keys.includes(p.lookup_key));
      }
      if (params.product) items = items.filter((p) => p.product === params.product);
      if (typeof params.active === 'boolean') items = items.filter((p) => p.active === params.active);
      return paginate(items, params);
    },
    async create(params, opts) {
      record('prices.create', { params, opts });
      if (!store.products.has(params.product)) throw new MockStripeError(`No such product: ${params.product}`, { code: 'resource_missing' });
      if (params.lookup_key) {
        const clash = [...store.prices.values()].find((p) => p.lookup_key === params.lookup_key);
        if (clash) {
          if (!params.transfer_lookup_key) throw new MockStripeError(`A price with lookup_key '${params.lookup_key}' already exists`, { code: 'resource_already_exists' });
          clash.lookup_key = null;
        }
      }
      const price = {
        id: nextId('price'), object: 'price', active: true, product: params.product,
        currency: params.currency, unit_amount: params.unit_amount, lookup_key: params.lookup_key ?? null,
        nickname: params.nickname ?? null, tax_behavior: params.tax_behavior ?? 'unspecified',
        type: params.recurring ? 'recurring' : 'one_time',
        recurring: params.recurring ? { interval: params.recurring.interval, interval_count: params.recurring.interval_count ?? 1, usage_type: params.recurring.usage_type ?? 'licensed' } : null,
        metadata: { ...(params.metadata ?? {}) },
      };
      store.prices.set(price.id, price);
      return structuredClone(price);
    },
    async update(id, params) {
      record('prices.update', { id, params });
      const price = store.prices.get(id);
      if (!price) throw new MockStripeError(`No such price: ${id}`, { code: 'resource_missing', statusCode: 404 });
      for (const k of ['unit_amount', 'currency', 'recurring', 'product']) {
        if (k in params) throw new MockStripeError(`Received unknown parameter: ${k}`, { code: 'parameter_unknown' });
      }
      if ('tax_behavior' in params && price.tax_behavior !== 'unspecified' && params.tax_behavior !== price.tax_behavior) {
        throw new MockStripeError('tax_behavior can only be changed when it is unspecified');
      }
      for (const [k, v] of Object.entries(params)) {
        if (k === 'metadata') price.metadata = { ...price.metadata, ...v };
        else price[k] = v;
      }
      return structuredClone(price);
    },
  };

  const coupons = {
    async retrieve(id) {
      record('coupons.retrieve', { id });
      const c = store.coupons.get(id);
      if (!c) throw new MockStripeError(`No such coupon: '${id}'`, { code: 'resource_missing', statusCode: 404 });
      return structuredClone(c);
    },
    async create(params, opts) {
      record('coupons.create', { params, opts });
      const id = params.id ?? nextId('coupon');
      if (store.coupons.has(id)) throw new MockStripeError(`Coupon already exists: ${id}`, { code: 'resource_already_exists' });
      const c = {
        id, object: 'coupon', name: params.name ?? null, percent_off: params.percent_off ?? null,
        duration: params.duration, duration_in_months: params.duration_in_months ?? null, valid: true,
        metadata: { ...(params.metadata ?? {}) },
      };
      store.coupons.set(id, c);
      return structuredClone(c);
    },
    async update(id, params) {
      record('coupons.update', { id, params });
      const c = store.coupons.get(id);
      if (!c) throw new MockStripeError(`No such coupon: '${id}'`, { code: 'resource_missing', statusCode: 404 });
      for (const k of ['percent_off', 'duration', 'duration_in_months', 'amount_off']) {
        if (k in params) throw new MockStripeError(`Received unknown parameter: ${k}`, { code: 'parameter_unknown' });
      }
      for (const [k, v] of Object.entries(params)) {
        if (k === 'metadata') c.metadata = { ...c.metadata, ...v };
        else c[k] = v;
      }
      return structuredClone(c);
    },
  };

  return {
    products, prices, coupons, calls, store,
    writes() { return calls.filter((c) => /\.(create|update)$/.test(c.method)); },
    resetCalls() { calls.length = 0; },
  };
}
