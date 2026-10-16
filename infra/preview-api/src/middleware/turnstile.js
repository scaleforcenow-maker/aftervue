// Cloudflare Turnstile server-side verification. Fails closed: no secret means
// 503 (misconfiguration), unless TURNSTILE_DISABLED=true was set explicitly.
// The token is read from the CF-Turnstile-Response header or the
// `cf-turnstile-response` / `turnstileToken` body field, then deleted from the
// body so downstream code never forwards it.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken({ secret, token, remoteip, fetchImpl = fetch, timeoutMs = 5000 }) {
  const form = new URLSearchParams({ secret, response: token });
  if (remoteip) form.set('remoteip', remoteip);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: ctrl.signal,
    });
    if (!res.ok) return { success: false, errorCodes: [`http_${res.status}`] };
    const data = await res.json();
    return { success: data.success === true, errorCodes: data['error-codes'] || [], hostname: data.hostname };
  } catch (err) {
    return { success: false, errorCodes: [err.name === 'AbortError' ? 'timeout' : 'network_error'] };
  } finally {
    clearTimeout(timer);
  }
}

export function turnstile({ secret, disabled = false, fetchImpl, logger, verify = verifyTurnstileToken } = {}) {
  return async function turnstileMiddleware(req, res, next) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const token = req.get('cf-turnstile-response') || body['cf-turnstile-response'] || body.turnstileToken;
    delete body['cf-turnstile-response'];
    delete body.turnstileToken;

    if (disabled) {
      logger?.warn({ message: 'turnstile verification DISABLED by configuration' });
      return next();
    }
    if (!secret) {
      logger?.error({ message: 'turnstile secret not configured; refusing request' });
      return res.status(503).json({ error: 'turnstile_not_configured' });
    }
    if (!token || typeof token !== 'string' || token.length > 2048) {
      return res.status(400).json({ error: 'turnstile_token_missing' });
    }

    const result = await verify({ secret, token, remoteip: req.ip, fetchImpl });
    if (!result.success) {
      logger?.warn({ message: 'turnstile rejected', errorCodes: result.errorCodes });
      return res.status(403).json({ error: 'turnstile_failed' });
    }
    return next();
  };
}
