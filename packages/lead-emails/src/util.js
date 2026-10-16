/**
 * Small helpers shared by the renderer. No dependencies.
 */

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/** Escape a string for safe interpolation into HTML text or attributes. */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Format an ISO-8601 timestamp for humans, e.g. "Thu, Oct 8, 2:05 PM".
 * Uses the practice's IANA time zone so the front desk sees local time.
 */
export function formatDateTime(iso, timeZone = 'UTC') {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(d);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A bare calendar date (YYYY-MM-DD) has no time zone; format it as-is rather than shifting it. */
function zoneFor(iso, timeZone) {
  return DATE_ONLY.test(iso) ? 'UTC' : timeZone;
}

/** Format an ISO date (YYYY-MM-DD or full timestamp) as "Oct 8". */
export function formatDate(iso, timeZone = 'UTC') {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zoneFor(iso, timeZone),
    month: 'short',
    day: 'numeric'
  }).format(d);
}

/** Format an ISO date with the year, "Oct 8, 2026". */
export function formatDateWithYear(iso, timeZone = 'UTC') {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zoneFor(iso, timeZone),
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(d);
}

/** "1 lead" / "12 leads". */
export function plural(n, singular, pluralForm = `${singular}s`) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** Minutes -> "4 min" / "1 hr 12 min" / "2 days". */
export function formatMinutes(minutes) {
  if (minutes == null) return 'n/a';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 60 * 48) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
  }
  return `${Math.round(minutes / 60 / 24)} days`;
}

/** Hours -> "24 hours" / "3 days". */
export function formatHours(hours) {
  if (hours < 48) return plural(Math.round(hours), 'hour');
  return plural(Math.round(hours / 24), 'day');
}
