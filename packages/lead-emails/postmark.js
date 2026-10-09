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
export const MAX_RECIPIENTS_PER_FIELD = 50; // Postmark limit for each of To, Cc, Bcc
export const MAX_TAG_LENGTH = 1000; // Postmark limit
export const DEFAULT_TIMEOUT_MS = 10_000;

function addressList(v, field) {
  if (v == null) return undefined;
  const list = Array.isArray(v) ? v.map(String) : String(v).split(',');
  const cleaned = list.map((a) => a.trim()).filter(Boolean);
  if (cleaned.length > MAX_RECIPIENTS_PER_FIELD) {
    throw new TypeError(`toPostmarkMessage: envelope.${field} has ${cleaned.length} recipients; Postmark allows ${MAX_RECIPIENTS_PER_FIELD}`);
  }
  for (const a of cleaned) {
    if (/[\r\n]/.test(a)) throw new TypeError(`toPostmarkMessage: envelope.${field} must not contain line breaks`);
  }
  return cleaned.join(', ');
}

function checkTag(tag) {
  if (typeof tag !== 'string' || tag.length === 0) throw new TypeError('toPostmarkMessage: tag must be a non-empty string');
  if (tag.length > MAX_TAG_LENGTH) throw new TypeError(`toPostmarkMessage: tag must be at most ${MAX_TAG_LENGTH} characters`);
  if (/[\r\n]/.test(tag)) throw new TypeError('toPostmarkMessage: tag must be a single line');
  return tag;
}

/** Reduce a tag to a safe file-name fragment: no separators, no dot segments. */
export function safeFileFragment(tag) {
  const cleaned = String(tag).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 80) : 'message';
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
    To: addressList(envelope.to, 'to'),
    Subject: rendered.subject,
    HtmlBody: rendered.html,
    TextBody: rendered.text,
    MessageStream: envelope.messageStream || DEFAULT_MESSAGE_STREAM,
    Tag: checkTag(envelope.tag || rendered.template),
    TrackOpens: false,
    TrackLinks: 'None'
  };
  if (envelope.cc) message.Cc = addressList(envelope.cc, 'cc');
  if (envelope.bcc) message.Bcc = addressList(envelope.bcc, 'bcc');
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

/**
 * Quoted-printable (RFC 2045 section 6.7) for a UTF-8 body. Keeps every line
 * at 76 characters or fewer and the whole part 7-bit, so the .eml meets the
 * RFC 5322 line limit (998) however long the inlined-CSS lines of the HTML are.
 */
export function quotedPrintable(text) {
  const bytes = Buffer.from(String(text).replace(/\r?\n/g, '\r\n'), 'utf8');
  const out = [];
  let line = '';
  const flush = (soft) => {
    out.push(soft ? line + '=' : line);
    line = '';
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 13 && bytes[i + 1] === 10) {
      // Trailing whitespace before a hard break must be encoded.
      if (line.endsWith(' ') || line.endsWith('\t')) {
        const last = line.at(-1);
        line = line.slice(0, -1) + '=' + last.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
      }
      flush(false);
      i += 1;
      continue;
    }
    let token;
    if ((b >= 33 && b <= 126 && b !== 61) || b === 32 || b === 9) token = String.fromCharCode(b);
    else token = '=' + b.toString(16).toUpperCase().padStart(2, '0');
    if (line.length + token.length > 75) flush(true);
    line += token;
  }
  // A body that ends with a line break keeps it: the last flush left `line` empty.
  out.push(line);
  return out.join('\r\n');
}

function rfc5322Date(date) {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n) => String(n).padStart(2, '0');
  return `${DAYS[date.getUTCDay()]}, ${p(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} ${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())} +0000`;
}

function headerValue(v) {
  // Header bodies are single-line; anything else would let a value inject headers.
  return String(v).replace(/[\r\n]+/g, ' ');
}

/** Build an RFC 5322 message from a Postmark message object. */
export function toEml(message, { date = new Date(), messageId } = {}) {
  const boundaryAlt = `=_alt_${Math.random().toString(36).slice(2)}`;
  const boundaryRel = `=_rel_${Math.random().toString(36).slice(2)}`;
  const crlf = '\r\n';
  const headers = [
    `From: ${headerValue(message.From)}`,
    `To: ${headerValue(message.To)}`,
    message.Cc ? `Cc: ${headerValue(message.Cc)}` : null,
    message.ReplyTo ? `Reply-To: ${headerValue(message.ReplyTo)}` : null,
    `Subject: ${encodeHeader(headerValue(message.Subject))}`,
    `Date: ${rfc5322Date(date)}`,
    `Message-ID: <${messageId || `${Date.now()}.${Math.random().toString(36).slice(2)}@getaftervue.com`}>`,
    `X-PM-Message-Stream: ${headerValue(message.MessageStream)}`,
    message.Tag ? `X-PM-Tag: ${encodeHeader(headerValue(message.Tag))}` : null,
    ...(message.Headers || []).map((h) => `${headerValue(h.Name)}: ${encodeHeader(headerValue(h.Value))}`),
    'MIME-Version: 1.0'
  ].filter(Boolean);

  const alternative = [
    `--${boundaryAlt}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    quotedPrintable(message.TextBody),
    `--${boundaryAlt}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    quotedPrintable(message.HtmlBody),
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
 * @param {number} [config.timeoutMs]       abort the HTTP request after this long, default 10 000
 */
export function createPostmarkSender(config = {}) {
  const {
    serverToken,
    messageStream = DEFAULT_MESSAGE_STREAM,
    dryRun = false,
    outDir = 'out',
    fetch: fetchImpl = globalThis.fetch,
    apiUrl = POSTMARK_API,
    timeoutMs = DEFAULT_TIMEOUT_MS
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
      const file = path.join(outDir, `${stamp}-${String(counter).padStart(3, '0')}-${safeFileFragment(message.Tag)}.eml`);
      await writeFile(file, toEml(message), 'utf8');
      return { dryRun: true, path: file, message };
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetchImpl(apiUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': serverToken
        },
        body: JSON.stringify(message),
        signal: controller ? controller.signal : undefined
      });
    } catch (err) {
      if (controller && controller.signal.aborted) {
        throw new PostmarkError(`Postmark request timed out after ${timeoutMs} ms`, { status: 0, errorCode: 'timeout' });
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
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
