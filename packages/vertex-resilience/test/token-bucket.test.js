import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/token-bucket.js';
import { createFakeClock } from './helpers/fake-clock.js';

test('bucket starts full at burst and refills at ratePerMinute', async () => {
  const clock = createFakeClock();
  const limiter = createRateLimiter({ ratePerMinute: 2, burst: 3, clock });

  assert.equal(limiter.available('m'), 3);
  assert.equal(limiter.tryTake('m'), true);
  assert.equal(limiter.tryTake('m'), true);
  assert.equal(limiter.tryTake('m'), true);
  assert.equal(limiter.tryTake('m'), false);
  assert.equal(limiter.available('m'), 0);
  assert.equal(limiter.timeUntilToken('m'), 30_000);

  await clock.advance(29_999);
  assert.equal(limiter.available('m'), 0);
  await clock.advance(1);
  assert.equal(limiter.available('m'), 1);
  assert.equal(limiter.timeUntilToken('m'), 0);
  assert.equal(limiter.timeUntilToken('m', 2), 30_000);

  await clock.advance(30_000);
  assert.equal(limiter.available('m'), 2);

  await clock.advance(10 * 60_000);
  assert.equal(limiter.available('m'), 3, 'capped at burst');
});

test('buckets are independent per model and honour perModel overrides', () => {
  const clock = createFakeClock();
  const limiter = createRateLimiter({ ratePerMinute: 2, burst: 3, perModel: { fast: { burst: 5, ratePerMinute: 10 } }, clock });
  assert.equal(limiter.available('slow'), 3);
  assert.equal(limiter.available('fast'), 5);
  limiter.drain('slow');
  assert.equal(limiter.available('slow'), 0);
  assert.equal(limiter.available('fast'), 5);
  assert.equal(limiter.snapshot().fast.ratePerMinute, 10);
});

test('tokenArrivalTimes lists when each successive token appears', async () => {
  const clock = createFakeClock();
  const limiter = createRateLimiter({ ratePerMinute: 2, burst: 3, clock });
  assert.deepEqual(limiter.tokenArrivalTimes('m', 4), [0, 0, 0, 30_000]);
  limiter.tryTake('m');
  limiter.tryTake('m');
  limiter.tryTake('m');
  await clock.advance(15_000); // half a token
  assert.deepEqual(limiter.tokenArrivalTimes('m', 3), [15_000, 45_000, 75_000]);
});

test('rejects invalid configuration', () => {
  assert.throws(() => createRateLimiter({ ratePerMinute: 0 }), TypeError);
  assert.throws(() => createRateLimiter({ burst: 0 }), TypeError);
});
