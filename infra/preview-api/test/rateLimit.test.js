import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createTokenBucket, rateLimit } from '../src/middleware/rateLimit.js';
import { serve } from './helpers.js';

test('token bucket: capacity, refill and retry-after', () => {
  let t = 0;
  const b = createTokenBucket({ capacity: 2, refillPerMinute: 60, now: () => t }); // 1 token/s
  assert.equal(b.take('a').allowed, true);
  assert.equal(b.take('a').allowed, true);
  const denied = b.take('a');
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfterSeconds, 1);
  t = 1000;
  assert.equal(b.take('a').allowed, true);
  assert.equal(b.take('b').allowed, true, 'keys are independent');
  t = 10_000;
  assert.equal(b.take('a').remaining, 1, 'refill caps at capacity');
});

test('token bucket prunes idle keys', () => {
  let t = 0;
  const b = createTokenBucket({ capacity: 2, refillPerMinute: 60, now: () => t });
  b.take('a');
  b.take('b');
  assert.equal(b.size(), 2);
  t = 60_000;
  b.prune();
  assert.equal(b.size(), 0);
});

test('middleware keys on client IP behind one trusted proxy and returns 429', async () => {
  let t = 0;
  const app = express();
  app.set('trust proxy', 1);
  app.use(rateLimit({ capacity: 2, refillPerMinute: 60, now: () => t }));
  app.post('/x', (req, res) => res.json({ ip: req.ip }));
  const s = await serve(app);
  try {
    const hit = (ip) => s.call('/x', { method: 'POST', headers: { 'X-Forwarded-For': ip } });
    assert.equal((await hit('203.0.113.5')).status, 200);
    assert.equal((await hit('203.0.113.5')).status, 200);
    const limited = await hit('203.0.113.5');
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '1');
    assert.equal(limited.headers.get('ratelimit-remaining'), '0');
    assert.deepEqual(await limited.json(), { error: 'rate_limited', retryAfterSeconds: 1 });
    assert.equal((await hit('203.0.113.9')).status, 200, 'other IP unaffected');
    t = 1000;
    assert.equal((await hit('203.0.113.5')).status, 200, 'refilled after 1s');
  } finally {
    await s.close();
  }
});
