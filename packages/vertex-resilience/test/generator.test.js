import test from 'node:test';
import assert from 'node:assert/strict';
import { createResilientGenerator } from '../src/generator.js';
import { DeadlineError, ModelsExhaustedError, QueueFullError } from '../src/errors.js';
import { createFakeClock, scriptedClient, httpError } from './helpers/fake-clock.js';

const PRO = 'gemini-3-pro-image';
const FLASH = 'gemini-3.1-flash-image';
const MODELS = [PRO, FLASH];

function setup(plan, opts = {}) {
  const clock = createFakeClock();
  const events = [];
  const client = scriptedClient(plan, { clock });
  const gen = createResilientGenerator({
    models: MODELS,
    client,
    clock,
    random: () => 0,
    retry: { baseMs: 100, capMs: 1000, maxAttempts: 3 },
    deadlineMs: 45_000,
    onEvent: (e) => events.push(e),
    ...opts,
  });
  return { gen, clock, events, client };
}

const types = (events) => events.map((e) => e.type);

test('serves from the primary model when it is healthy', async () => {
  const { gen, clock, events, client } = setup({ [PRO]: [{ delayMs: 120, result: { img: 1 } }] });
  const p = gen.generate({ prompt: 'x' });
  await clock.advance(200);
  const out = await p;
  assert.deepEqual(out.result, { img: 1 });
  assert.equal(out.servedBy, PRO);
  assert.equal(out.degraded, false);
  assert.equal(out.attempts, 1);
  assert.equal(out.fallbackReason, null);
  assert.equal(out.latencyMs, 120);
  assert.equal(out.bypassed, false);
  assert.equal(client.calls.length, 1);
  assert.deepEqual(types(events), ['queued', 'started', 'attempt', 'success']);
  const snap = gen.snapshot();
  assert.equal(snap.perModel[PRO].attempts, 1);
  assert.equal(snap.perModel[PRO].success, 1);
  assert.equal(snap.perModel[PRO].latencyMs.p50, 120);
  assert.equal(snap.perModel[PRO].latencyMs.p95, 120);
  assert.equal(snap.perModel[PRO].latencyMs.samples, 1);
  assert.equal(snap.perModel[PRO].tokensAvailable, 2);
  assert.equal(snap.perModel[FLASH].tokensAvailable, 3);
  assert.equal(snap.totals.requests, 1);
  assert.equal(snap.totals.served, 1);
  assert.equal(snap.totals.degraded, 0);
  assert.equal(snap.queue.waiting, 0);
});

test('falls back to the next model after 429s exhaust the retries', async () => {
  const { gen, clock, events, client } = setup({ [PRO]: [{ error: httpError(429) }], [FLASH]: [{ result: { img: 'flash' } }] });
  const p = gen.generate({ prompt: 'x' });
  await clock.advance(5000);
  const out = await p;
  assert.equal(out.servedBy, FLASH);
  assert.equal(out.degraded, true);
  assert.equal(out.fallbackReason, 'http_429');
  assert.equal(out.attempts, 4, 'three attempts on primary, one on fallback');
  assert.deepEqual(
    client.calls.map((c) => c.model),
    [PRO, PRO, PRO, FLASH],
  );
  const snap = gen.snapshot();
  assert.equal(snap.perModel[PRO].attempts, 3);
  assert.equal(snap.perModel[PRO].http429, 3);
  assert.equal(snap.perModel[PRO].success, 0);
  assert.equal(snap.perModel[FLASH].success, 1);
  assert.equal(snap.perModel[FLASH].fallbacks, 1);
  assert.equal(snap.totals.degraded, 1);
  const fallback = events.find((e) => e.type === 'fallback');
  assert.deepEqual({ from: fallback.from, to: fallback.to, reason: fallback.reason }, { from: PRO, to: FLASH, reason: 'http_429' });
  assert.equal(events.filter((e) => e.type === 'retry').length, 2);
  assert.ok(events.some((e) => e.type === 'model_failed' && e.model === PRO && e.status === 429));
});

test('503 is retried and then falls back too', async () => {
  const { gen, clock } = setup({ [PRO]: [{ error: httpError(503) }], [FLASH]: [{ result: 1 }] });
  const p = gen.generate({});
  await clock.advance(5000);
  const out = await p;
  assert.equal(out.servedBy, FLASH);
  assert.equal(out.fallbackReason, 'http_503');
  assert.equal(gen.snapshot().perModel[PRO].http503, 3);
});

