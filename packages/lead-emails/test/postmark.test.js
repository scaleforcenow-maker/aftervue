import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { render } from '../src/index.js';
import { fixtures } from '../fixtures/index.js';
import { toPostmarkMessage, toEml, createPostmarkSender, PostmarkError, LOGO_CONTENT_ID } from '../postmark.js';

const FROM = 'hello@getaftervue.com';
const TO = 'support@getaftervue.com';

describe('toPostmarkMessage', () => {
  const rendered = render('new-lead', fixtures['new-lead']);

  test('maps render output to the POST /email shape with both bodies', () => {
    const m = toPostmarkMessage(rendered, { from: FROM, to: TO });
    assert.equal(m.From, FROM);
    assert.equal(m.To, TO);
    assert.equal(m.Subject, rendered.subject);
    assert.equal(m.HtmlBody, rendered.html);
    assert.equal(m.TextBody, rendered.text);
    assert.equal(m.MessageStream, 'outbound');
    assert.equal(m.Tag, 'new-lead');
    assert.equal(m.TrackOpens, false);
    assert.equal(m.TrackLinks, 'None');
    assert.ok(!('TemplateModel' in m));
    assert.ok(!('TemplateId' in m));
    assert.ok(!('Attachments' in m));
  });

  test('MessageStream is configurable', () => {
    assert.equal(toPostmarkMessage(rendered, { from: FROM, to: TO, messageStream: 'lead-alerts' }).MessageStream, 'lead-alerts');
  });

  test('joins address lists, maps cc, bcc, reply-to, metadata and headers', () => {
    const m = toPostmarkMessage(rendered, {
      from: FROM,
      to: [TO, FROM],
      cc: FROM,
      bcc: [TO],
      replyTo: FROM,
      tag: 'custom',
      metadata: { tenant: 't_sample' },
      headers: { 'X-Tenant': 't_sample' }
    });
    assert.equal(m.To, `${TO}, ${FROM}`);
    assert.equal(m.Cc, FROM);
    assert.equal(m.Bcc, TO);
    assert.equal(m.ReplyTo, FROM);
    assert.equal(m.Tag, 'custom');
    assert.deepEqual(m.Metadata, { tenant: 't_sample' });
    assert.deepEqual(m.Headers, [{ Name: 'X-Tenant', Value: 't_sample' }]);
  });

  test('attaches the inline logo with the CID the templates reference', () => {
    const m = toPostmarkMessage(rendered, { from: FROM, to: TO, inlineLogo: { content: 'aGVsbG8=', contentType: 'image/png' } });
    assert.equal(m.Attachments.length, 1);
    assert.equal(m.Attachments[0].ContentID, LOGO_CONTENT_ID);
    assert.ok(rendered.html.includes(`src="${LOGO_CONTENT_ID}"`));
  });

  test('rejects missing envelope fields and non-render input', () => {
    assert.throws(() => toPostmarkMessage(rendered, { to: TO }), TypeError);
    assert.throws(() => toPostmarkMessage(rendered, { from: FROM }), TypeError);
    assert.throws(() => toPostmarkMessage({ subject: 'x' }, { from: FROM, to: TO }), TypeError);
    assert.throws(() => toPostmarkMessage(rendered, { from: FROM, to: TO, metadata: { n: 1 } }), TypeError);
  });
});

describe('toEml', () => {
  test('produces a multipart/alternative message with text then HTML', () => {
    const rendered = render('magic-link', fixtures['magic-link']);
    const eml = toEml(toPostmarkMessage(rendered, { from: FROM, to: TO, messageStream: 'auth' }));
    assert.ok(eml.startsWith(`From: ${FROM}\r\n`));
    assert.ok(eml.includes(`Subject: ${rendered.subject}\r\n`));
    assert.ok(eml.includes('X-PM-Message-Stream: auth\r\n'));
    assert.ok(eml.includes('Content-Type: multipart/alternative; boundary="'));
    assert.ok(eml.indexOf('Content-Type: text/plain') < eml.indexOf('Content-Type: text/html'));
    assert.ok(eml.includes(rendered.text));
    assert.ok(eml.includes(rendered.html));
  });

  test('wraps in multipart/related when the logo is attached', () => {
    const rendered = render('magic-link', fixtures['magic-link']);
    const eml = toEml(toPostmarkMessage(rendered, { from: FROM, to: TO, inlineLogo: { content: 'aGVsbG8=' } }));
    assert.ok(eml.includes('Content-Type: multipart/related;'));
    assert.ok(eml.includes('Content-ID: <aftervue-mark>'));
  });

  test('encodes a non-ASCII subject', () => {
    const rendered = render('magic-link', fixtures['magic-link']);
    const msg = toPostmarkMessage(rendered, { from: FROM, to: TO });
    msg.Subject = 'Résumé';
    assert.ok(toEml(msg).includes('Subject: =?UTF-8?B?'));
  });
});

describe('createPostmarkSender', () => {
  const outDir = path.join(os.tmpdir(), `lead-emails-test-${process.pid}`);
  after(() => rm(outDir, { recursive: true, force: true }));

  test('requires a token unless dry-run', () => {
    assert.throws(() => createPostmarkSender({}), TypeError);
    assert.ok(createPostmarkSender({ dryRun: true }));
  });

  test('dry-run writes an .eml file instead of sending', async () => {
    let called = false;
    const sender = createPostmarkSender({ dryRun: true, outDir, messageStream: 'lead-alerts', fetch: () => { called = true; } });
    const rendered = render('export-ready', fixtures['export-ready']);
    const result = await sender.send(rendered, { from: FROM, to: TO });
    assert.equal(result.dryRun, true);
    assert.equal(called, false);
    assert.ok(result.path.endsWith('-export-ready.eml'));
    const files = await readdir(outDir);
    assert.equal(files.length, 1);
    const eml = await readFile(result.path, 'utf8');
    assert.ok(eml.includes('X-PM-Message-Stream: lead-alerts'));
    assert.ok(eml.includes('Content-Type: text/plain'));
    assert.ok(eml.includes('Content-Type: text/html'));
    assert.ok(eml.includes(rendered.subject));
  });

  test('sends through fetch with the server token header', async () => {
    const calls = [];
    const sender = createPostmarkSender({
      serverToken: 'test-token',
      messageStream: 'outbound',
      fetch: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, json: async () => ({ ErrorCode: 0, Message: 'OK', MessageID: 'm-1' }) };
      }
    });
    const res = await sender.send(render('new-lead', fixtures['new-lead']), { from: FROM, to: TO });
    assert.equal(res.MessageID, 'm-1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.postmarkapp.com/email');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['X-Postmark-Server-Token'], 'test-token');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.MessageStream, 'outbound');
    assert.ok(body.HtmlBody && body.TextBody);
  });

  test('surfaces Postmark errors', async () => {
    const sender = createPostmarkSender({
      serverToken: 't',
      fetch: async () => ({ ok: false, status: 422, json: async () => ({ ErrorCode: 300, Message: 'Invalid email request' }) })
    });
    await assert.rejects(
      sender.send(render('new-lead', fixtures['new-lead']), { from: FROM, to: TO }),
      (e) => e instanceof PostmarkError && e.errorCode === 300 && e.status === 422
    );
  });
});
