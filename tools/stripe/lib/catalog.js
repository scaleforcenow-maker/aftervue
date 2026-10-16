// Catalog loading and schema validation for the AfterVue Stripe catalog.
//
// The catalog is a JSON document (gitignored: tools/stripe/catalog.json) that
// describes every Product, Price and Coupon the provisioning tool manages.
// Amounts are integer cents. See catalog.sample.json for the full shape.

import { readFile } from 'node:fs/promises';

export const PLAN_SHAPES = Object.freeze(['monthly', 'prepaid', 'setup', 'build', 'usage_anchor']);
export const ONE_TIME_SHAPES = new Set(['prepaid', 'setup', 'build']);
export const RECURRING_SHAPES = new Set(['monthly', 'usage_anchor']);
export const PREPAID_TERMS = new Set([6, 12, 24]);
export const SUPPORTED_VERSION = 1;

const SKU_RE = /^[a-z][a-z0-9_]*$/;
const LOOKUP_KEY_RE = /^[A-Za-z0-9_.-]{1,200}$/;
const TAX_CODE_RE = /^txcd_\d{8}$/;
const TERM_STRING_RE = /^\d+(_\d+)+$/; // e.g. "12_24" = applies to both terms
const ACCOUNT_RE = /^\d{4}$/;
const COUPON_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;
const TAX_BEHAVIORS = new Set(['exclusive', 'inclusive']);

export class CatalogError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    const list = problems.map((p) => `  - ${p}`).join('\n');
    super(`Invalid catalog (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n${list}`);
    this.name = 'CatalogError';
    this.problems = problems;
  }
}

/**
 * Load, parse and validate a catalog file.
 * @param {string} path
 * @returns {Promise<NormalizedCatalog>}
 */
export async function loadCatalog(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    throw new CatalogError([`cannot read ${path}: ${err.message}`]);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new CatalogError([`${path} is not valid JSON: ${err.message}`]);
  }
  return validateCatalog(raw);
}

/**
 * Validate a parsed catalog object and return a normalized copy.
 * Throws CatalogError listing every problem found (not just the first).
 *
 * @typedef {object} NormalizedPrice
 * @property {string} lookup_key
 * @property {string} plan_shape
 * @property {number} amount            integer cents
 * @property {number|string|null} term_months
 * @property {string} income_account    4-digit chart-of-accounts id
 * @property {string} nickname
 * @property {'one_time'|'recurring'} type
 * @property {{interval:'month',interval_count:1}|null} recurring
 *
 * @typedef {object} NormalizedProduct
 * @property {string} sku
 * @property {string} name
 * @property {string|undefined} description
 * @property {string} tax_code          resolved txcd_ code
 * @property {string} income_account
 * @property {NormalizedPrice[]} prices
 *
 * @typedef {object} NormalizedCoupon
 * @property {string} id
 * @property {string} name
 * @property {number} percent_off
 * @property {'once'|'forever'|'repeating'} duration
 * @property {number|undefined} duration_in_months
 *
 * @typedef {object} NormalizedCatalog
 * @property {number} version
 * @property {string} currency
 * @property {'exclusive'|'inclusive'} tax_behavior
 * @property {Record<string,string>} tax_codes
 * @property {Record<string,string>} income_accounts
 * @property {NormalizedProduct[]} products
 * @property {NormalizedCoupon[]} coupons
 *
 * @param {unknown} raw
 * @returns {NormalizedCatalog}
 */
