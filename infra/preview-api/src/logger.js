// Structured JSON logger for Cloud Logging with PHI redaction baked in.
//
// Rule: request bodies are never logged, by anyone, ever. This logger makes
// the accidental case harmless by redacting any field whose name matches the
// sensitive list (image, photo, selfie, prompt, data URL variants, body) and
// any string value that is a data: URL or looks like a base64 blob.

const SENSITIVE_KEY = /^(image|images|photo|photos|selfie|selfies|prompt|prompts|data|dataurl|data_url|body|requestbody|request_body|base64|file|files)$/i;
const SENSITIVE_KEY_PART = /(image|photo|selfie|prompt|dataurl|data_url|base64)/i;
const DATA_URL = /^\s*data:[a-z0-9.+/-]+;base64,/i;
const LONG_BASE64 = /^[A-Za-z0-9+/=\r\n]{512,}$/;
const DATA_URL_INLINE = /data:[a-z0-9.+/-]+;base64,[A-Za-z0-9+/=]+/gi;

export const REDACTED = '[redacted]';

function redactString(value) {
  if (DATA_URL.test(value) || LONG_BASE64.test(value)) return REDACTED;
  return value.replace(DATA_URL_INLINE, REDACTED);
}

export function redact(value, depth = 0) {
  if (depth > 8) return REDACTED;
  if (typeof value === 'string') return redactString(value);
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return REDACTED;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: redactString(String(value.message)), code: value.code };
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(k) || SENSITIVE_KEY_PART.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

const LEVELS = { debug: 'DEBUG', info: 'INFO', warn: 'WARNING', error: 'ERROR' };

export function createLogger({ write = (line) => process.stdout.write(line + '\n') } = {}) {
  const emit = (level, fields) => {
    const base = typeof fields === 'string' ? { message: fields } : { ...fields };
    if (base.msg && !base.message) {
      base.message = base.msg;
      delete base.msg;
    }
    const entry = { severity: LEVELS[level], time: new Date().toISOString(), ...redact(base) };
    write(JSON.stringify(entry));
  };
  return {
    debug: (f) => emit('debug', f),
    info: (f) => emit('info', f),
    warn: (f) => emit('warn', f),
    error: (f) => emit('error', f),
  };
}

export const logger = createLogger();
