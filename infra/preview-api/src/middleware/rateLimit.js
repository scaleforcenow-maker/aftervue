// Per-IP token bucket. Cloud Run terminates TLS and appends the client IP to
// X-Forwarded-For; Express's `trust proxy` setting (app.js) makes req.ip the
// first hop. State is per instance, which is the honest limit on Cloud Run with
// min instances 0; it is still enough to stop a single client hammering a
// 2 req/min Vertex quota.

export function createTokenBucket({ capacity, refillPerMinute, now = () => Date.now() }) {
  const buckets = new Map();
  const refillPerMs = refillPerMinute / 60_000;

  function take(key) {
    const t = now();
    let b = buckets.get(key);
    if (!b) {
      b = { tokens: capacity, updated: t };
      buckets.set(key, b);
    }
    b.tokens = Math.min(capacity, b.tokens + (t - b.updated) * refillPerMs);
    b.updated = t;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { allowed: true, remaining: Math.floor(b.tokens), retryAfterSeconds: 0 };
    }
    const retryAfterSeconds = Math.ceil((1 - b.tokens) / refillPerMs / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  // Drop buckets that have been full for a while so memory stays bounded.
  function prune() {
    const t = now();
    const fullAfterMs = capacity / refillPerMs;
    for (const [key, b] of buckets) {
      if (t - b.updated > fullAfterMs) buckets.delete(key);
    }
  }

  return { take, prune, size: () => buckets.size };
}

export function rateLimit({ capacity = 10, refillPerMinute = 6, now, keyOf = (req) => req.ip, logger } = {}) {
  const bucket = createTokenBucket({ capacity, refillPerMinute, now });
  let calls = 0;

  const middleware = function rateLimitMiddleware(req, res, next) {
    if ((calls += 1) % 1000 === 0) bucket.prune();
    const key = keyOf(req) || 'unknown';
    const result = bucket.take(key);
    res.set('RateLimit-Limit', String(capacity));
    res.set('RateLimit-Remaining', String(result.remaining));
    if (result.allowed) return next();
    res.set('Retry-After', String(result.retryAfterSeconds));
    logger?.warn({ message: 'rate limited', path: req.path, retryAfterSeconds: result.retryAfterSeconds });
    return res.status(429).json({ error: 'rate_limited', retryAfterSeconds: result.retryAfterSeconds });
  };
  middleware.bucket = bucket;
  return middleware;
}
