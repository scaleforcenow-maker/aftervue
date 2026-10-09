/**
 * Strict data validation for templates.
 *
 * - Every field in the template schema is checked for type and length.
 * - Unknown fields are rejected at any depth.
 * - Every string is checked for an exclamation mark, which the AfterVue
 *   voice does not use. Rejecting it at the input keeps "!" out of the
 *   rendered subject, preheader, HTML and text parts whatever the caller
 *   passes.
 * - Templates that carry lead information (new lead, 24-hour nudge, 72-hour
 *   owner CC, weekly digest) have a PII guard: any key whose name contains
 *   phone, email, photo or treatment (or an obvious synonym: mobile, selfie,
 *   picture, image, address, birth, ssn, procedure, diagnos) is rejected at
 *   any depth and in any casing; any plain string value that looks like an
 *   email address or a phone number is rejected; and URL values are checked
 *   too, because a query string is the easiest place for a caller to leak a
 *   lead's contact details into an email. The guard is a backstop; the
 *   schemas never declare such fields.
 */

export class TemplateDataError extends Error {
  constructor(message, { field, code } = {}) {
    super(message);
    this.name = 'TemplateDataError';
    this.field = field;
    this.code = code;
  }
}

const FORBIDDEN_KEY = /phone|e-?mail|photo|treatment|mobile|selfie|picture|image|address|birth|ssn|procedure|diagnos/i;
const EMAIL_VALUE = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/;
// 8+ digits with optional separators: catches (555) 010-1234, +1 555 010 1234, 5550101234.
const PHONE_VALUE = /(?:\+?\d[\d\s().-]{6,}\d)/;
// A phone number written with separators: (555) 010-1234, 555-010-1234, +1 555.010.1234.
// Used inside URLs, where a bare run of digits is more likely to be a record id than a phone.
const FORMATTED_PHONE_VALUE = /(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/;
const DIGIT_COUNT = /\d/g;
const EXCLAMATION = /!/;

function fail(message, field, code) {
  throw new TemplateDataError(message, { field, code });
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function looksLikePhone(value) {
  const m = value.match(PHONE_VALUE);
  if (!m) return false;
  const digits = (m[0].match(DIGIT_COUNT) || []).length;
  return digits >= 8;
}

function checkString(value, spec, path) {
  if (typeof value !== 'string') fail(`${path} must be a string`, path, 'type');
  const trimmed = value.trim();
  if (spec.required !== false && trimmed.length === 0) fail(`${path} must not be empty`, path, 'empty');
  if (spec.max && trimmed.length > spec.max) fail(`${path} must be at most ${spec.max} characters`, path, 'max');
  if (/[\r\n]/.test(value) && !spec.multiline) fail(`${path} must be a single line`, path, 'newline');
  if (EXCLAMATION.test(value)) fail(`${path} must not contain an exclamation mark`, path, 'voice');
  if (spec.enum && !spec.enum.includes(trimmed)) fail(`${path} must be one of ${spec.enum.join(', ')}`, path, 'enum');
  return trimmed;
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

/**
 * PII guard for URL values. Parameter names are checked against the same
 * forbidden list as data keys; decoded parameter values, the fragment and
 * the path are checked for email addresses and for formatted phone numbers.
 */
function guardUrl(u, path) {
  for (const [name, value] of u.searchParams) {
    if (FORBIDDEN_KEY.test(name)) {
      fail(`${path} carries a "${name}" query parameter, which this template must not carry`, path, 'pii');
    }
    if (EMAIL_VALUE.test(value) || FORMATTED_PHONE_VALUE.test(value)) {
      fail(`${path} carries contact details in its query string, which this template must not carry`, path, 'pii');
    }
  }
  const rest = safeDecode(u.pathname) + ' ' + safeDecode(u.hash);
  if (EMAIL_VALUE.test(rest) || FORMATTED_PHONE_VALUE.test(rest)) {
    fail(`${path} carries contact details, which this template must not carry`, path, 'pii');
  }
}

function checkUrl(value, spec, path, guard) {
  if (typeof value !== 'string') fail(`${path} must be a URL string`, path, 'type');
  if (/[\s]/.test(value)) fail(`${path} must not contain whitespace`, path, 'url');
  let u;
  try {
    u = new URL(value);
  } catch {
    fail(`${path} must be an absolute URL`, path, 'url');
  }
  if (u.protocol !== 'https:' && !(spec.allowHttp && u.protocol === 'http:')) {
    fail(`${path} must use https`, path, 'url');
  }
  if (u.username || u.password) fail(`${path} must not contain credentials`, path, 'url');
  if (value.length > 2048) fail(`${path} is too long`, path, 'max');
  if (guard) guardUrl(u, path);
  return value;
}

function checkInt(value, spec, path) {
  if (!Number.isInteger(value)) fail(`${path} must be an integer`, path, 'type');
  if (spec.min != null && value < spec.min) fail(`${path} must be at least ${spec.min}`, path, 'min');
  if (spec.max != null && value > spec.max) fail(`${path} must be at most ${spec.max}`, path, 'max');
  return value;
}

function checkNumber(value, spec, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path} must be a number`, path, 'type');
  if (spec.min != null && value < spec.min) fail(`${path} must be at least ${spec.min}`, path, 'min');
  if (spec.max != null && value > spec.max) fail(`${path} must be at most ${spec.max}`, path, 'max');
  return value;
}

function checkDate(value, spec, path) {
  if (typeof value !== 'string') fail(`${path} must be an ISO-8601 string`, path, 'type');
  if (Number.isNaN(Date.parse(value))) fail(`${path} must be a valid ISO-8601 date`, path, 'date');
  return value;
}

function checkBool(value, spec, path) {
  if (typeof value !== 'boolean') fail(`${path} must be true or false`, path, 'type');
  return value;
}

function checkTimeZone(value, spec, path) {
  const tz = checkString(value, spec, path);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    fail(`${path} must be a valid IANA time zone`, path, 'timezone');
  }
  return tz;
}

function checkValue(value, spec, path, guard) {
  switch (spec.type) {
    case 'string': {
      const s = checkString(value, spec, path);
      if (guard) {
        if (EMAIL_VALUE.test(s)) fail(`${path} looks like an email address, which this template must not carry`, path, 'pii');
        if (looksLikePhone(s)) fail(`${path} looks like a phone number, which this template must not carry`, path, 'pii');
      }
      return s;
    }
    case 'url':
      return checkUrl(value, spec, path, guard);
    case 'int':
      return checkInt(value, spec, path);
    case 'number':
      return checkNumber(value, spec, path);
    case 'date':
      return checkDate(value, spec, path);
    case 'bool':
      return checkBool(value, spec, path);
    case 'timezone':
      return checkTimeZone(value, spec, path);
    case 'array': {
      if (!Array.isArray(value)) fail(`${path} must be an array`, path, 'type');
      if (spec.max != null && value.length > spec.max) fail(`${path} must have at most ${spec.max} items`, path, 'max');
      return value.map((item, i) => checkValue(item, spec.items, `${path}[${i}]`, guard));
    }
    case 'object':
      return validateObject(value, spec.fields, path, guard);
    default:
      throw new Error(`Unknown schema type "${spec.type}" at ${path}`);
  }
}

export function validateObject(data, fields, path = 'data', guard = false) {
  if (!isPlainObject(data)) fail(`${path} must be an object`, path, 'type');

  const out = {};
  for (const key of Object.keys(data)) {
    const fieldPath = path === 'data' ? key : `${path}.${key}`;
    if (guard && FORBIDDEN_KEY.test(key)) {
      fail(`${fieldPath} is not allowed: this template must not carry phone, email, photo or treatment data`, fieldPath, 'pii');
    }
    if (!Object.prototype.hasOwnProperty.call(fields, key)) {
      fail(`Unknown field ${fieldPath}`, fieldPath, 'unknown');
    }
  }

  for (const [key, spec] of Object.entries(fields)) {
    const fieldPath = path === 'data' ? key : `${path}.${key}`;
    const present = Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined && data[key] !== null;
    if (!present) {
      if (spec.required === false) {
        if (spec.default !== undefined) out[key] = spec.default;
        continue;
      }
      fail(`Missing required field ${fieldPath}`, fieldPath, 'required');
    }
    out[key] = checkValue(data[key], spec, fieldPath, guard);
  }
  return out;
}

/** Validate template data against a template definition. Returns a cleaned copy. */
export function validateTemplateData(template, data) {
  return validateObject(data, template.schema, 'data', template.guardPii === true);
}
