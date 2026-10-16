import { systemClock, sleep } from './clock.js';
import { createRateLimiter } from './token-bucket.js';
import { createQueue } from './queue.js';
import { createRetryPolicy } from './retry.js';
import { createMetrics } from './metrics.js';
import { DeadlineError, ModelsExhaustedError, QueueFullError, statusOf } from './errors.js';

const isInstance = (obj, method) => Boolean(obj) && typeof obj[method] === 'function';

/**
 * Wraps a generic image-generation client with a bounded queue, per-model
 * token buckets, jittered retry, a model fallback chain, a per-request
 * deadline, and in-memory counters.
 *
 * Client interface: `client.generate(model, request, { signal }) -> Promise<result>`.
 * Errors thrown by the client should carry a numeric `status`; `retryAfterMs`
 * and `retryable` are honoured when present.
 *
 * The `request` object is handed to the client and nowhere else: it is never
 * stored on the generator, copied into an event, or attached to an error.
 *
 * @param {object} options
 * @param {string[]} options.models fallback chain, primary first
 * @param {{generate: Function}} options.client
 * @param {object} [options.limiter] limiter instance or createRateLimiter options
 * @param {object} [options.queue] queue instance or createQueue options
 * @param {object} [options.retry] retry policy instance or createRetryPolicy options
 * @param {number} [options.deadlineMs=45000]
 * @param {boolean} [options.enabled=true] false = call the client directly
 * @param {(event: object) => void} [options.onEvent]
 * @param {boolean} [options.failFastOnEstimate=false] reject at enqueue when the estimate already exceeds the budget
 * @param {object} [options.clock]
 * @param {() => number} [options.random] jitter source for the default retry policy
 * @param {number} [options.latencyWindow=64]
 */