test('never retries or falls back on 400 (or any 4xx other than 429, or 500)', async () => {
  for (const status of [400, 401, 403, 404, 413, 500]) {
    const err = httpError(status);
    const { gen, clock, events, client } = setup({ [PRO]: [{ error: err }], [FLASH]: [{ result: 'nope' }] });
    const p = gen.generate({ prompt: 'x' });
    const rejection = assert.rejects(p, (e) => e === err);
    await clock.advance(10_000);
    await rejection;
    assert.equal(client.calls.length, 1, `status ${status}: exactly one call`);
    assert.equal(client.calls[0].model, PRO);
    assert.equal(gen.snapshot().perModel[PRO].otherErrors, 1);
    assert.equal(gen.snapshot().perModel[FLASH].attempts, 0);
    assert.equal(gen.snapshot().totals.failed, 1);
    assert.ok(events.some((e) => e.type === 'client_error' && e.status === status));
    assert.ok(events.some((e) => e.type === 'error' && e.status === status));
  }
});

test('honours Retry-After on a 429 before retrying the same model', async () => {
  const { gen, clock, events, client } = setup(
    { [PRO]: [{ error: httpError(429, { retryAfterMs: 5000 }) }, { result: 'ok' }] },
    { random: () => 0.5 },
  );
  const p = gen.generate({});
  await clock.advance(4999);
  assert.equal(client.calls.length, 1, 'still waiting on Retry-After');
  await clock.advance(1);
  const out = await p;
  assert.equal(client.calls.length, 2);
  assert.equal(out.servedBy, PRO);
  assert.equal(out.degraded, false);
  assert.equal(out.attempts, 2);
  const retry = events.find((e) => e.type === 'retry');
  assert.equal(retry.delayMs, 5000);
  assert.equal(retry.retryAfterMs, 5000);
});

test('backoff between retries follows the jittered schedule', async () => {
  const { clock, events, gen } = setup(
    { [PRO]: [{ error: httpError(429) }, { error: httpError(429) }, { result: 'ok' }] },
    { random: () => 0.5, retry: { baseMs: 100, capMs: 1000, maxAttempts: 3 } },
  );
  const p = gen.generate({});
  await clock.advance(1000);
  await p;
  assert.deepEqual(
    events.filter((e) => e.type === 'retry').map((e) => e.delayMs),
    [50, 100],
  );
});

test('falls back immediately when the primary bucket is empty and the fallback has tokens', async () => {
  const { gen, clock, client } = setup(
    { [PRO]: [{ result: 'pro' }], [FLASH]: [{ result: 'flash' }] },
    { limiter: { ratePerMinute: 2, burst: 1 } },
  );
  const a = gen.generate({});
  const b = gen.generate({});
  await clock.flush();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.servedBy, PRO);
  assert.equal(ra.degraded, false);
  assert.equal(rb.servedBy, FLASH);
  assert.equal(rb.degraded, true);
  assert.equal(rb.fallbackReason, 'bucket_empty');
  assert.deepEqual(client.calls.map((c) => c.model), [PRO, FLASH]);

  // Both buckets empty: the third request waits for the earliest refill (30 s), then uses the primary.
  const c = gen.generate({});
  await clock.advance(29_999);
  assert.equal(client.calls.length, 2);
  await clock.advance(1);
  const rc = await c;
  assert.equal(rc.servedBy, PRO);
  assert.equal(rc.degraded, false);
  assert.equal(rc.waitedMs, 30_000);
});

test('a 429 whose retry would wait on an empty bucket falls back right away when a sibling can serve', async () => {
  const { gen, clock, client } = setup(
    { [PRO]: [{ error: httpError(429) }], [FLASH]: [{ result: 'flash' }] },
    { limiter: { ratePerMinute: 2, burst: 1 } },
  );
  const p = gen.generate({});
  await clock.advance(10);
  const out = await p;
  assert.equal(out.servedBy, FLASH);
  assert.equal(out.fallbackReason, 'http_429');
  assert.equal(out.attempts, 2);
  assert.deepEqual(client.calls.map((c) => c.model), [PRO, FLASH]);
});

test('a 429 waits for the bucket refill when no sibling can serve', async () => {
  const { gen, clock, client } = setup(
    { [PRO]: [{ error: httpError(429) }, { result: 'pro' }], [FLASH]: [{ result: 'flash' }] },
    { limiter: { ratePerMinute: 2, burst: 1 } },
  );
  gen.limiter.drain(FLASH);
  const p = gen.generate({});
  await clock.advance(29_999);
  assert.equal(client.calls.length, 1);
  await clock.advance(1);
  const out = await p;
  assert.equal(out.servedBy, PRO);
  assert.equal(out.attempts, 2);
});

