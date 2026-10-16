import { systemClock } from './clock.js';

const EPSILON = 1e-9;

/**
 * Token-bucket rate limiter keyed by model.
 *
 * Each model gets its own bucket with `burst` capacity that refills at
 * `ratePerMinute`. Buckets start full, so a cold process can burst.
 *
 * @param {object} [opts]
 * @param {number} [opts.ratePerMinute=2] sustained rate per model
 * @param {number} [opts.burst=3] bucket capacity per model
 * @param {Record<string,{ratePerMinute?:number,burst?:number}>} [opts.perModel] overrides
 * @param {{now:()=>number}} [opts.clock]
 */
export function createRateLimiter({ ratePerMinute = 2, burst = 3, perModel = {}, clock = systemClock } = {}) {
  if (!(ratePerMinute > 0)) throw new TypeError('ratePerMinute must be > 0');
  if (!(burst >= 1)) throw new TypeError('burst must be >= 1');
  const buckets = new Map();

  function bucket(model) {
    let b = buckets.get(model);
    if (!b) {
      const o = perModel[model] ?? {};
      const capacity = o.burst ?? burst;
      const rate = o.ratePerMinute ?? ratePerMinute;
      b = { capacity, refillPerMs: rate / 60_000, ratePerMinute: rate, tokens: capacity, updatedAt: clock.now() };
      buckets.set(model, b);
    }
    refill(b);
    return b;
  }

  function refill(b) {
    const now = clock.now();
    const elapsed = Math.max(0, now - b.updatedAt);
    if (elapsed > 0) {
      b.tokens = Math.min(b.capacity, b.tokens + elapsed * b.refillPerMs);
      b.updatedAt = now;
    }
  }

  return {
    /** Whole tokens available right now. */
    available(model) {
      return Math.floor(bucket(model).tokens + EPSILON);
    },

    /** Take one token if available. Returns true on success. */
    tryTake(model) {
      const b = bucket(model);
      if (b.tokens + EPSILON >= 1) {
        b.tokens = Math.max(0, b.tokens - 1);
        return true;
      }
      return false;
    },

    /** Milliseconds until `n` whole tokens are available (0 if already). */
    timeUntilToken(model, n = 1) {
      const b = bucket(model);
      if (b.tokens + EPSILON >= n) return 0;
      return Math.ceil((n - b.tokens) / b.refillPerMs - EPSILON);
    },

    /**
     * Arrival offsets (ms from now) of the next `k` tokens, assuming each is
     * consumed as it arrives. Used for honest wait estimates: the cap does not
     * apply because earlier requests drain tokens as they appear.
     */
    tokenArrivalTimes(model, k) {
      const b = bucket(model);
      const out = [];
      for (let i = 0; i < k; i++) {
        const needed = i + 1;
        out.push(b.tokens + EPSILON >= needed ? 0 : Math.ceil((needed - b.tokens) / b.refillPerMs - EPSILON));
      }
      return out;
    },

    /** Empty a model's bucket (e.g. the provider says we are over quota). */
    drain(model) {
      bucket(model).tokens = 0;
    },

    snapshot() {
      const out = {};
      for (const [model, b] of buckets) {
        refill(b);
        out[model] = {
          tokens: Math.round(b.tokens * 1000) / 1000,
          capacity: b.capacity,
          ratePerMinute: b.ratePerMinute,
          nextTokenInMs: b.tokens + EPSILON >= 1 ? 0 : Math.ceil((1 - b.tokens) / b.refillPerMs - EPSILON),
        };
      }
      return out;
    },
  };
}
