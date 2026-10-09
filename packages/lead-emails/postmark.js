/**
 * Postmark adapter.
 *
 *   import { render } from '@aftervue/lead-emails';
 *   import { createPostmarkSender, toPostmarkMessage } from '@aftervue/lead-emails/postmark';
 *
 *   const sender = createPostmarkSender({
 *     serverToken: process.env.POSTMARK_SERVER_TOKEN,
 *     messageStream: 'outbound',           // any stream configured in Postmark
 *     dryRun: process.env.EMAIL_DRY_RUN === '1',
 *     outDir: 'out'                        // where dry-run .eml files go
 *   });
 *   await sender.send(render('new-lead', data), { from: 'hello@getaftervue.com', to: ownerAddress });
 *
 * toPostmarkMessage() maps render output to the shape of POST /email
 * (HtmlBody + TextBody, no TemplateModel). createPostmarkSender() posts it with
 * fetch, or in dry-run mode writes an RFC 5322 .eml file instead of sending.
 *
 * The AfterVue mark is referenced as cid:aftervue-mark by default. Pass
 * `inlineLogo: { content, contentType }` (content is base64 of the image file,
 * read at send time) to attach it, or render with `logoSrc` set to a hosted
 * https URL and skip the attachment.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const POSTMARK_API = 'https://api.postmarkapp.com/email';
export const LOGO_CONTENT_ID = 'cid:aftervue-mark';
export const DEFAULT_MESSAGE_STREAM = 'outbound';

function addressList(v) {
  if (v == null) return undefined;
  return Array.isArray(v) ? v.join(', ') : String(v);
}

function assertRendered(rendered) {
  for (const key of ['template', 'subject', 'html', 'text']) {
    if (typeof rendered?.[key] !== 'string' || rendered[key].length === 0) {
      throw new TypeError(`toPostmarkMessage: rendered.${key} is required (pass the result of render())`);
    }
  }
}

/**
 * @param {object} rendered   result of render()
 * @param {object} envelope
 * @param {string} envelope.from
 * @param {string|string[]} envelope.to
 * @param {string|string[]} [envelope.cc]
 * @param {string|string[]} [envelope.bcc]
 * @param {string} [envelope.replyTo]
 * @param {string} [envelope.messageStream]   default "outbound"
 * @param {string} [envelope.tag]             default rendered.template
 * @param {object} [envelope.metadata]        Postmark Metadata (string values only)
 * @param {object} [envelope.headers]         extra headers as { Name: Value }
 * @param {object} [envelope.inlineLogo]      { content: base64, contentType: 'image/png' }
 */
export function toPostmarkMessage(rendered, envelope = {}) {
  assertRendered(rendered);
  if (!envelope.from) throw new TypeError('toPostmarkMessage: envelope.from is required');
  if (!envelope.to || (Array.isArray(envelope.to) && envelope.to.length === 0)) {
    throw new TypeError('toPostmarkMessage: envelope.to is required');
  }

  const message = {
    From: envelope.from,
    To: addressList(envelope.to),
    Subject: rendered.subject,
    HtmlBody: rendered.html,
    TextBody: rendered.text,
    MessageStream: envelope.messageStream || DEFAULT_MESSAGE_STREAM,
    Tag: envelope.tag || rendered.template,
    TrackOpens: false,
    TrackLinks: 'None'
  };
  if (envelope.cc) message.Cc = addressList(envelope.cc);
  if (envelope.bcc) message.Bcc = addressList(envelope.bcc);
  if (envelope.replyTo) message.ReplyTo = envelope.replyTo;
  if (envelope.metadata) {
    for (const [k, v] of Object.entries(envelope.metadata)) {
      if (typeof v !== 'string') throw new TypeError(`toPostmarkMessage: metadata.${k} must be a string`);
    }
    message.Metadata = { ...envelope.metadata };
  }
  if (envelope.headers) {
    message.Headers = Object.entries(envelope.headers).map(([Name, Value]) => ({ Name, Value: String(Value) }));
  }
  if (envelope.inlineLogo) {
    const { content, contentType = 'image/png', name = 'aftervue-mark.png' } = envelope.inlineLogo;
    if (typeof content !== 'string' || content.length === 0) {
      throw new TypeError('toPostmarkMessage: inlineLogo.content must be a base64 string');
    }
    message.Attachments = [{ Name: name, Content: content, ContentType: contentType, ContentID: LOGO_CONTENT_ID }];
  }
  return message;
}

