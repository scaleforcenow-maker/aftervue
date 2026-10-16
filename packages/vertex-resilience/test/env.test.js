import test from 'node:test';
import assert from 'node:assert/strict';
import { optionsFromEnv } from '../src/env.js';

test('returns only the keys present in env', () => {
  assert.deepEqual(optionsFromEnv({}), {});
  assert.deepEqual(optionsFromEnv({ VERTEX_RESILIENCE_ENABLED: 'false' }), { enabled: false });
  assert.deepEqual(optionsFromEnv({ VERTEX_RESILIENCE_ENABLED: '0' }), { enabled: false });
  assert.deepEqual(optionsFromEnv({ VERTEX_RESILIENCE_ENABLED: 'true' }), { enabled: true });
});

test('parses the full set', () => {
  const env = {
    VERTEX_RESILIENCE_MODELS: 'gemini-3-pro-image, gemini-3.1-flash-image',
    VERTEX_RESILIENCE_RATE_PER_MIN: '2',
    VERTEX_RESILIENCE_BURST: '3',
    VERTEX_RESILIENCE_CONCURRENCY: '2',
    VERTEX_RESILIENCE_QUEUE_DEPTH: '10',
    VERTEX_RESILIENCE_DEADLINE_MS: '45000',
    VERTEX_RESILIENCE_RETRY_ATTEMPTS: '3',
    VERTEX_RESILIENCE_RETRY_BASE_MS: '1000',
    VERTEX_RESILIENCE_RETRY_CAP_MS: '8000',
    VERTEX_RESILIENCE_FAIL_FAST: 'yes',
  };
  assert.deepEqual(optionsFromEnv(env), {
    models: ['gemini-3-pro-image', 'gemini-3.1-flash-image'],
    limiter: { ratePerMinute: 2, burst: 3 },
    queue: { concurrency: 2, maxDepth: 10 },
    deadlineMs: 45000,
    retry: { maxAttempts: 3, baseMs: 1000, capMs: 8000 },
    failFastOnEstimate: true,
  });
});

test('rejects non-numeric numbers', () => {
  assert.throws(() => optionsFromEnv({ VERTEX_RESILIENCE_DEADLINE_MS: 'forty' }), /DEADLINE_MS/);
});
