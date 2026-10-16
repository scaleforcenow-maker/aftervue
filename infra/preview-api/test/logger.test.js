import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact, REDACTED } from '../src/logger.js';
import { captureLogger } from './helpers.js';

const b64 = 'iVBORw0KGgo' + 'A'.repeat(600);

test('logger redacts fields named image, photo, selfie, prompt and data URLs', () => {
  const { logger, lines } = captureLogger();
  logger.info({
    message: 'generate',
    image: b64,
    photo: 'data:image/jpeg;base64,/9j/4AAQ',
    selfie: { nested: 'x' },
    prompt: 'describe the smile',
    data: 'data:image/png;base64,' + b64,
    dataUrl: 'data:image/png;base64,abc',
    images: ['data:image/png;base64,abc'],
    tenant: 'practice-1',
    ms: 42,
  });
  assert.equal(lines.length, 1);
  const e = lines[0];
  for (const k of ['image', 'photo', 'selfie', 'prompt', 'data', 'dataUrl', 'images']) {
    assert.equal(e[k], REDACTED, `${k} must be redacted`);
  }
  assert.equal(e.tenant, 'practice-1');
  assert.equal(e.ms, 42);
  assert.equal(e.severity, 'INFO');
  const serialized = JSON.stringify(e);
  assert.ok(!serialized.includes('base64,'), 'no data URL survives');
  assert.ok(!serialized.includes('describe the smile'), 'prompt text does not survive');
  assert.ok(!serialized.includes(b64.slice(0, 64)), 'base64 payload does not survive');
});

test('redact catches sensitive names nested, case-insensitively and as substrings', () => {
  const out = redact({
    Request: { Body: 'x', meta: { PHOTO_ID: 'p1', beforeImage: 'y', ok: 1 } },
    list: [{ selfiePath: '/tmp/a.jpg' }, 'plain'],
  });
  assert.equal(out.Request.Body, REDACTED);
  assert.equal(out.Request.meta.PHOTO_ID, REDACTED);
  assert.equal(out.Request.meta.beforeImage, REDACTED);
  assert.equal(out.Request.meta.ok, 1);
  assert.equal(out.list[0].selfiePath, REDACTED);
  assert.equal(out.list[1], 'plain');
});

test('redact scrubs data URLs and long base64 even under innocent keys', () => {
  const out = redact({
    note: 'see data:image/png;base64,QUJD and more',
    blob: b64,
    buf: Buffer.from('abc'),
  });
  assert.equal(out.note, `see ${REDACTED} and more`);
  assert.equal(out.blob, REDACTED);
  assert.equal(out.buf, REDACTED);
});

test('errors are logged by name and message only', () => {
  const err = new Error('vertex responded 429');
  err.code = 'vertex_error';
  const out = redact({ error: err });
  assert.deepEqual(out.error, { name: 'Error', message: 'vertex responded 429', code: 'vertex_error' });
});
