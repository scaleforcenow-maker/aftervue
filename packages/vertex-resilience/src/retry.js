import { statusOf } from './errors.js';

/**
 * Full-jitter exponential backoff policy.
 *
 * delay(n) = random() * min(capMs, baseMs * 2^(n-1)) for the n-th failure,
 * raised to Retry-After when the provider sent one.
 *
 * Only 429 and 503 are retried by default. Other 4xx are never retried.
 *
 * @param {object} [opts]
 * @param {number} [opts.baseMs=1000]
 * @param {number} [opts.capMs=8000]
 * @param {number} [opts.maxAttempts=3] total attempts per model (1 = no retries)
 * @param {number[]} [opts.retryOnStatuses=[429,503]]
 * @param {() => number} [opts.random=Math.random] injection point for tests
 */
export function createRetryPolicy({
  baseMs = 1000,
  capMs = 8000,
  maxAttempts = 3,
  retryOnStatuses = [429, 503],
  random = Math.random,
} = {}) {
  if (!(baseMs >= 0)) throw new TypeError('baseMs must be >= 0');
  if (!(capMs >= 0)) throw new TypeError('capMs must be >= 0');
  if (!(Number.isInteger(maxAttempts) && maxAttempts >= 1)) throw new TypeError('maxAttempts must be an integer >= 1');
  // A 4xx other than 429 is a caller error and is never retried, whatever the config says.
  const statuses = new Set(retryOnStatuses.filter((s) => s === 429 || s >= 500));

  return {
    baseMs,
    capMs,
    maxAttempts,
    retryOnStatuses: [...statuses],

    /** True when the error is a status this policy retries (or flagged retryable with no status). */
    shouldRetry(err) {
      const status = statusOf(err);
      if (status !== undefined) return statuses.has(status);
      return err?.retryable === true;
    },

    /** Delay before the retry that follows the `failures`-th failure (1-based). */
    delayMs(failures, { retryAfterMs } = {}) {
      const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, failures - 1));
      const jittered = Math.floor(random() * exp);
      if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > jittered) {
        return Math.ceil(retryAfterMs);
      }
      return jittered;
    },
  };
}
