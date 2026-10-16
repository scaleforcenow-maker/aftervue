import { QueueFullError } from './errors.js';

/**
 * Bounded FIFO queue with a concurrency limit.
 *
 * `enqueue(fn, { signal })` returns a ticket: `{ promise, position() }`.
 * Throws `QueueFullError` synchronously when `maxDepth` requests are already
 * waiting, so callers fail fast instead of piling up.
 *
 * @param {object} [opts]
 * @param {number} [opts.concurrency=1] jobs allowed to run at once
 * @param {number} [opts.maxDepth=25] jobs allowed to wait (running jobs excluded)
 */
export function createQueue({ concurrency = 1, maxDepth = 25 } = {}) {
  if (!(Number.isInteger(concurrency) && concurrency >= 1)) throw new TypeError('concurrency must be an integer >= 1');
  if (!(Number.isInteger(maxDepth) && maxDepth >= 0)) throw new TypeError('maxDepth must be an integer >= 0');

  const waiting = [];
  let running = 0;

  function pump() {
    while (running < concurrency && waiting.length > 0) {
      const entry = waiting.shift();
      entry.detach();
      entry.state = 'running';
      running += 1;
      const settle = () => {
        entry.state = 'done';
        running -= 1;
        pump();
      };
      Promise.resolve()
        .then(() => entry.fn())
        .then(
          (v) => {
            settle();
            entry.resolve(v);
          },
          (e) => {
            settle();
            entry.reject(e);
          },
        );
    }
  }

  return {
    enqueue(fn, { signal, estimatedWaitMs } = {}) {
      if (typeof fn !== 'function') throw new TypeError('enqueue expects a function');
      if (signal?.aborted) throw signal.reason;
      if (waiting.length >= maxDepth && running >= concurrency) {
        throw new QueueFullError({ queueDepth: waiting.length, maxDepth, estimatedWaitMs });
      }
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      const entry = { fn, resolve, reject, state: 'waiting', detach: () => {} };
      if (signal) {
        const onAbort = () => {
          const i = waiting.indexOf(entry);
          if (i >= 0) {
            waiting.splice(i, 1);
            entry.state = 'done';
            reject(signal.reason);
          }
        };
        signal.addEventListener('abort', onAbort, { once: true });
        entry.detach = () => signal.removeEventListener('abort', onAbort);
      }
      waiting.push(entry);
      pump();
      return {
        promise,
        /** 0-based position among waiting jobs, or -1 once running/done. */
        position: () => waiting.indexOf(entry),
        get state() {
          return entry.state;
        },
      };
    },
    /** Number of jobs waiting (not running). */
    size: () => waiting.length,
    running: () => running,
    concurrency,
    maxDepth,
    snapshot: () => ({ waiting: waiting.length, running, concurrency, maxDepth }),
  };
}
