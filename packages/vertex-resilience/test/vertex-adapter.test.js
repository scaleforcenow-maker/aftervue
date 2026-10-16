import test from 'node:test';
import assert from 'node:assert/strict';
import { createVertexAdapter, parseRetryAfter } from '../src/vertex-adapter.js';
import { ClientError } from '../src/errors.js';

function fakeResponse(status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => JSON.parse(text),
    text: async () => text,
  };
}

const base = { projectId: 'example-project', accessTokenProvider: async () => 'test-token' };

test('builds the global and regional generateContent endpoints', () => {
  const g = createVertexAdapter({ ...base, fetchImpl: async () => fakeResponse(200, {}) });
  assert.equal(
    g.endpointFor('gemini-3-pro-image'),
    'https://aiplatform.googleapis.com/v1/projects/example-project/locations/global/publishers/google/models/gemini-3-pro-image:generateContent',
  );
  const r = createVertexAdapter({ ...base, location: 'us-central1', fetchImpl: async () => fakeResponse(200, {}) });
  assert.equal(
    r.endpointFor('gemini-3.1-flash-image'),
    'https://us-central1-aiplatform.googleapis.com/v1/projects/example-project/locations/us-central1/publishers/google/models/gemini-3.1-flash-image:generateContent',
  );
  assert.throws(() => g.endpointFor('../evil'), TypeError);
});

test('posts the caller-built body with a bearer token and returns parsed JSON', async () => {
  const seen = [];
  const adapter = createVertexAdapter({
    ...base,
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return fakeResponse(200, { candidates: [{ content: { parts: [{ text: 'hi' }] } }] });
    },
  });
  const body = { contents: [{ role: 'user', parts: [{ text: 'draw' }] }] };
  const out = await adapter.generate('gemini-3-pro-image', body);
  assert.deepEqual(out, { candidates: [{ content: { parts: [{ text: 'hi' }] } }] });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer test-token');
  assert.equal(seen[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(seen[0].init.body), body);
  assert.ok(seen[0].init.signal instanceof AbortSignal);
});

test('maps 429 with Retry-After and google.rpc status into ClientError without echoing the body', async () => {
  const adapter = createVertexAdapter({
    ...base,
    now: () => 0,
    fetchImpl: async () =>
      fakeResponse(
        429,
        { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded; prompt was SECRETPROMPT' } },
        { 'retry-after': '7' },
      ),
  });
  await assert.rejects(adapter.generate('gemini-3-pro-image', { prompt: 'SECRETPROMPT' }), (err) => {
    assert.ok(err instanceof ClientError);
    assert.equal(err.status, 429);
    assert.equal(err.code, 'RATE_LIMITED');
    assert.equal(err.retryAfterMs, 7000);
    assert.equal(err.vertexStatus, 'RESOURCE_EXHAUSTED');
    assert.equal(err.model, 'gemini-3-pro-image');
    assert.equal(err.retryable, true);
    assert.doesNotMatch(JSON.stringify({ ...err, message: err.message, stack: err.stack }), /SECRETPROMPT/);
    return true;
  });
});

test('maps 400 and 503 and non-JSON bodies', async () => {
  const mk = (status, body) => createVertexAdapter({ ...base, fetchImpl: async () => fakeResponse(status, body) });
  await assert.rejects(mk(400, { error: { status: 'INVALID_ARGUMENT', message: 'bad' } }).generate('m', {}), (err) => {
    assert.equal(err.status, 400);
    assert.equal(err.retryable, false);
    assert.equal(err.vertexStatus, 'INVALID_ARGUMENT');
    return true;
  });
  await assert.rejects(mk(503, '<html>upstream</html>').generate('m', {}), (err) => {
    assert.equal(err.status, 503);
    assert.equal(err.retryable, true);
    assert.equal(err.vertexStatus, undefined);
    return true;
  });
});

test('network failures become retryable status-0 errors; caller aborts rethrow the reason', async () => {
  const net = createVertexAdapter({
    ...base,
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });
  await assert.rejects(net.generate('m', {}), (err) => err instanceof ClientError && err.status === 0 && err.code === 'NETWORK' && err.retryable);

  const ctl = new AbortController();
  const reason = new Error('caller abort');
  const slow = createVertexAdapter({
    ...base,
    fetchImpl: (url, { signal }) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
  });
  const p = slow.generate('m', {}, { signal: ctl.signal });
  ctl.abort(reason);
  await assert.rejects(p, reason);
});

test('times out a hung call with a retryable TIMEOUT error', async () => {
  const hung = createVertexAdapter({
    ...base,
    timeoutMs: 5,
    fetchImpl: (url, { signal }) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
  });
  await assert.rejects(hung.generate('m', {}), (err) => err instanceof ClientError && err.code === 'TIMEOUT' && err.retryable);
});

test('parseRetryAfter handles seconds, HTTP dates, and junk', () => {
  assert.equal(parseRetryAfter('12'), 12_000);
  assert.equal(parseRetryAfter(' 3 '), 3000);
  const now = Date.UTC(2026, 8, 16, 12, 0, 0);
  assert.equal(parseRetryAfter('Wed, 16 Sep 2026 12:00:30 GMT', now), 30_000);
  assert.equal(parseRetryAfter('Wed, 16 Sep 2026 11:00:00 GMT', now), 0);
  assert.equal(parseRetryAfter('soon'), undefined);
  assert.equal(parseRetryAfter(null), undefined);
});

test('validates construction options', () => {
  assert.throws(() => createVertexAdapter({ accessTokenProvider: async () => 't' }), TypeError);
  assert.throws(() => createVertexAdapter({ projectId: 'p' }), TypeError);
  assert.throws(() => createVertexAdapter({ projectId: 'p', accessTokenProvider: () => 't', fetchImpl: 'nope' }), TypeError);
});