/* ---------- dry-run .eml writer ---------- */

function encodeHeader(value) {
  // RFC 2047 encoded-word for non-ASCII subjects (the ellipsis used by clampSubject, for example).
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function wrap76(base64) {
  return base64.replace(/(.{76})/g, '$1\r\n');
}

/** Build an RFC 5322 message from a Postmark message object. */
export function toEml(message, { date = new Date(), messageId } = {}) {
  const boundaryAlt = `=_alt_${Math.random().toString(36).slice(2)}`;
  const boundaryRel = `=_rel_${Math.random().toString(36).slice(2)}`;
  const crlf = '\r\n';
  const headers = [
    `From: ${message.From}`,
    `To: ${message.To}`,
    message.Cc ? `Cc: ${message.Cc}` : null,
    message.ReplyTo ? `Reply-To: ${message.ReplyTo}` : null,
    `Subject: ${encodeHeader(message.Subject)}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <${messageId || `${Date.now()}.${Math.random().toString(36).slice(2)}@getaftervue.com`}>`,
    `X-PM-Message-Stream: ${message.MessageStream}`,
    message.Tag ? `X-PM-Tag: ${message.Tag}` : null,
    ...(message.Headers || []).map((h) => `${h.Name}: ${h.Value}`),
    'MIME-Version: 1.0'
  ].filter(Boolean);

  const alternative = [
    `--${boundaryAlt}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    message.TextBody,
    `--${boundaryAlt}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    message.HtmlBody,
    `--${boundaryAlt}--`
  ].join(crlf);

  const attachments = message.Attachments || [];
  if (attachments.length === 0) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);
    return headers.join(crlf) + crlf + crlf + alternative + crlf;
  }

  headers.push(`Content-Type: multipart/related; boundary="${boundaryRel}"; type="multipart/alternative"`);
  const related = [
    `--${boundaryRel}`,
    `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
    '',
    alternative,
    ...attachments.flatMap((a) => [
      `--${boundaryRel}`,
      `Content-Type: ${a.ContentType}; name="${a.Name}"`,
      'Content-Transfer-Encoding: base64',
      `Content-ID: <${a.ContentID.replace(/^cid:/, '')}>`,
      `Content-Disposition: inline; filename="${a.Name}"`,
      '',
      wrap76(a.Content)
    ]),
    `--${boundaryRel}--`
  ].join(crlf);
  return headers.join(crlf) + crlf + crlf + related + crlf;
}

/* ---------- sender ---------- */

export class PostmarkError extends Error {
  constructor(message, { status, errorCode, body } = {}) {
    super(message);
    this.name = 'PostmarkError';
    this.status = status;
    this.errorCode = errorCode;
    this.body = body;
  }
}

/**
 * @param {object} config
 * @param {string} [config.serverToken]     required unless dryRun
 * @param {string} [config.messageStream]   default "outbound"
 * @param {boolean} [config.dryRun]         write .eml files instead of sending
 * @param {string} [config.outDir]          default "out"
 * @param {Function} [config.fetch]         injectable for tests
 * @param {string} [config.apiUrl]
 */
export function createPostmarkSender(config = {}) {
  const {
    serverToken,
    messageStream = DEFAULT_MESSAGE_STREAM,
    dryRun = false,
    outDir = 'out',
    fetch: fetchImpl = globalThis.fetch,
    apiUrl = POSTMARK_API
  } = config;

  if (!dryRun && !serverToken) {
    throw new TypeError('createPostmarkSender: serverToken is required unless dryRun is true');
  }
  if (!dryRun && typeof fetchImpl !== 'function') {
    throw new TypeError('createPostmarkSender: fetch is not available; pass config.fetch');
  }

  let counter = 0;

  async function send(rendered, envelope = {}) {
    const message = toPostmarkMessage(rendered, { messageStream, ...envelope });

    if (dryRun) {
      await mkdir(outDir, { recursive: true });
      counter += 1;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(outDir, `${stamp}-${String(counter).padStart(3, '0')}-${message.Tag}.eml`);
      await writeFile(file, toEml(message), 'utf8');
      return { dryRun: true, path: file, message };
    }

    const res = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': serverToken
      },
      body: JSON.stringify(message)
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok || (body && body.ErrorCode)) {
      throw new PostmarkError(body?.Message || `Postmark request failed with status ${res.status}`, {
        status: res.status,
        errorCode: body?.ErrorCode,
        body
      });
    }
    return body;
  }

  return { send, dryRun, messageStream };
}
