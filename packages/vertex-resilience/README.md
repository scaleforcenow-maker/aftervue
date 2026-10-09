# @aftervue/vertex-resilience

Queue, per-model token buckets, jittered retry, a model fallback chain, a
per-request deadline and in-memory counters for Vertex AI image generation.
ESM, Node 18+, zero runtime dependencies.

Why: the Vertex image models return `429 RESOURCE_EXHAUSTED` after about two
generations per minute per model, and the quota is not adjustable. This module
spreads a consult's images across the two models, waits instead of failing,
and tells the client honestly how long the wait is.

## Usage

```js
import { createResilientGenerator, createVertexAdapter, optionsFromEnv } from '@aftervue/vertex-resilience';

const client = createVertexAdapter({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  location: 'global',
  accessTokenProvider: () => auth.getAccessToken(), // google-auth-library, ADC, or metadata server
});

// One generator per process; module scope keeps the queue and counters alive between requests.
const gen = createResilientGenerator({
  models: ['gemini-3-pro-image', 'gemini-3.1-flash-image'],
  client,
  limiter: { ratePerMinute: 2, burst: 3 },      // per model
  queue: { maxDepth: 25 },                      // concurrency defaults to one slot per model
  retry: { baseMs: 1000, capMs: 8000, maxAttempts: 3 },
  deadlineMs: 45_000,
  onEvent: (e) => log.info(e),                  // scalars only, never the request
  ...optionsFromEnv(),                          // VERTEX_RESILIENCE_* overrides
});

const { result, servedBy, degraded, attempts } = await gen.generate(body, { signal });
```

`result` is the parsed `generateContent` response. `servedBy` is the model that
answered, `degraded` is true when it was not the primary, and `attempts` is the
number of calls made against Vertex.

## Errors

| Error | `code` | When | What to tell the user |
| --- | --- | --- | --- |
| `QueueFullError` | `QUEUE_FULL` | more than `maxDepth` requests already waiting | "Busy right now, try again in a moment" (`estimatedWaitMs`) |
| `DeadlineError` | `DEADLINE` | the budget elapsed, or provably cannot be met | "Still preparing, retry in N s" (`estimatedWaitMs`, `queuePosition`, `phase`) |
| `ModelsExhaustedError` | `MODELS_EXHAUSTED` | every model failed with 429/503 after retries | "Try again in a minute" (`causes` per model) |
| the client's own error | | any 4xx other than 429, or a 5xx other than 503 | a real request error; not retried, no fallback |

All three typed errors have `retryable: true`. None carries the request.

## Client interface

```ts
client.generate(model: string, request: unknown, { signal: AbortSignal }): Promise<unknown>
```

Thrown errors should carry a numeric `status` (`statusCode` and
`response.status` are also read). `retryAfterMs` is honoured on 429/503, and
`retryable: true` marks a network error with no status as retryable.
`createVertexAdapter` produces exactly this shape from the REST API; the request
body is built by the caller and passed through untouched.

## Behaviour

- **Queue**: FIFO, `concurrency` slots (default `models.length`), `maxDepth`
  waiting. Beyond that, `QueueFullError` immediately.
- **Limiter**: a bucket per model, starts full at `burst`, refills at
  `ratePerMinute`. Every attempt against the provider takes a token.
- **Model choice**: the first model in the chain with a token. If none has one,
  wait for whichever refills first (bounded by the deadline).
- **Retry**: on 429 and 503 only, full-jitter backoff
  `random() * min(capMs, baseMs * 2^(n-1))`, raised to `Retry-After` when the
  provider sent one. A retry that would have to wait on an empty bucket while
  a sibling model can serve now falls back instead of waiting.
- **Fallback**: after `maxAttempts` on a model (or when its bucket is empty),
  the next model in the chain. The result says `degraded: true` and
  `fallbackReason` (`bucket_empty`, `http_429`, `http_503`).
- **Deadline**: `deadlineMs` per request. The error's `estimatedWaitMs` comes
  from queue position, bucket refill times across the chain and the observed
  median latency. `failFastOnEstimate: true` rejects at enqueue when the
  estimate already exceeds the budget.
- **`enabled: false`**: `generate()` calls `client.generate(models[0], ...)`
  directly. No queue, limiter, retry or fallback.

## Observability

`gen.snapshot()` returns counters for a health endpoint:

```js
{
  enabled, models, deadlineMs,
  queue: { waiting, running, concurrency, maxDepth },
  waitingForToken,
  estimatedWaitMs,            // for a request arriving now
  totals: { requests, served, degraded, failed, queueFull, deadlineExceeded, bypassed },
  perModel: {
    'gemini-3-pro-image': {
      attempts, success, http429, http503, otherErrors, fallbacks, deadlineExceeded,
      latencyMs: { p50, p95, samples },   // ring buffer, default 64 samples
      tokensAvailable, bucket: { tokens, capacity, ratePerMinute, nextTokenInMs },
    },
  },
}
```

`gen.estimate()` returns `{ queuePosition, running, estimatedWaitMs, tokensAvailable }`
for a request arriving now, so a UI can show a wait before submitting.

`onEvent` receives `{ type, at, id, ... }` with types `queued`, `queue_full`,
`started`, `attempt`, `retry`, `fallback`, `model_failed`, `success`,
`client_error`, `deadline`, `error`, `aborted`, `bypass`. Fields are model
names, counts, statuses and durations. The request object is never referenced;
`test/generator.test.js` passes a payload with `image`, `prompt` and
`inlineData` fields through every path and asserts none of it appears in any
event, error or snapshot.

## Testing

```
npm test
```

Uses `node:test` with an injected fake clock (`test/helpers/fake-clock.js`);
no real waiting, no network.
