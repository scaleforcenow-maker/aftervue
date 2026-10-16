/**
 * Typed errors thrown by the resilient generator.
 *
 * None of these carry the request payload. They only carry scalars that a
 * caller needs to decide what to show the user (status codes, estimates,
 * model names, attempt counts).
 */

export class ResilienceError extends Error {
  constructor(message, { code, ...props } = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    Object.assign(this, props);
  }
}

/** The per-process queue already holds `maxDepth` waiting requests. */
export class QueueFullError extends ResilienceError {
  constructor({ queueDepth, maxDepth, estimatedWaitMs }) {
    super(`Queue is full (${queueDepth}/${maxDepth} waiting); try again in a moment`, {
      code: 'QUEUE_FULL',
      queueDepth,
      maxDepth,
      estimatedWaitMs,
      retryable: true,
    });
  }
}

/** The request's time budget elapsed (or provably cannot be met). */
export class DeadlineError extends ResilienceError {
  constructor({ deadlineMs, estimatedWaitMs, queuePosition, model = null, attempts = 0, phase }) {
    super(
      `Deadline of ${deadlineMs} ms exceeded while ${phase}; expected wait about ${Math.ceil(estimatedWaitMs / 1000)} s`,
      {
        code: 'DEADLINE',
        deadlineMs,
        estimatedWaitMs,
        queuePosition,
        model,
        attempts,
        phase,
        retryable: true,
      },
    );
  }
}

/** Every model in the chain failed with a retryable status after its retries. */
export class ModelsExhaustedError extends ResilienceError {
  constructor({ causes, attempts }) {
    const summary = causes.map((c) => `${c.model}: ${c.reason}${c.status ? ` (HTTP ${c.status})` : ''}`).join('; ');
    super(`All models failed: ${summary}`, {
      code: 'MODELS_EXHAUSTED',
      causes,
      attempts,
      retryable: true,
    });
  }
}

/**
 * Error shape produced by the Vertex adapter. The generator does not require
 * this class: any error with a numeric `status` (and optional `retryAfterMs`
 * or `retryable`) is understood.
 */
export class ClientError extends ResilienceError {
  constructor(message, { status, retryAfterMs, model, vertexStatus, retryable = false, code = 'CLIENT' } = {}) {
    super(message, { code, status, retryAfterMs, model, vertexStatus, retryable });
  }
}

/** Reads an HTTP status from any error shape a client might throw. */
export function statusOf(err) {
  if (!err || typeof err !== 'object') return undefined;
  const candidates = [err.status, err.statusCode, err.code, err.response?.status];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isInteger(c) && c >= 100 && c <= 599) return c;
  }
  return undefined;
}
