import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { turnstile, verifyTurnstileToken } from '../src/middleware/turnstile.js';
import { serve } from './helpers.js';

function appWith(opts) {
  const app = express();
  app.use(express.json());
  app.use(turnstile(opts));
  app.post('/x', (req, res) => res.json({ body: req.body }));
  return app;
}

const post = (s, body, headers = {}) =>
  s.call('/x', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('verifyTurnstileToken posts form data to Cloudflare and reads success', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ success: true, hostname: 'app.example.test' }) };
  };
  const r = await verifyTurnstileToken({ secret: 's3', token: 'tok', remoteip: '203.0.113.1', fetchImpl });
  assert.equal(r.success, true);
  assert.equal(calls[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  const form = new URLSearchParams(calls[0].init.body);
  assert.equal(form.get('secret'), 's3');
  assert.equal(form.get('response'), 'tok');
  assert.equal(form.get('remoteip'), '203.0.113.1');
});

test('verifyTurnstileToken fails closed on HTTP errors and network errors', async () => {
  const r1 = await verifyTurnstileToken({ secret: 's', token: 't', fetchImpl: async () => ({ ok: false, status: 502 }) });
  assert.deepEqual(r1, { success: false, errorCodes: ['http_502'] });
  const r2 = await verifyTurnstileToken({ secret: 's', token: 't', fetchImpl: async () => { throw new Error('boom'); } });
  assert.deepEqual(r2, { success: false, errorCodes: ['network_error'] });
});

test('503 when no secret is configured (fail closed)', async () => {
  const s = await serve(appWith({ secret: '' }));
  try {
    const r = await post(s, { turnstileToken: 'abc' });
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { error: 'turnstile_not_configured' });
  } finally {
    await s.close();
  }
});

test('400 without a token, 403 when Cloudflare rejects, strips token from body on success', async () => {
  const verify = async ({ token }) => ({ success: token === 'good', errorCodes: token === 'good' ? [] : ['invalid-input-response'] });
  const s = await serve(appWith({ secret: 'k', verify }));
  try {
    assert.equal((await post(s, { a: 1 })).status, 400);
    assert.equal((await post(s, { turnstileToken: 'bad' })).status, 403);
    const ok = await post(s, { a: 1, 'cf-turnstile-response': 'good' });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { body: { a: 1 } });
    const viaHeader = await post(s, { a: 2 }, { 'CF-Turnstile-Response': 'good' });
    assert.equal(viaHeader.status, 200);
  } finally {
    await s.close();
  }
});

test('explicit TURNSTILE_DISABLED skips verification', async () => {
  const s = await serve(appWith({ secret: '', disabled: true }));
  try {
    assert.equal((await post(s, { a: 1 })).status, 200);
  } finally {
    await s.close();
  }
});
