/**
 * Reads generator options from environment variables so the behaviour can be
 * tuned (or switched off) per deployment without a code change.
 *
 *   VERTEX_RESILIENCE_ENABLED        true|false (default true)
 *   VERTEX_RESILIENCE_MODELS         comma list, primary first
 *   VERTEX_RESILIENCE_RATE_PER_MIN   sustained per-model rate (default 2)
 *   VERTEX_RESILIENCE_BURST          per-model bucket size (default 3)
 *   VERTEX_RESILIENCE_CONCURRENCY    jobs in flight (default: one per model)
 *   VERTEX_RESILIENCE_QUEUE_DEPTH    waiting jobs before QueueFullError (default 25)
 *   VERTEX_RESILIENCE_DEADLINE_MS    per-request budget (default 45000)
 *   VERTEX_RESILIENCE_RETRY_ATTEMPTS attempts per model (default 3)
 *   VERTEX_RESILIENCE_RETRY_BASE_MS  backoff base (default 1000)
 *   VERTEX_RESILIENCE_RETRY_CAP_MS   backoff cap (default 8000)
 *   VERTEX_RESILIENCE_FAIL_FAST      true|false (default false)
 *
 * Only the keys present in `env` are returned, so the result can be spread
 * over code defaults.
 */
export function optionsFromEnv(env = process.env, { prefix = 'VERTEX_RESILIENCE_' } = {}) {
  const out = {};
  const get = (k) => env[prefix + k];
  const bool = (v) => !['false', '0', 'no', 'off', ''].includes(String(v).trim().toLowerCase());
  const int = (v, name) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new TypeError(`${prefix}${name} must be a number, got ${JSON.stringify(v)}`);
    return n;
  };

  if (get('ENABLED') !== undefined) out.enabled = bool(get('ENABLED'));
  if (get('MODELS')) out.models = get('MODELS').split(',').map((s) => s.trim()).filter(Boolean);
  if (get('DEADLINE_MS') !== undefined) out.deadlineMs = int(get('DEADLINE_MS'), 'DEADLINE_MS');
  if (get('FAIL_FAST') !== undefined) out.failFastOnEstimate = bool(get('FAIL_FAST'));

  const limiter = {};
  if (get('RATE_PER_MIN') !== undefined) limiter.ratePerMinute = int(get('RATE_PER_MIN'), 'RATE_PER_MIN');
  if (get('BURST') !== undefined) limiter.burst = int(get('BURST'), 'BURST');
  if (Object.keys(limiter).length) out.limiter = limiter;

  const queue = {};
  if (get('CONCURRENCY') !== undefined) queue.concurrency = int(get('CONCURRENCY'), 'CONCURRENCY');
  if (get('QUEUE_DEPTH') !== undefined) queue.maxDepth = int(get('QUEUE_DEPTH'), 'QUEUE_DEPTH');
  if (Object.keys(queue).length) out.queue = queue;

  const retry = {};
  if (get('RETRY_ATTEMPTS') !== undefined) retry.maxAttempts = int(get('RETRY_ATTEMPTS'), 'RETRY_ATTEMPTS');
  if (get('RETRY_BASE_MS') !== undefined) retry.baseMs = int(get('RETRY_BASE_MS'), 'RETRY_BASE_MS');
  if (get('RETRY_CAP_MS') !== undefined) retry.capMs = int(get('RETRY_CAP_MS'), 'RETRY_CAP_MS');
  if (Object.keys(retry).length) out.retry = retry;

  return out;
}
