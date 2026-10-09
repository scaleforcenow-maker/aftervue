/**
 * In-memory counters and a latency ring buffer per model. No payloads, ever:
 * only numbers and model names go in here.
 */
export function createMetrics({ latencyWindow = 64 } = {}) {
  const models = new Map();
  const totals = {
    requests: 0,
    served: 0,
    degraded: 0,
    failed: 0,
    queueFull: 0,
    deadlineExceeded: 0,
    bypassed: 0,
  };

  function model(name) {
    let m = models.get(name);
    if (!m) {
      m = {
        attempts: 0,
        success: 0,
        http429: 0,
        http503: 0,
        otherErrors: 0,
        fallbacks: 0,
        deadlineExceeded: 0,
        ring: new Array(latencyWindow),
        ringNext: 0,
        ringCount: 0,
      };
      models.set(name, m);
    }
    return m;
  }

  function percentile(sorted, p) {
    if (sorted.length === 0) return null;
    const rank = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
  }

  return {
    totals,
    model,
    ensure(names) {
      for (const n of names) model(n);
    },
    recordLatency(name, ms) {
      const m = model(name);
      m.ring[m.ringNext] = ms;
      m.ringNext = (m.ringNext + 1) % latencyWindow;
      m.ringCount = Math.min(latencyWindow, m.ringCount + 1);
    },
    /** Median latency across every model's ring buffer, or null without samples. */
    medianLatency() {
      const all = [];
      for (const m of models.values()) all.push(...m.ring.slice(0, m.ringCount));
      all.sort((a, b) => a - b);
      return percentile(all, 50);
    },
    snapshot() {
      const perModel = {};
      for (const [name, m] of models) {
        const sorted = m.ring.slice(0, m.ringCount).sort((a, b) => a - b);
        perModel[name] = {
          attempts: m.attempts,
          success: m.success,
          http429: m.http429,
          http503: m.http503,
          otherErrors: m.otherErrors,
          fallbacks: m.fallbacks,
          deadlineExceeded: m.deadlineExceeded,
          latencyMs: { p50: percentile(sorted, 50), p95: percentile(sorted, 95), samples: sorted.length },
        };
      }
      return { totals: { ...totals }, perModel };
    },
  };
}