test('throws ModelsExhaustedError when every model fails after retries', async () => {
  const { gen, clock } = setup({ [PRO]: [{ error: httpError(429) }], [FLASH]: [{ error: httpError(429) }] }, { retry: { baseMs: 10, maxAttempts: 2 } });
  const p = gen.generate({});
  const rejection = assert.rejects(p, (err) => {
    assert.ok(err instanceof ModelsExhaustedError);
    assert.equal(err.code, 'MODELS_EXHAUSTED');
    assert.equal(err.attempts, 4);
    assert.deepEqual(err.causes, [
      { model: PRO, reason: 'http_429', status: 429, attempts: 2 },
      { model: FLASH, reason: 'http_429', status: 429, attempts: 2 },
    ]);
    return true;
  });
  await clock.advance(5000);
  await rejection;
  assert.equal(gen.snapshot().totals.failed, 1);
});

test('rejects fast with QueueFullError beyond maxDepth, with a wait estimate', async () => {
  const { gen, clock, events } = setup({ [PRO]: [{ hang: true }], [FLASH]: [{ hang: true }] }, { queue: { concurrency: 1, maxDepth: 1 } });
  const first = gen.generate({});
  const second = gen.generate({});
  const eventually = Promise.all([assert.rejects(first, DeadlineError), assert.rejects(second, DeadlineError)]);
  await clock.flush();
  await assert.rejects(gen.generate({}), (err) => {
    assert.ok(err instanceof QueueFullError);
    assert.equal(err.queueDepth, 1);
    assert.equal(err.maxDepth, 1);
    assert.equal(typeof err.estimatedWaitMs, 'number');
    return true;
  });
  const snap = gen.snapshot();
  assert.equal(snap.totals.queueFull, 1);
  assert.equal(snap.queue.waiting, 1);
  assert.equal(snap.queue.running, 1);
  assert.ok(events.some((e) => e.type === 'queue_full' && e.queueDepth === 1));
  await clock.advance(45_000);
  await eventually;
});

test('deadline while waiting for a token reports an honest estimate from bucket refill', async () => {
  const { gen, clock, events } = setup(
    { [PRO]: [{ hang: true }], [FLASH]: [{ hang: true }] },
    { limiter: { ratePerMinute: 2, burst: 1 }, deadlineMs: 1000, queue: { concurrency: 3 } },
  );
  const a = gen.generate({});
  const b = gen.generate({});
  const eventually = Promise.all([
    assert.rejects(a, (err) => err instanceof DeadlineError && err.model === PRO && err.phase === `calling ${PRO}` && err.attempts === 1),
    assert.rejects(b, (err) => err instanceof DeadlineError && err.model === FLASH),
  ]);
  await clock.flush();
  // Both buckets are empty and refill in 30 s, which is past the 1 s budget: fail now, honestly.
  await assert.rejects(gen.generate({}), (err) => {
    assert.ok(err instanceof DeadlineError);
    assert.equal(err.code, 'DEADLINE');
    assert.equal(err.deadlineMs, 1000);
    assert.equal(err.estimatedWaitMs, 30_000);
    assert.equal(err.phase, 'waiting for rate-limit token');
    assert.equal(err.model, PRO);
    assert.equal(err.attempts, 0);
    assert.equal(err.retryable, true);
    return true;
  });
  // The two in-flight calls hit the wall clock deadline.
  await clock.advance(1000);
  await eventually;
  const snap = gen.snapshot();
  assert.equal(snap.totals.deadlineExceeded, 3);
  assert.equal(snap.perModel[PRO].deadlineExceeded, 2);
  assert.equal(snap.perModel[FLASH].deadlineExceeded, 1);
  assert.equal(events.filter((e) => e.type === 'deadline').length, 3);
});

