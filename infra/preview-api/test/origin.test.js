import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { originAllowlist } from '../src/middleware/origin.js';
import { serve } from './helpers.js';

function appWith(origins) {
  const app = express();
  app.use(originAllowlist({ allowedOrigins: origins }));
  app.post('/x', (req, res) => res.json({ ok: true }));
  return app;
}

test('allows listed origin and sets CORS headers', async () => {
  const s = await serve(appWith(['https://app.example.test']));
  try {
    const r = await s.call('/x', { method: 'POST', headers: { Origin: 'https://app.example.test' } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://app.example.test');
    assert.equal(r.headers.get('vary'), 'Origin');
  } finally {
    await s.close();
  }
});

test('rejects unlisted, missing and look-alike origins', async () => {
  const s = await serve(appWith(['https://app.example.test']));
  try {
    for (const origin of ['https://evil.test', 'https://app.example.test.evil.test', 'http://app.example.test', undefined]) {
      const headers = origin ? { Origin: origin } : {};
      const r = await s.call('/x', { method: 'POST', headers });
      assert.equal(r.status, 403, `origin ${origin} should be rejected`);
      assert.equal(r.headers.get('access-control-allow-origin'), null);
    }
  } finally {
    await s.close();
  }
});

test('falls back to Referer origin when Origin header is absent', async () => {
  const s = await serve(appWith(['https://www.example.test']));
  try {
    const r = await s.call('/x', { method: 'POST', headers: { Referer: 'https://www.example.test/preview?x=1' } });
    assert.equal(r.status, 200);
  } finally {
    await s.close();
  }
});

test('preflight: 204 for allowed origin, 403 otherwise', async () => {
  const s = await serve(appWith(['https://app.example.test']));
  try {
    const ok = await s.call('/x', { method: 'OPTIONS', headers: { Origin: 'https://app.example.test' } });
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
    const bad = await s.call('/x', { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } });
    assert.equal(bad.status, 403);
  } finally {
    await s.close();
  }
});
