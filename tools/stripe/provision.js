#!/usr/bin/env node
// AfterVue Stripe catalog provisioning CLI.
//
//   STRIPE_SECRET_KEY=rk_test_... node provision.js --catalog ./catalog.json --mode test --dry-run
//   STRIPE_SECRET_KEY=rk_test_... node provision.js --catalog ./catalog.json --mode test
//   STRIPE_ALLOW_LIVE=1 STRIPE_SECRET_KEY=rk_live_... node provision.js --catalog ./catalog.json --mode live
//
// The real catalog.json is gitignored and lives outside version control.

import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, CatalogError } from './lib/catalog.js';
import { planSync, applyPlan, summarize, fmt, SyncError } from './lib/sync.js';

const USAGE = `Usage: node provision.js --catalog <path> --mode <test|live> [--dry-run] [--prune-archived]

Options:
  --catalog <path>    Catalog JSON (default: ./catalog.json next to this script; gitignored)
  --mode <test|live>  Which Stripe mode the key in STRIPE_SECRET_KEY must belong to (required)
  --dry-run           Print the plan and exit without writing anything
  --prune-archived    Also archive (never delete) managed Products/Prices that left the catalog
  -h, --help          Show this help

Environment:
  STRIPE_SECRET_KEY   Restricted (rk_) or secret (sk_) key. Prefix must match --mode.
                      With --dry-run and no key, the plan is computed against an empty account.
  STRIPE_ALLOW_LIVE   Must equal "1" for --mode live. Refused otherwise.
`;

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      catalog: { type: 'string' },
      mode: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'prune-archived': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
  return {
    catalog: values.catalog,
    mode: values.mode,
    dryRun: values['dry-run'],
    pruneArchived: values['prune-archived'],
    help: values.help,
  };
}

/**
 * Enforce the mode/key/environment safety rules. Throws on any violation.
 * Exported so the tests can exercise it without a network.
 */
export function assertModeAllowed({ mode, key, env, dryRun }) {
  if (mode !== 'test' && mode !== 'live') {
    throw new UsageError('--mode must be "test" or "live"');
  }
  if (mode === 'live' && env.STRIPE_ALLOW_LIVE !== '1') {
    throw new UsageError('refusing to run in live mode: set STRIPE_ALLOW_LIVE=1 to confirm (and pass --mode live)');
  }
  if (!key) {
    if (dryRun) return 'offline';
    throw new UsageError('STRIPE_SECRET_KEY is not set');
  }
  const prefix = /^(sk|rk)_(test|live)_/.exec(key);
  if (!prefix) {
    throw new UsageError('STRIPE_SECRET_KEY must start with sk_test_, rk_test_, sk_live_ or rk_live_');
  }
  if (prefix[2] !== mode) {
    throw new UsageError(`STRIPE_SECRET_KEY is a ${prefix[2]}-mode key but --mode ${mode} was requested`);
  }
  return 'online';
}

export class UsageError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'UsageError';
  }
}

/** A Stripe-shaped client that answers every read as an empty account. */
export function emptyAccountClient() {
  const empty = async () => ({ object: 'list', data: [], has_more: false });
  const missing = async (id) => {
    const err = new Error(`No such coupon: '${id}'`);
    err.code = 'resource_missing';
    err.statusCode = 404;
    throw err;
  };
  return {
    products: { list: empty },
    prices: { list: empty },
    coupons: { retrieve: missing },
  };
}

function printPlan(actions, catalog, { dryRun, mode, source }) {
  const header = dryRun ? 'DRY RUN - no changes will be made' : `APPLYING to ${mode} mode`;
  console.log(`\n${header}${source ? `  (${source})` : ''}`);
  console.log(`currency=${catalog.currency} tax_behavior=${catalog.tax_behavior} products=${catalog.products.length} prices=${catalog.products.reduce((n, p) => n + p.prices.length, 0)} coupons=${catalog.coupons.length}\n`);

  const rows = actions.map((a) => [a.op.toUpperCase(), a.kind, a.key, a.detail]);
  const widths = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length), 2));
  for (const r of rows) {
    console.log(`  ${r[0].padEnd(widths[0])}  ${r[1].padEnd(widths[1])}  ${r[2].padEnd(widths[2])}  ${r[3]}`);
  }
  const counts = summarize(actions);
  console.log('\nSummary: ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '));
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let opts;
  try {
    opts = parseCli(argv);
  } catch (err) {
    console.error(`error: ${err.message}\n\n${USAGE}`);
    return 2;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }

  const catalogPath = path.resolve(opts.catalog ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'catalog.json'));

  try {
    const connectivity = assertModeAllowed({ mode: opts.mode, key: env.STRIPE_SECRET_KEY, env, dryRun: opts.dryRun });
    const catalog = await loadCatalog(catalogPath);

    let stripe;
    let source;
    if (connectivity === 'offline') {
      stripe = emptyAccountClient();
      source = 'no STRIPE_SECRET_KEY: planning against an empty account';
    } else {
      const { default: Stripe } = await import('stripe');
      stripe = new Stripe(env.STRIPE_SECRET_KEY, {
        maxNetworkRetries: 2,
        appInfo: { name: 'aftervue-stripe-catalog', version: '0.1.0' },
      });
      source = `${opts.mode} mode, key ${env.STRIPE_SECRET_KEY.slice(0, 8)}...`;
    }

    const actions = await planSync(stripe, catalog, { pruneArchived: opts.pruneArchived });
    printPlan(actions, catalog, { dryRun: opts.dryRun, mode: opts.mode, source });

    if (opts.dryRun) return 0;

    const todo = actions.filter((a) => a.op !== 'noop' && a.op !== 'warn');
    if (todo.length === 0) {
      console.log('\nNothing to do.');
      return 0;
    }
    console.log('');
    await applyPlan(stripe, actions, {
      log: (a) => {
        const id = a.result?.id ?? a.id;
        const extra = a.op === 'replace' && a.archived ? ` (archived ${a.archived.id})` : '';
        const amt = a.kind === 'price' && a.result?.unit_amount !== undefined ? ` ${fmt(a.result.unit_amount, a.result.currency)}` : '';
        console.log(`  ${a.op.toUpperCase().padEnd(7)} ${a.kind.padEnd(7)} ${a.key.padEnd(32)} ${id}${amt}${extra}`);
      },
    });
    const warns = actions.filter((a) => a.op === 'warn');
    for (const w of warns) console.warn(`\nWARNING ${w.kind} ${w.key}: ${w.detail}`);
    console.log(`\nDone: ${todo.length} change${todo.length === 1 ? '' : 's'} applied.`);
    return warns.length ? 3 : 0;
  } catch (err) {
    if (err instanceof UsageError || err instanceof CatalogError || err instanceof SyncError) {
      console.error(`error: ${err.message}`);
      return 2;
    }
    if (err?.type && String(err.type).startsWith('Stripe')) {
      console.error(`Stripe error (${err.type}${err.code ? `/${err.code}` : ''}): ${err.message}`);
      return 1;
    }
    throw err;
  }
}

// fileURLToPath, not URL.pathname: the latter percent-encodes spaces (e.g. a
// checkout under "Aftervue AI/"), the comparison fails, and the CLI silently
// does nothing.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err);
    process.exit(1);
  });
}
