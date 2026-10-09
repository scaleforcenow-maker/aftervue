/**
 * Link decoration. UTM parameters are added only when the caller passes
 * `{ utm: true }` to render(). Links marked `utm: false` in a template schema
 * (signed URLs such as magic links, invitation tokens and export downloads)
 * are never decorated, because appending a query parameter would invalidate
 * the signature.
 */

export const UTM_SOURCE = 'aftervue-leads';
export const UTM_MEDIUM = 'email';

export function withUtm(url, { utm = false, campaign } = {}) {
  if (!utm) return url;
  const u = new URL(url);
  u.searchParams.set('utm_source', UTM_SOURCE);
  u.searchParams.set('utm_medium', UTM_MEDIUM);
  if (campaign) u.searchParams.set('utm_campaign', campaign);
  return u.toString();
}