test('deadline while queued reports the queue position and uses observed latency', async () => {
  // A client that ignores the abort signal keeps the slot busy, so b and c are still queued
  // when their deadlines fire. The caller must still get the DeadlineError on time.
  const { gen, clock } = setup({ [PRO]: [{ hang: true, ignoreAbort: true }] }, { queue: { concurrency: 1, maxDepth: 5 }, deadlineMs: 1000 });
  const a = gen.generate({});
  const b = gen.generate({});
  const c = gen.generate({});
  const eventually = Promise.all([
    assert.rejects(a, (err) => err instanceof DeadlineError && err.phase === `calling ${PRO}` && err.attempts === 1),
    assert.rejects(b, (err) => {
      assert.ok(err instanceof DeadlineError);
      assert.equal(err.phase, 'queued');
      assert.equal(err.queuePosition, 0);
      assert.equal(err.model, null);
      assert.equal(err.attempts, 0);
      return true;
    }),
    assert.rejects(c, (err) => err instanceof DeadlineError && err.phase === 'queued' && err.queuePosition === 0), // b already left
  ]);
  await clock.flush();
  assert.equal(gen.estimate().queuePosition, 2);
  await clock.advance(1000);
  await eventually;
  assert.equal(gen.queue.size(), 0, 'queued requests left the queue when their deadlines fired');
  assert.equal(gen.queue.running(), 1, 'the slot stays busy until the misbehaving client returns');

  // After a successful slow call, estimates include the observed median latency.
  const { gen: g2, clock: c2 } = setup({ [PRO]: [{ delayMs: 5000, result: 'slow' }] }, { queue: { concurrency: 1, maxDepth: 5 } });
  const first = g2.generate({});
  await c2.advance(5000);
  await first;
  const inflight = g2.generate({});
  const queued = g2.generate({});
  await c2.flush();
  assert.equal(g2.estimate().queuePosition, 1);
  assert.equal(g2.estimate().estimatedWaitMs, 5000, 'one queued request ahead at a 5 s median');
  assert.equal(g2.snapshot().estimatedWaitMs, 5000);
  await c2.advance(10_000);
  await Promise.all([inflight, queued]);
});

test('failFastOnEstimate rejects at enqueue when the estimate already exceeds the budget', async () => {
  const { gen, clock, events } = setup(
    { [PRO]: [{ hang: true }], [FLASH]: [{ hang: true }] },
    { limiter: { ratePerMinute: 2, burst: 1 }, deadlineMs: 1000, failFastOnEstimate: true, queue: { concurrency: 1, maxDepth: 5 } },
  );
  const a = gen.generate({});
  const eventually = assert.rejects(a, DeadlineError);
  await clock.flush();
  // Drain the sibling too so no token can arrive within budget.
  gen.limiter.drain(FLASH);
  await assert.rejects(gen.generate({}), (err) => {
    assert.ok(err instanceof DeadlineError);
    assert.equal(err.phase, 'queued');
    assert.equal(err.estimatedWaitMs, 30_000);
    assert.equal(err.queuePosition, 0);
    return true;
  });
  assert.equal(gen.queue.size(), 0, 'the fail-fast request never entered the queue');
  assert.ok(events.some((e) => e.type === 'deadline' && e.phase === 'queued'));
  assert.equal(gen.snapshot().totals.deadlineExceeded, 1);
  await clock.advance(1000);
  await eventually;
});

test('caller abort while queued rejects with the caller reason and frees the slot', async () => {
  const { gen, clock, events } = setup({ [PRO]: [{ hang: true }] }, { queue: { concurrency: 1, maxDepth: 5 } });
  const a = gen.generate({});
  const eventually = assert.rejects(a, DeadlineError);
  const ctl = new AbortController();
  const reason = new Error('user navigated away');
  const b = gen.generate({}, { signal: ctl.signal });
  await clock.flush();
  assert.equal(gen.queue.size(), 1);
  ctl.abort(reason);
  await assert.rejects(b, reason);
  assert.equal(gen.queue.size(), 0);
  assert.ok(events.some((e) => e.type === 'aborted'));
  const pre = new AbortController();
  pre.abort(reason);
  await assert.rejects(gen.generate({}, { signal: pre.signal }), reason);
  await clock.advance(45_000);
  await eventually;
});

test('default concurrency is one slot per model', async () => {
  const { gen, clock, client } = setup({ [PRO]: [{ hang: true }], [FLASH]: [{ hang: true }] });
  assert.equal(gen.queue.concurrency, 2);
  const a = gen.generate({});
  const b = gen.generate({});
  const c = gen.generate({});
  const eventually = Promise.allSettled([a, b, c]);
  await clock.flush();
  assert.equal(client.calls.length, 2);
  assert.equal(gen.queue.size(), 1);
  await clock.advance(45_000);
  const settled = await eventually;
  assert.deepEqual(settled.map((s) => s.status), ['rejected', 'rejected', 'rejected']);
});

