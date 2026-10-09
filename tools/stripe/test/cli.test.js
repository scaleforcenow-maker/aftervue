import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertModeAllowed, parseCli, UsageError } from '../provision.js';

const run = promisify(execFile);
const CLI = new URL('../provision.js', import.meta.url).pathname;
const SAMPLE = new URL('../catalog.sample.json', import.meta.url).pathname;

describe('mode safety', () => {
  test('live mode is refused without STRIPE_ALLOW_LIVE=1', () => {
    assert.throws(() => assertModeAllowed({ mode: 'live', key: 'sk_live_abc', env: {}, dryRun: false }), (e) => e instanceof UsageError && /STRIPE_ALLOW_LIVE=1/.test(e.message));
    assert.throws(() => assertModeAllowed({ mode: 'live', key: 'sk_live_abc', env: { STRIPE_ALLOW_LIVE: 'true' }, dryRun: false }), UsageError);
    assert.doesNotThrow(() => assertModeAllowed({ mode: 'live', key: 'sk_live_abc', env: { STRIPE_ALLOW_LIVE: '1' }, dryRun: true }), 'allowed when both are set');
  });

  test('live mode with STRIPE_ALLOW_LIVE=1 and a live key is allowed', () => {
    assert.equal(assertModeAllowed({ mode: 'live', key: 'rk_live_abc', env: { STRIPE_ALLOW_LIVE: '1' }, dryRun: false }), 'online');
  });

  test('key prefix must match the requested mode', () => {
    assert.throws(() => assertModeAllowed({ mode: 'test', key: 'sk_live_abc', env: {}, dryRun: false }), /live-mode key but --mode test/);
    assert.throws(() => assertModeAllowed({ mode: 'live', key: 'rk_test_abc', env: { STRIPE_ALLOW_LIVE: '1' }, dryRun: false }), /test-mode key but --mode live/);
    assert.throws(() => assertModeAllowed({ mode: 'test', key: 'pk_test_abc', env: {}, dryRun: false }), /must start with/);
    assert.equal(assertModeAllowed({ mode: 'test', key: 'rk_test_abc', env: {}, dryRun: false }), 'online');
  });

  test('a missing key is only acceptable for a dry run', () => {
    assert.equal(assertModeAllowed({ mode: 'test', key: undefined, env: {}, dryRun: true }), 'offline');
    assert.throws(() => assertModeAllowed({ mode: 'test', key: undefined, env: {}, dryRun: false }), /STRIPE_SECRET_KEY is not set/);
  });

  test('--mode is required and validated', () => {
    assert.throws(() => assertModeAllowed({ mode: undefined, key: 'sk_test_x', env: {}, dryRun: true }), /--mode must be/);
    assert.throws(() => assertModeAllowed({ mode: 'prod', key: 'sk_test_x', env: {}, dryRun: true }), /--mode must be/);
  });

  test('parseCli reads every flag', () => {
    assert.deepEqual(parseCli(['--catalog', 'x.json', '--mode', 'test', '--dry-run', '--prune-archived']), {
      catalog: 'x.json', mode: 'test', dryRun: true, pruneArchived: true, help: false,
    });
    assert.throws(() => parseCli(['--bogus']));
  });
});

describe('CLI process', () => {
  const env = { PATH: process.env.PATH }; // no STRIPE_* leaks from the host

  test('offline dry run against the sample prints a create plan and exits 0', async () => {
    const { stdout } = await run(process.execPath, [CLI, '--catalog', SAMPLE, '--mode', 'test', '--dry-run'], { env });
    assert.match(stdout, /DRY RUN - no changes will be made/);
    assert.match(stdout, /planning against an empty account/);
    assert.match(stdout, /CREATE\s+product\s+app\s+"Aftervue \(App\)" tax_code=txcd_10103001/);
    assert.match(stdout, /CREATE\s+price\s+ads_usage_anchor\s+usage_anchor recurring\/month \$0\.00 acct=4031/);
    assert.match(stdout, /CREATE\s+coupon\s+trial_conversion_5\s+5% off, duration=once/);
    assert.match(stdout, /create:product=11\s+create:price=54\s+create:coupon=1/);
  });

  test('live mode without STRIPE_ALLOW_LIVE exits 2 and touches nothing', async () => {
    await assert.rejects(
      run(process.execPath, [CLI, '--catalog', SAMPLE, '--mode', 'live'], { env: { ...env, STRIPE_SECRET_KEY: 'sk_live_fake' } }),
      (e) => e.code === 2 && /refusing to run in live mode/.test(e.stderr),
    );
  });

  test('a non-dry run without a key exits 2 before loading stripe', async () => {
    await assert.rejects(
      run(process.execPath, [CLI, '--catalog', SAMPLE, '--mode', 'test'], { env }),
      (e) => e.code === 2 && /STRIPE_SECRET_KEY is not set/.test(e.stderr),
    );
  });

  test('an invalid catalog exits 2 with the problem list', async () => {
    const { writeFile, rm, mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const dir = await mkdtemp(path.join(tmpdir(), 'catalog-'));
    const file = path.join(dir, 'catalog.json');
    const raw = JSON.parse(await (await import('node:fs/promises')).readFile(SAMPLE, 'utf8'));
    raw.products[0].prices[0].amount = 1.5;
    await writeFile(file, JSON.stringify(raw));
    try {
      await assert.rejects(
        run(process.execPath, [CLI, '--catalog', file, '--mode', 'test', '--dry-run'], { env }),
        (e) => e.code === 2 && /Invalid catalog \(1 problem\)/.test(e.stderr) && /must be an integer number of cents/.test(e.stderr),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