export function createResilientGenerator(options = {}) {
  const {
    models,
    client,
    deadlineMs = 45_000,
    enabled = true,
    onEvent,
    failFastOnEstimate = false,
    clock = systemClock,
    random,
    latencyWindow = 64,
  } = options;

  if (!Array.isArray(models) || models.length === 0 || models.some((m) => typeof m !== 'string' || !m)) {
    throw new TypeError('models must be a non-empty array of model names');
  }
  if (!isInstance(client, 'generate')) throw new TypeError('client must expose generate(model, request, { signal })');
  if (!(deadlineMs > 0)) throw new TypeError('deadlineMs must be > 0');

  const limiter = isInstance(options.limiter, 'tryTake')
    ? options.limiter
    : createRateLimiter({ clock, ...(options.limiter ?? {}) });
  const queue = isInstance(options.queue, 'enqueue')
    ? options.queue
    : createQueue({ concurrency: models.length, ...(options.queue ?? {}) });
  const retry = isInstance(options.retry, 'delayMs')
    ? options.retry
    : createRetryPolicy({ ...(random ? { random } : {}), ...(options.retry ?? {}) });
  const metrics = createMetrics({ latencyWindow });
  metrics.ensure(models);

  let nextId = 1;
  let waitingForToken = 0; // admitted jobs currently blocked on a bucket

  // Events carry scalars only. The request object is never referenced here.
  function emit(type, fields) {
    if (typeof onEvent !== 'function') return;
    try {
      onEvent({ type, at: clock.now(), ...fields });
    } catch {
      /* observers must never break generation */
    }
  }

  /**
   * Expected wait (ms) for a request with `ahead` requests in front of it:
   * the later of (a) when the chain's buckets will have produced ahead+1
   * tokens and (b) how long those requests take to clear the concurrency
   * slots at the observed median latency (0 until there are samples).
   */
  function estimateWaitMs(ahead) {
    const arrivals = [];
    for (const m of models) arrivals.push(...limiter.tokenArrivalTimes(m, ahead + 1));
    arrivals.sort((a, b) => a - b);
    const tokenWait = arrivals[ahead] ?? 0;
    const p50 = metrics.medianLatency();
    const slots = typeof queue.concurrency === 'number' && queue.concurrency >= 1 ? queue.concurrency : 1;
    const serviceWait = p50 === null ? 0 : Math.ceil(ahead / slots) * p50;
    return Math.max(tokenWait, serviceWait);
  }

  /** Estimate for a brand-new request arriving now. */
  function estimate() {
    return {
      queuePosition: queue.size(),
      running: queue.running(),
      estimatedWaitMs: estimateWaitMs(queue.size() + waitingForToken),
      tokensAvailable: Object.fromEntries(models.map((m) => [m, limiter.available(m)])),
    };
  }

  function recordFailure(model, status) {
    const m = metrics.model(model);
    if (status === 429) m.http429 += 1;
    else if (status === 503) m.http503 += 1;
    else m.otherErrors += 1;
  }

  async function generate(request, { signal } = {}) {
    if (!enabled) {
      metrics.totals.bypassed += 1;
      emit('bypass', { model: models[0] });
      const result = await client.generate(models[0], request, { signal });
      return { result, servedBy: models[0], degraded: false, attempts: 1, fallbackReason: null, bypassed: true };
    }
    if (signal?.aborted) throw signal.reason;

    const ctx = {
      id: nextId++,
      startedAt: clock.now(),
      attempts: 0,
      model: null,
      phase: 'queued',
      deadlineError: null,
      ticket: null,
    };
    ctx.deadlineAt = ctx.startedAt + deadlineMs;
    metrics.totals.requests += 1;

    const ctl = new AbortController();
    const onCallerAbort = () => ctl.abort(signal.reason);
    signal?.addEventListener('abort', onCallerAbort, { once: true });

    /** Builds, records and remembers the DeadlineError for this request. */
    function deadline(estimateOverride) {
      if (ctx.deadlineError) return ctx.deadlineError;
      let queuePosition = 0;
      let ahead;
      if (estimateOverride) {
        ({ queuePosition, ahead } = estimateOverride);
      } else {
        const pos = ctx.ticket ? ctx.ticket.position() : queue.size();
        if (pos >= 0) {
          queuePosition = pos;
          ahead = pos + waitingForToken;
        } else {
          ahead = Math.max(0, waitingForToken - 1);
        }
      }
      const err = new DeadlineError({
        deadlineMs,
        estimatedWaitMs: estimateWaitMs(ahead),
        queuePosition,
        model: ctx.model,
        attempts: ctx.attempts,
        phase: ctx.phase,
      });
      ctx.deadlineError = err;
      metrics.totals.deadlineExceeded += 1;
      metrics.totals.failed += 1;
      if (ctx.model) metrics.model(ctx.model).deadlineExceeded += 1;
      emit('deadline', {
        id: ctx.id,
        model: ctx.model,
        phase: ctx.phase,
        attempts: ctx.attempts,
        estimatedWaitMs: err.estimatedWaitMs,
        queuePosition,
      });
      return err;
    }
    ctx.deadline = deadline;

    const deadlineTimer = clock.setTimeout(() => ctl.abort(deadline()), deadlineMs);

    try {
      const pre = estimate();
      if (failFastOnEstimate && pre.estimatedWaitMs > deadlineMs) {
        throw deadline({ queuePosition: pre.queuePosition, ahead: queue.size() + waitingForToken });
      }

      try {
        ctx.ticket = queue.enqueue(() => runChain(request, ctx, ctl.signal), {
          signal: ctl.signal,
          estimatedWaitMs: pre.estimatedWaitMs,
        });
      } catch (err) {
        if (err instanceof QueueFullError) {
          metrics.totals.queueFull += 1;
          metrics.totals.failed += 1;
          emit('queue_full', { id: ctx.id, queueDepth: err.queueDepth, maxDepth: err.maxDepth, estimatedWaitMs: err.estimatedWaitMs });
        }
        throw err;
      }
      ctx.ticket.promise.catch(() => {}); // settled after a lost race: already reported via the abort
      emit('queued', { id: ctx.id, queuePosition: ctx.ticket.position(), queueDepth: queue.size(), estimatedWaitMs: pre.estimatedWaitMs });

      // Race against the abort so the caller hears about a deadline on time even if the
      // client ignores the signal and keeps the queue slot busy.
      const outcome = await Promise.race([ctx.ticket.promise, rejectOnAbort(ctl.signal)]);
      metrics.totals.served += 1;
      if (outcome.degraded) metrics.totals.degraded += 1;
      return outcome;
    } catch (err) {
      // Whatever the inner rejection was (abort, client error), a deadline is the cause.
      if (ctx.deadlineError) throw ctx.deadlineError;
      if (!(err instanceof QueueFullError)) {
        metrics.totals.failed += 1;
        const callerAborted = Boolean(signal?.aborted);
        emit(callerAborted ? 'aborted' : 'error', {
          id: ctx.id,
          model: ctx.model,
          status: statusOf(err) ?? null,
          errorName: err?.name ?? null,
          attempts: ctx.attempts,
        });
      }
      throw err;
    } finally {
      clock.clearTimeout(deadlineTimer);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  /** Waits for `ms` on the clock while counted as blocked on a token. */
  async function waitForToken(ms, ctx, signal) {
    ctx.phase = 'waiting for rate-limit token';
    if (clock.now() + ms > ctx.deadlineAt) {
      // Provably cannot be served in budget: fail now with the honest estimate.
      throw ctx.deadline({ queuePosition: 0, ahead: Math.max(0, waitingForToken) });
    }
    waitingForToken += 1;
    try {
      await sleep(ms, { clock, signal });
    } finally {
      waitingForToken -= 1;
    }
  }

  /** Runs once the queue admits the request: pick a model, retry, fall back. */
  async function runChain(request, ctx, signal) {
    const failed = new Map(); // model -> { reason, status, attempts }
    emit('started', { id: ctx.id, waitedMs: clock.now() - ctx.startedAt });

    for (;;) {
      signal.throwIfAborted();
      const candidates = models.filter((m) => !failed.has(m));
      if (candidates.length === 0) {
        const causes = models.map((m) => ({ model: m, ...failed.get(m) }));
        throw new ModelsExhaustedError({ causes, attempts: ctx.attempts });
      }

      const model = candidates.find((m) => limiter.available(m) >= 1);
      if (!model) {
        // Nobody has a token: wait for whichever candidate refills first.
        const soonest = candidates
          .map((m) => ({ m, ms: limiter.timeUntilToken(m) }))
          .reduce((a, b) => (b.ms < a.ms ? b : a));
        ctx.model = soonest.m;
        await waitForToken(soonest.ms, ctx, signal);
        continue;
      }

      const degraded = model !== models[0];
      let fallbackReason = null;
      if (degraded) {
        const previous = candidates.length === models.length ? null : [...failed.keys()].at(-1);
        fallbackReason = previous ? failed.get(previous).reason : 'bucket_empty';
        emit('fallback', { id: ctx.id, from: previous ?? models[models.indexOf(model) - 1], to: model, reason: fallbackReason });
      }

      const otherModelReady = () => models.some((m) => m !== model && !failed.has(m) && limiter.available(m) >= 1);
      const res = await tryModel(model, request, ctx, signal, otherModelReady);
      if (res.ok) {
        if (degraded) metrics.model(model).fallbacks += 1;
        return {
          result: res.result,
          servedBy: model,
          degraded,
          attempts: ctx.attempts,
          fallbackReason,
          waitedMs: res.firstAttemptAt - ctx.startedAt,
          latencyMs: res.latencyMs,
          bypassed: false,
        };
      }
      failed.set(model, { reason: res.reason, status: res.status, attempts: res.attempts });
      emit('model_failed', { id: ctx.id, model, reason: res.reason, status: res.status, attempts: res.attempts });
    }
  }

  /**
   * Attempts one model up to retry.maxAttempts times. Each attempt consumes a
   * token because each attempt is a real call against the provider's quota.
   * Gives up early (so the chain falls back) when the next retry would have
   * to wait on an empty bucket while another model could serve right now.
   * Returns { ok, result } or { ok: false, reason, status, attempts }.
   * Throws for non-retryable errors (any 4xx other than 429, 5xx other than 503).
   */
  async function tryModel(model, request, ctx, signal, otherModelReady) {
    const m = metrics.model(model);
    let attempts = 0;
    let firstAttemptAt = null;
    ctx.model = model;

    for (;;) {
      signal.throwIfAborted();
      if (!limiter.tryTake(model)) {
        const ms = limiter.timeUntilToken(model);
        if (clock.now() + ms > ctx.deadlineAt) {
          return { ok: false, reason: 'rate_limited_past_deadline', status: null, attempts };
        }
        await waitForToken(ms, ctx, signal);
        continue;
      }

      attempts += 1;
      ctx.attempts += 1;
      m.attempts += 1;
      ctx.phase = `calling ${model}`;
      const attemptAt = clock.now();
      if (firstAttemptAt === null) firstAttemptAt = attemptAt;
      emit('attempt', { id: ctx.id, model, attempt: attempts });

      let result;
      try {
        result = await client.generate(model, request, { signal });
        if (signal.aborted) throw signal.reason; // too late to count: the caller already has an error
      } catch (err) {
        if (signal.aborted) throw signal.reason ?? err;
        const status = statusOf(err) ?? null;
        recordFailure(model, status);
        if (!retry.shouldRetry(err)) {
          emit('client_error', { id: ctx.id, model, attempt: attempts, status, errorName: err?.name ?? null });
          throw err;
        }
        if (attempts >= retry.maxAttempts) {
          return { ok: false, reason: `http_${status ?? 'retryable'}`, status, attempts };
        }
        const retryAfterMs = typeof err.retryAfterMs === 'number' ? err.retryAfterMs : undefined;
        const backoff = retry.delayMs(attempts, { retryAfterMs });
        const tokenWait = limiter.timeUntilToken(model);
        const delayMs = Math.max(backoff, tokenWait);
        if (clock.now() + delayMs > ctx.deadlineAt) {
          return { ok: false, reason: `http_${status ?? 'retryable'}`, status, attempts };
        }
        if (tokenWait > backoff && otherModelReady()) {
          // This model's bucket is the binding constraint and a sibling can serve now: fall back.
          return { ok: false, reason: `http_${status ?? 'retryable'}`, status, attempts };
        }
        emit('retry', { id: ctx.id, model, attempt: attempts, status, delayMs, retryAfterMs: retryAfterMs ?? null });
        ctx.phase = `backing off before retrying ${model}`;
        await sleep(delayMs, { clock, signal });
        continue;
      }

      const latencyMs = clock.now() - attemptAt;
      m.success += 1;
      metrics.recordLatency(model, latencyMs);
      emit('success', { id: ctx.id, model, attempt: attempts, latencyMs, degraded: model !== models[0] });
      return { ok: true, result, attempts, latencyMs, firstAttemptAt };
    }
  }

  function rejectOnAbort(signal) {
    return new Promise((_, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  }

  function snapshot() {
    const { totals, perModel } = metrics.snapshot();
    const buckets = typeof limiter.snapshot === 'function' ? limiter.snapshot() : {};
    for (const m of models) {
      perModel[m] = { ...perModel[m], tokensAvailable: limiter.available(m), bucket: buckets[m] ?? null };
    }
    return {
      enabled,
      models: [...models],
      deadlineMs,
      queue: typeof queue.snapshot === 'function' ? queue.snapshot() : { waiting: queue.size(), running: queue.running() },
      waitingForToken,
      estimatedWaitMs: estimateWaitMs(queue.size() + waitingForToken),
      totals,
      perModel,
    };
  }

  return { generate, snapshot, estimate, enabled, models: [...models], limiter, queue, retry };
}
