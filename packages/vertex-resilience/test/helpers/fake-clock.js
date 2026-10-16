/**
 * Deterministic clock for tests. `advance(ms)` fires due timers in time order
 * and lets promise chains settle between them.
 */
export function createFakeClock(start = 1_000_000) {
  let now = start;
  let seq = 0;
  const timers = new Map();

  async function flush(rounds = 20) {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
  }

  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: now + Math.max(0, ms), seq: id, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    pending: () => timers.size,
    flush,
    async advance(ms) {
      const target = now + ms;
      await flush();
      for (;;) {
        let next = null;
        for (const t of timers.values()) {
          if (t.at <= target && (!next || t.at < next.at || (t.at === next.at && t.seq < next.seq))) next = t;
        }
        if (!next) break;
        timers.delete(next.seq);
        now = Math.max(now, next.at);
        next.fn();
        await flush();
      }
      now = target;
      await flush();
    },
  };
}

/** Builds a scripted client: `plan[model]` is an array of outcomes consumed per call. */
export function scriptedClient(plan, { clock } = {}) {
  const calls = [];
  const client = {
    calls,
    async generate(model, request, { signal } = {}) {
      calls.push({ model, request, signal });
      const steps = plan[model] ?? [];
      const step = steps.length > 1 ? steps.shift() : steps[0];
      if (!step) throw new Error(`no scripted outcome for ${model}`);
      if (step.delayMs && clock) {
        await new Promise((resolve, reject) => {
          const id = clock.setTimeout(resolve, step.delayMs);
          signal?.addEventListener('abort', () => {
            clock.clearTimeout(id);
            reject(signal.reason);
          }, { once: true });
        });
      }
      if (step.hang && step.ignoreAbort) {
        await new Promise(() => {}); // a client that never honours the signal
      }
      if (step.hang) {
        await new Promise((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason), { once: true }));
      }
      if (step.error) throw step.error;
      return step.result ?? { ok: true, model };
    },
  };
  return client;
}

export function httpError(status, extra = {}) {
  const e = new Error(`HTTP ${status}`);
  e.status = status;
  Object.assign(e, extra);
  return e;
}
