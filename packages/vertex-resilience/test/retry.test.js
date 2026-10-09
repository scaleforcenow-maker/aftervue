import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetryPolicy } from '../src/retry.js';

test('full-jitter schedule: random() * min(cap, base * 2^(n-1))', () => {
  const upper = createRetryPolicy({ baseMs: 100, capMs: 500, random: () => 0.999999 });
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => upper.delayMs(n)), [99, 199, 399, 499, 499]);

  const lower = createRetryPolicy({ baseMs: 100, capMs: 500, random: () => 0 });
  assert.deepEqual([1, 2, 3].map((n) => lower.delayMs(n)), [0, 0, 0]);

  const mid = createRetryPolicy({ baseMs: 1000, capMs: 8000, random: () => 0.5 });
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => mid.delayMs(n)), [500, 1000, 2000, 4000, 4000]);
});

test('Retry-After raises the delay but never lowers it', () => {
  const p = createRetryPolicy({ baseMs: 100, capMs: 500, random: () => 0.5 });
  assert.equal(p.delayMs(1), 50);
  assert.equal(p.delayMs(1, { retryAfterMs: 7000 }), 7000, 'Retry-After wins even above the cap');
  assert.equal(p.delayMs(1, { retryAfterMs: 10 }), 50, 'jitter wins when larger');
  assert.equal(p.delayMs(1, { retryAfterMs: Number.NaN }), 50);
});

test('retries 429 and 503 only; never other 4xx', () => {
  const p = createRetryPolicy();
  const err = (status) => Object.assign(new Error('x'), { status });
  assert.equal(p.shouldRetry(err(429)), true);
  assert.equal(p.shouldRetry(err(503)), true);
  for (const s of [400, 401, 403, 404, 413, 422, 500, 502, 504]) assert.equal(p.shouldRetry(err(s)), false, `status ${s}`);
  assert.equal(p.shouldRetry(Object.assign(new Error('net'), { retryable: true })), true, 'flagged network errors');
  assert.equal(p.shouldRetry(new Error('plain')), false);
  assert.equal(p.shouldRetry(Object.assign(new Error('x'), { statusCode: 429 })), true, 'statusCode alias');
  assert.equal(p.shouldRetry(Object.assign(new Error('x'), { response: { status: 503 } })), true, 'response.status alias');
});

test('configured retryOnStatuses cannot opt a 4xx other than 429 into retries', () => {
  const p = createRetryPolicy({ retryOnStatuses: [400, 408, 429, 500, 503] });
  assert.deepEqual([...p.retryOnStatuses].sort(), [429, 500, 503]);
  assert.equal(p.shouldRetry(Object.assign(new Error('x'), { status: 400 })), false);
  assert.equal(p.shouldRetry(Object.assign(new Error('x'), { status: 500 })), true);
});

test('validates options', () => {
  assert.throws(() => createRetryPolicy({ maxAttempts: 0 }), TypeError);
  assert.throws(() => createRetryPolicy({ baseMs: -1 }), TypeError);
});
