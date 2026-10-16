// Origin allowlist + CORS. Requests on protected routes must carry an Origin
// (or, for same-origin fetches that omit it, a Referer) matching the allowlist.
// Everything else is 403. Healthz is mounted before this middleware.

function originOf(req) {
  const origin = req.get('origin');
  if (origin) return origin;
  const referer = req.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function originAllowlist({ allowedOrigins = [], logger } = {}) {
  const allowed = new Set(allowedOrigins.map((o) => o.toLowerCase().replace(/\/$/, '')));

  return function originMiddleware(req, res, next) {
    const origin = originOf(req);
    const ok = origin !== null && allowed.has(origin.toLowerCase());

    if (ok) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, CF-Turnstile-Response');
      res.set('Access-Control-Max-Age', '600');
    }

    if (req.method === 'OPTIONS') {
      return res.status(ok ? 204 : 403).end();
    }

    if (!ok) {
      logger?.warn({ message: 'origin rejected', origin: origin || '(none)', path: req.path });
      return res.status(403).json({ error: 'origin_not_allowed' });
    }
    return next();
  };
}
