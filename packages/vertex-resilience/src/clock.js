/**
 * Clock injection point. Everything time-related in this package goes through
 * a clock object so tests can run with fake time.
 */
export const systemClock = Object.freeze({
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
});

/** Sleep on the given clock; rejects with `signal.reason` if aborted. */
export function sleep(ms, { clock = systemClock, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clock.clearTimeout(id);
      reject(signal.reason);
    };
    const id = clock.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