export function validateCatalog(raw) {
  const problems = [];
  const fail = (path, msg) => problems.push(`${path}: ${msg}`);

  if (!isPlainObject(raw)) {
    throw new CatalogError(['catalog root must be a JSON object']);
  }

  // ---- root scalars -------------------------------------------------------
  if (raw.version !== SUPPORTED_VERSION) {
    fail('version', `must be ${SUPPORTED_VERSION} (got ${JSON.stringify(raw.version)})`);
  }
  const currency = typeof raw.currency === 'string' ? raw.currency.toLowerCase() : null;
  if (!currency || !/^[a-z]{3}$/.test(currency)) {
    fail('currency', 'must be a 3-letter ISO currency code such as "usd"');
  }
  const tax_behavior = raw.tax_behavior ?? 'exclusive';
  if (!TAX_BEHAVIORS.has(tax_behavior)) {
    fail('tax_behavior', 'must be "exclusive" or "inclusive"');
  }
  if (raw.notes !== undefined && typeof raw.notes !== 'string') fail('notes', 'must be a string');

  // ---- tax code aliases ---------------------------------------------------
  const tax_codes = {};
  if (!isPlainObject(raw.tax_codes) || Object.keys(raw.tax_codes).length === 0) {
    fail('tax_codes', 'must be a non-empty object mapping an alias (e.g. "saas") to a Stripe txcd_ code');
  } else {
    for (const [alias, code] of Object.entries(raw.tax_codes)) {
      if (typeof code !== 'string' || !TAX_CODE_RE.test(code)) {
        fail(`tax_codes.${alias}`, `must look like "txcd_12345678" (got ${JSON.stringify(code)})`);
      } else {
        tax_codes[alias] = code;
      }
    }
  }

  // ---- chart of accounts --------------------------------------------------
  const income_accounts = {};
  if (!isPlainObject(raw.income_accounts) || Object.keys(raw.income_accounts).length === 0) {
    fail('income_accounts', 'must be a non-empty object mapping a 4-digit account id to its name');
  } else {
    for (const [id, name] of Object.entries(raw.income_accounts)) {
      if (!ACCOUNT_RE.test(id)) fail(`income_accounts.${id}`, 'account id must be 4 digits');
      if (typeof name !== 'string' || !name.trim()) fail(`income_accounts.${id}`, 'account name must be a non-empty string');
      income_accounts[id] = name;
    }
  }
  const knownAccount = (id) => Object.hasOwn(income_accounts, id);

  // ---- products & prices --------------------------------------------------
  const products = [];
  const seenSkus = new Map();
  const seenLookupKeys = new Map();

  if (!Array.isArray(raw.products) || raw.products.length === 0) {
    fail('products', 'must be a non-empty array');
  } else {
    raw.products.forEach((p, i) => {
      const path = `products[${i}]`;
      if (!isPlainObject(p)) return fail(path, 'must be an object');

      const sku = p.sku;
      if (typeof sku !== 'string' || !SKU_RE.test(sku)) {
        fail(`${path}.sku`, 'must be a lowercase snake_case identifier');
      } else if (seenSkus.has(sku)) {
        fail(`${path}.sku`, `duplicate sku "${sku}" (also products[${seenSkus.get(sku)}])`);
      } else {
        seenSkus.set(sku, i);
      }
      if (typeof p.name !== 'string' || !p.name.trim()) fail(`${path}.name`, 'must be a non-empty string');
      if (p.description !== undefined && typeof p.description !== 'string') fail(`${path}.description`, 'must be a string');
      if (p.notes !== undefined && typeof p.notes !== 'string') fail(`${path}.notes`, 'must be a string');

      let tax_code = null;
      if (typeof p.tax_code !== 'string') {
        fail(`${path}.tax_code`, 'is required (an alias from tax_codes or a literal txcd_ code)');
      } else if (TAX_CODE_RE.test(p.tax_code)) {
        tax_code = p.tax_code;
      } else if (Object.hasOwn(tax_codes, p.tax_code)) {
        tax_code = tax_codes[p.tax_code];
      } else {
        fail(`${path}.tax_code`, `"${p.tax_code}" is neither a tax_codes alias nor a txcd_ code`);
      }

      const productAccount = p.income_account;
      if (typeof productAccount !== 'string' || !knownAccount(productAccount)) {
        fail(`${path}.income_account`, `must be one of the income_accounts ids (got ${JSON.stringify(productAccount)})`);
      }

      const prices = [];
      if (!Array.isArray(p.prices) || p.prices.length === 0) {
        fail(`${path}.prices`, 'must be a non-empty array');
      } else {
        p.prices.forEach((pr, j) => {
          const ppath = `${path}.prices[${j}]`;
          if (!isPlainObject(pr)) return fail(ppath, 'must be an object');

          const lookup_key = pr.lookup_key;
          if (typeof lookup_key !== 'string' || !LOOKUP_KEY_RE.test(lookup_key)) {
            fail(`${ppath}.lookup_key`, 'must be a non-empty string of letters, digits, "_", "-" or "." (max 200 chars)');
          } else {
            if (seenLookupKeys.has(lookup_key)) {
              fail(`${ppath}.lookup_key`, `duplicate lookup_key "${lookup_key}" (also ${seenLookupKeys.get(lookup_key)})`);
            } else {
              seenLookupKeys.set(lookup_key, ppath);
            }
            if (typeof sku === 'string' && !lookup_key.startsWith(`${sku}_`)) {
              fail(`${ppath}.lookup_key`, `must start with "${sku}_" so prices stay traceable to their SKU`);
            }
          }

          const plan_shape = pr.plan_shape;
          if (!PLAN_SHAPES.includes(plan_shape)) {
            fail(`${ppath}.plan_shape`, `must be one of ${PLAN_SHAPES.join('|')} (got ${JSON.stringify(plan_shape)})`);
          }

          const amount = pr.amount;
          if (typeof amount !== 'number' || !Number.isInteger(amount) || !Number.isSafeInteger(amount)) {
            fail(`${ppath}.amount`, `must be an integer number of cents (got ${JSON.stringify(amount)})`);
          } else if (amount < 0) {
            fail(`${ppath}.amount`, 'must not be negative');
          } else if (plan_shape === 'usage_anchor' && amount !== 0) {
            fail(`${ppath}.amount`, 'usage_anchor prices must be 0; usage is billed with Invoice Items');
          } else if (plan_shape !== 'usage_anchor' && amount === 0) {
            fail(`${ppath}.amount`, 'must be greater than 0 for non-anchor prices');
          }

          let term_months = pr.term_months ?? null;
          if (term_months !== null) {
            const isInt = Number.isInteger(term_months) && term_months > 0;
            const isRange = typeof term_months === 'string' && TERM_STRING_RE.test(term_months);
            if (!isInt && !isRange) {
              fail(`${ppath}.term_months`, 'must be a positive integer or a string like "12_24"');
            } else if (plan_shape === 'prepaid' && !PREPAID_TERMS.has(term_months)) {
              fail(`${ppath}.term_months`, 'prepaid terms must be 6, 12 or 24');
            } else if (plan_shape === 'monthly' || plan_shape === 'usage_anchor') {
              fail(`${ppath}.term_months`, `is not allowed on ${plan_shape} prices`);
            }
          } else if (plan_shape === 'prepaid') {
            fail(`${ppath}.term_months`, 'is required on prepaid prices (6, 12 or 24)');
          }

          const income_account = pr.income_account ?? productAccount;
          if (typeof income_account !== 'string' || !knownAccount(income_account)) {
            fail(`${ppath}.income_account`, `must be one of the income_accounts ids (got ${JSON.stringify(income_account)})`);
          }
          if (pr.nickname !== undefined && typeof pr.nickname !== 'string') fail(`${ppath}.nickname`, 'must be a string');

          const recurring = RECURRING_SHAPES.has(plan_shape) ? { interval: 'month', interval_count: 1 } : null;
          prices.push({
            lookup_key,
            plan_shape,
            amount,
            term_months,
            income_account,
            nickname: pr.nickname ?? defaultNickname(p.name, plan_shape, term_months),
            type: recurring ? 'recurring' : 'one_time',
            recurring,
          });
        });
      }

      products.push({
        sku,
        name: typeof p.name === 'string' ? p.name.trim() : p.name,
        description: p.description,
        tax_code,
        income_account: productAccount,
        prices,
      });
    });
  }

  // ---- coupons ------------------------------------------------------------
  const coupons = [];
  if (raw.coupons !== undefined) {
    if (!Array.isArray(raw.coupons)) {
      fail('coupons', 'must be an array');
    } else {
      const seen = new Set();
      raw.coupons.forEach((c, i) => {
        const path = `coupons[${i}]`;
        if (!isPlainObject(c)) return fail(path, 'must be an object');
        if (typeof c.id !== 'string' || !COUPON_ID_RE.test(c.id)) {
          fail(`${path}.id`, 'must be a non-empty string of letters, digits, "_" or "-"');
        } else if (seen.has(c.id)) {
          fail(`${path}.id`, `duplicate coupon id "${c.id}"`);
        } else {
          seen.add(c.id);
        }
        if (typeof c.name !== 'string' || !c.name.trim()) fail(`${path}.name`, 'must be a non-empty string');
        if (typeof c.percent_off !== 'number' || !(c.percent_off > 0 && c.percent_off <= 100)) {
          fail(`${path}.percent_off`, 'must be a number greater than 0 and at most 100');
        }
        if (!['once', 'forever', 'repeating'].includes(c.duration)) {
          fail(`${path}.duration`, 'must be "once", "forever" or "repeating"');
        }
        if (c.duration === 'repeating' && !(Number.isInteger(c.duration_in_months) && c.duration_in_months > 0)) {
          fail(`${path}.duration_in_months`, 'is required (positive integer) when duration is "repeating"');
        }
        if (c.duration !== 'repeating' && c.duration_in_months !== undefined) {
          fail(`${path}.duration_in_months`, 'is only allowed when duration is "repeating"');
        }
        coupons.push({
          id: c.id,
          name: typeof c.name === 'string' ? c.name.trim() : c.name,
          percent_off: c.percent_off,
          duration: c.duration,
          duration_in_months: c.duration === 'repeating' ? c.duration_in_months : undefined,
        });
      });
    }
  }

  if (problems.length) throw new CatalogError(problems);

  return { version: SUPPORTED_VERSION, currency, tax_behavior, tax_codes, income_accounts, products, coupons };
}

/** All lookup keys in the catalog, in catalog order. */
export function allLookupKeys(catalog) {
  return catalog.products.flatMap((p) => p.prices.map((pr) => pr.lookup_key));
}

function defaultNickname(productName, shape, term) {
  switch (shape) {
    case 'monthly': return `${productName} - monthly`;
    case 'prepaid': return `${productName} - ${term}-month prepaid`;
    case 'setup': return term ? `${productName} - setup fee (${term}-month term)` : `${productName} - setup fee`;
    case 'build': return term ? `${productName} - build fee (${String(term).replace(/_/g, '/')}-month term)` : `${productName} - build fee`;
    case 'usage_anchor': return `${productName} - usage (billed in arrears)`;
    default: return productName;
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
