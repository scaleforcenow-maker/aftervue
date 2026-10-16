import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { baseConfig, captureLogger, okTurnstile, serve } from './helpers.js';

const ORIGIN = 'https://app.example.test';
const b64 = 'A'.repeat(800);

function build({ config = baseConfig, deps = {} } = {}) {
  const { logger, lines } = captureLogger();
  const app = createApp({
    config,
    logger,
    deps: {
      verifyTurnstile: okTurnstile,
      getToken: async () => 'fake-token',
      resilience: async () => ({
        name: 'test',
        generateWithResilience: async ({ primary, call }) => ({ model: primary, fellBack: false, result: await call(primary) }),
      }),
      fetchImpl: async (url, init) => ({ ok: true, status: 200, json: async () => ({ url, auth: init.headers.Authorization }) }),
      ...deps,
    },
  });
  return { app, lines };
}

const gen = (s, body, headers = {}) =>
  s.call('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Turnstile-Response': 'tok', ...headers },
    body: JSON.stringify(body),
  });

test('/healthz is public and no-store', async () => {
  const s = await serve(build().app);
  try {
    const r = await s.call('/healthz');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await r.json(), { ok: true, service: 'preview-api', vertexLocation: 'global' });
  } finally {
    await s.close();
  }
});

test('/api/generate: no-store, calls the global Vertex endpoint with the metadata token, never logs the body', async () => {
  const { app, lines } = build();
  const s = await serve(app);
  try {
    const r = await gen(s, { prompt: 'secret prompt text', image: b64 });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('cache-control'), /no-store/);
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.model, 'primary-model');
    assert.equal(
      body.result.url,
      'https://aiplatform.googleapis.com/v1/projects/example-project/locations/global/publishers/google/models/primary-model:generateContent',
    );
    assert.equal(body.result.auth, 'Bearer fake-token');
    const logText = JSON.stringify(lines);
    assert.ok(!logText.includes('secret prompt text'), 'prompt must not be logged');
    assert.ok(!logText.includes(b64.slice(0, 64)), 'image must not be logged');
  } finally {
    await s.close();
  }
});

test('/api/generate: regional location builds a regional host', async () => {
  const { app } = build({ config: { ...baseConfig, vertexLocation: 'us-east4' } });
  const s = await serve(app);
  try {
    const body = await (await gen(s, { a: 1 })).json();
    assert.match(body.result.url, /^https:\/\/us-east4-aiplatform\.googleapis\.com\/v1\/projects\/example-project\/locations\/us-east4\//);
  } finally {
    await s.close();
  }
});

test('/api/generate: origin, rate limit and Turnstile gates apply in order', async () => {
  const { app } = build({ deps: { verifyTurnstile: async () => ({ success: false, errorCodes: ['bad'] }) } });
  const s = await serve(app);
  try {
    assert.equal((await gen(s, { a: 1 }, { Origin: 'https://evil.test' })).status, 403);
    // 3 tokens in baseConfig; Turnstile fails so each attempt is a 403 from Turnstile, 4th is 429.
    for (let i = 0; i < 3; i += 1) assert.equal((await gen(s, { a: 1 })).status, 403);
    assert.equal((await gen(s, { a: 1 })).status, 429);
  } finally {
    await s.close();
  }
});

test('/api/generate: GET is 405, non-object body is 400, upstream 429 becomes 503', async () => {
  const { app, lines } = build({
    deps: { fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) },
  });
  const s = await serve(app);
  try {
    const get = await s.call('/api/generate', { headers: { Origin: ORIGIN } });
    assert.equal(get.status, 405);
    const bad = await gen(s, [1, 2]);
    assert.equal(bad.status, 400);
    assert.deepEqual(await bad.json(), { error: 'invalid_body' });
    const exhausted = await gen(s, { a: 1 });
    assert.equal(exhausted.status, 503);
    assert.deepEqual(await exhausted.json(), { error: 'vertex_error' });
    assert.ok(!JSON.stringify(lines).includes('"a":1'), 'body never logged on error paths');
  } finally {
    await s.close();
  }
});

test('/api/generate: oversized body is 413 and invalid JSON is 400', async () => {
  const { app } = build({ config: { ...baseConfig, bodyLimit: '1kb' } });
  const s = await serve(app);
  try {
    assert.equal((await gen(s, { image: 'B'.repeat(5000) })).status, 413);
    const r = await s.call('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Turnstile-Response': 'tok' },
      body: '{not json',
    });
    assert.equal(r.status, 400);
  } finally {
    await s.close();
  }
});