test('enabled:false calls the client directly with no queue, limiter, retry or fallback', async () => {
  const err429 = httpError(429);
  const { gen, clock, events, client } = setup({ [PRO]: [{ result: 'direct' }, { error: err429 }], [FLASH]: [{ result: 'never' }] }, { enabled: false });
  const request = { prompt: 'x' };
  const out = await gen.generate(request);
  assert.deepEqual(out, { result: 'direct', servedBy: PRO, degraded: false, attempts: 1, fallbackReason: null, bypassed: true });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].model, PRO);
  assert.equal(client.calls[0].request, request);
  assert.equal(gen.limiter.available(PRO), 3, 'limiter untouched');
  assert.equal(gen.queue.size() + gen.queue.running(), 0);

  const p = gen.generate(request);
  const rejection = assert.rejects(p, (e) => e === err429);
  await clock.advance(10_000);
  await rejection;
  assert.equal(client.calls.length, 2, 'no retry, no fallback');
  assert.deepEqual(types(events), ['bypass', 'bypass']);
  const snap = gen.snapshot();
  assert.equal(snap.enabled, false);
  assert.equal(snap.totals.bypassed, 2);
  assert.equal(snap.totals.requests, 0);
});

test('a throwing onEvent hook never breaks generation', async () => {
  const { gen, clock } = setup({ [PRO]: [{ result: 'ok' }] }, {
    onEvent: () => {
      throw new Error('observer bug');
    },
  });
  const p = gen.generate({});
  await clock.advance(10);
  assert.equal((await p).result, 'ok');
});

test('request payloads never appear in events, errors, or the snapshot', async () => {
  const SECRET = 'SECRET_PAYLOAD_MARKER';
  const request = {
    image: `data:image/png;base64,${SECRET}_IMAGE`,
    prompt: `${SECRET}_PROMPT`,
    contents: [{ parts: [{ inlineData: { data: `${SECRET}_INLINE` } }] }],
  };
  const seen = [];
  const serialize = (x) => {
    const own = {};
    if (x && typeof x === 'object') for (const k of Object.getOwnPropertyNames(x)) own[k] = x[k];
    return JSON.stringify(own, (k, v) => (v instanceof Error ? serialize(v) : v));
  };

  const scenarios = [
    { plan: { [PRO]: [{ result: 'ok' }] }, opts: {} },
    { plan: { [PRO]: [{ error: httpError(429) }], [FLASH]: [{ result: 'ok' }] }, opts: {} },
    { plan: { [PRO]: [{ error: httpError(429) }], [FLASH]: [{ error: httpError(503) }] }, opts: { retry: { baseMs: 1, maxAttempts: 2 } } },
    { plan: { [PRO]: [{ error: httpError(400) }] }, opts: {} },
    { plan: { [PRO]: [{ hang: true }], [FLASH]: [{ hang: true }] }, opts: { deadlineMs: 500 } },
    { plan: { [PRO]: [{ hang: true }], [FLASH]: [{ hang: true }] }, opts: { queue: { concurrency: 1, maxDepth: 0 } } },
    { plan: { [PRO]: [{ result: 'ok' }] }, opts: { enabled: false } },
  ];

  for (const { plan, opts } of scenarios) {
    const { gen, clock, events } = setup(plan, opts);
    const p = gen.generate(request).then(
      (v) => seen.push(serialize(v) ?? ''),
      (e) => seen.push(serialize(e)),
    );
    await clock.advance(60_000);
    await p;
    for (const e of events) seen.push(serialize(e));
    seen.push(JSON.stringify(gen.snapshot()));
    seen.push(JSON.stringify(gen.estimate()));
  }
  assert.ok(seen.length > 20, 'collected output from every scenario');
  for (const s of seen) {
    assert.equal(s.includes(SECRET), false, `payload leaked: ${s.slice(0, 200)}`);
    assert.equal(s.includes('inlineData'), false);
  }
  // Sanity check that the serializer would have caught a leak.
  assert.ok(serialize({ request }).includes(SECRET));
});

test('validates options', () => {
  const client = { generate: async () => ({}) };
  assert.throws(() => createResilientGenerator({ models: [], client }), TypeError);
  assert.throws(() => createResilientGenerator({ models: [PRO] }), TypeError);
  assert.throws(() => createResilientGenerator({ models: [PRO], client, deadlineMs: 0 }), TypeError);
});
