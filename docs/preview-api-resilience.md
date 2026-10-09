# Preview API resilience: surviving Vertex AI image quota

Runbook for `packages/vertex-resilience`, the library `/api/generate` imports
so a busy demo degrades gracefully instead of serving the canned sample.

## 1. The problem it solves

Measured Sept 16, 2026 on the global endpoint: `gemini-3-pro-image` (primary)
and `gemini-3.1-flash-image` (fallback) each return `429 RESOURCE_EXHAUSTED`
after about two generations per minute, with short bursts to about five after
idle. The quota is not adjustable. A consult needs about six images.

What the module does with that:

| Mechanism | Default | Effect |
| --- | --- | --- |
| Token bucket per model | 2/min, burst 3 | we stop sending before Vertex says no; a cold process can burst 3 + 3 images across the two models |
| Bounded FIFO queue | one slot per model, 25 waiting | overflow fails fast with `QueueFullError` instead of piling up |
| Retry | 429 and 503 only, 3 attempts, full jitter 1 s base, 8 s cap, `Retry-After` honoured | absorbs the occasional 429 from a shared quota |
| Fallback chain | pro, then flash | an empty bucket or exhausted retries moves to the next model; the result says `degraded: true` |
| Deadline | 45 s | the caller gets `DeadlineError` with `estimatedWaitMs` instead of a hung request |
| Counters | in memory | `snapshot()` for the health endpoint; `onEvent` for logs; no payloads |
| Feature flag | `enabled: true` | `VERTEX_RESILIENCE_ENABLED=false` makes `generate()` a direct pass-through |

Throughput reality check: two models at 2/min each is 4 images/min sustained.
The first consult after idle gets 6 images from the burst in well under a
minute. A second consult right behind it waits for refills: roughly 90 s for
all six. Sequence the six requests client-side (see §4) so each one stays
inside its own 45 s budget, or raise `deadlineMs` for the later ones.

## 2. Wiring

### Vercel function

```js
// api/generate.js
import { createResilientGenerator, createVertexAdapter, optionsFromEnv,
         QueueFullError, DeadlineError, ModelsExhaustedError } from '../packages/vertex-resilience/src/index.js';
import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

// Module scope: one queue, one set of buckets and counters per warm instance.
const gen = createResilientGenerator({
  models: ['gemini-3-pro-image', 'gemini-3.1-flash-image'],
  client: createVertexAdapter({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.VERTEX_LOCATION ?? 'global',
    accessTokenProvider: async () => (await auth.getAccessToken()),
  }),
  onEvent: (e) => console.log(JSON.stringify({ src: 'preview-resilience', ...e })),
  ...optionsFromEnv(),
});

export const config = { maxDuration: 60 }; // must exceed deadlineMs (45 s default)

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // ... origin allowlist, per-IP limits, Turnstile, body validation as today ...
  const body = buildGenerateContentBody(req.body); // contents, generationConfig; built by the caller
  const ctl = new AbortController();
  req.on('close', () => ctl.abort(new Error('client closed')));
  try {
    const out = await gen.generate(body, { signal: ctl.signal });
    res.setHeader('X-Preview-Served-By', out.servedBy);
    res.setHeader('X-Preview-Degraded', String(out.degraded));
    return res.status(200).json({ ...extractImages(out.result), meta: { servedBy: out.servedBy, degraded: out.degraded, attempts: out.attempts, waitedMs: out.waitedMs } });
  } catch (err) {
    if (err instanceof QueueFullError || err instanceof DeadlineError || err instanceof ModelsExhaustedError) {
      const retryAfterMs = Math.max(1000, err.estimatedWaitMs ?? 30_000);
      res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      return res.status(503).json({ error: err.code, retryAfterMs, queuePosition: err.queuePosition ?? null });
    }
    if (err.status === 400) return res.status(400).json({ error: 'bad_request' });
    console.error(JSON.stringify({ src: 'preview-resilience', level: 'error', name: err.name, status: err.status ?? null })); // never the body
    return res.status(502).json({ error: 'upstream' });
  }
}
```

Health:

```js
// api/health.js
export default (req, res) => res.status(200).json({ ok: true, preview: gen.snapshot() });
```

Caveat that matters on Vercel: the queue and buckets are **per warm instance**.
Under load Vercel runs several instances, each with its own 2/min buckets, so
the aggregate can exceed the quota. The retry and fallback paths still catch
the resulting 429s, and the counters will show it (`http429` rising while
`tokensAvailable` is not zero). This is acceptable for a demo; the Cloud Run
layout below is the real fix.

### Cloud Run service

Same code, with an Express (or `node:http`) server. Two settings make the
per-process queue a real shared queue:

```
gcloud run deploy preview-api \
  --min-instances 1 --max-instances 1 \   # one process = one queue, one set of buckets
  --concurrency 40 \                       # many waiting requests per instance; the module bounds them
  --timeout 120 \                          # above deadlineMs
  --service-account preview-api@PROJECT.iam.gserviceaccount.com   # roles/aiplatform.user; no API key
  --set-env-vars VERTEX_RESILIENCE_ENABLED=true,VERTEX_RESILIENCE_DEADLINE_MS=45000
```

`accessTokenProvider` on Cloud Run: `google-auth-library`'s `GoogleAuth` uses
the attached service account via the metadata server, no key file. If you need
more than one instance later, keep `--max-instances` equal to the number of
instances and divide `VERTEX_RESILIENCE_RATE_PER_MIN` and `BURST` by it.

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `VERTEX_RESILIENCE_ENABLED` | `true` | `false` = direct pass-through, no queue/limiter/retry/fallback |
| `VERTEX_RESILIENCE_MODELS` | code default | comma list, primary first |
| `VERTEX_RESILIENCE_RATE_PER_MIN` | `2` | sustained per-model rate |
| `VERTEX_RESILIENCE_BURST` | `3` | per-model bucket size |
| `VERTEX_RESILIENCE_CONCURRENCY` | one per model | in-flight requests |
| `VERTEX_RESILIENCE_QUEUE_DEPTH` | `25` | waiting requests before `QueueFullError` |
| `VERTEX_RESILIENCE_DEADLINE_MS` | `45000` | per-request budget |
| `VERTEX_RESILIENCE_RETRY_ATTEMPTS` | `3` | attempts per model |
| `VERTEX_RESILIENCE_RETRY_BASE_MS` / `_CAP_MS` | `1000` / `8000` | backoff |
| `VERTEX_RESILIENCE_FAIL_FAST` | `false` | reject at enqueue when the estimate already exceeds the budget |
| `GOOGLE_CLOUD_PROJECT`, `VERTEX_LOCATION` | | passed to the adapter by the caller |

`optionsFromEnv()` returns only the keys that are set, so spreading it last
over the code defaults is safe.

## 3. Client-side contract

Response shapes the widget and the patient app should handle:

| HTTP | Body | UI |
| --- | --- | --- |
| 200 | `{ ...images, meta: { servedBy, degraded, attempts, waitedMs } }` | show the preview; if `degraded`, add the label below |
| 503 | `{ error: 'QUEUE_FULL' \| 'DEADLINE' \| 'MODELS_EXHAUSTED', retryAfterMs, queuePosition }` + `Retry-After` | keep the "preparing" state and retry automatically after `retryAfterMs` (cap at 2 retries, then a manual "try again" button) |
| 400 | `{ error: 'bad_request' }` | input problem; do not retry |
| 502 | `{ error: 'upstream' }` | one automatic retry after 5 s, then a manual button |

**"Preparing your preview" state.** The request can legitimately take 30 to
45 s. Before the first request, `GET /api/health` (or a tiny
`/api/generate/estimate` returning `gen.estimate()`) gives `estimatedWaitMs`.
Show "Preparing your preview, about N s" with a countdown from
`estimatedWaitMs + typical generation time` (`perModel[...].latencyMs.p50`),
and keep the state through a 503 by resetting the countdown to its
`retryAfterMs`. Never show the demo sample in this state.

**Sequence, do not fan out.** Send the six image requests for a consult one or
two at a time, not all six at once. Six concurrent requests each carry a 45 s
budget, and the last ones will spend most of it queued; two at a time matches
the two model slots and keeps every request inside its budget.

**Labelling a degraded result.** When `meta.degraded` is true the image came
from the flash model. Label it factually and calmly, for example "Generated
with our fast model". Do not describe it as lower quality, and do not block
the flow. The `X-Preview-Degraded` header carries the same flag for callers
that only read headers.

**Cancel on navigation.** Abort the fetch when the user leaves the step; the
function propagates the abort into the queue, so the slot and token go to the
next patient.

## 4. What to watch in `snapshot()`

| Field | Healthy | Worry when |
| --- | --- | --- |
| `perModel.*.http429` | 0 or growing slowly | growing while `tokensAvailable > 0`: another process shares the quota (several Vercel instances, a local dev run, the iOS kiosk). Lower `RATE_PER_MIN` or move to one Cloud Run instance. |
| `perModel.<primary>.fallbacks` | 0 | `fallbacks` on the flash model climbing means the primary is exhausted most of the time; expected during a burst of consults, a problem if sustained |
| `totals.deadlineExceeded` | 0 | users are waiting the full budget. Check `estimatedWaitMs`; if it is routinely above 45 s, the demand exceeds 4 images/min and the fix is capacity (quota request) or fewer images per consult, not a longer deadline |
| `totals.queueFull` | 0 | the queue depth is hit: same cause as above, or a client fanning out six requests per consult |
| `queue.waiting`, `estimatedWaitMs` | small, under 30 s | a live view of the wait the next patient will see |
| `perModel.*.latencyMs.p95` | under 20 s | model-side slowness; nothing to do locally except raise `deadlineMs` |
| `perModel.*.otherErrors` | 0 | 400/401/403/500 from Vertex: a bad body, an expired token, or a billing suspension. These are never retried; read the function log for `status` |
| `totals.bypassed` | 0 in production | the flag is off (`VERTEX_RESILIENCE_ENABLED=false`) |

Logging rule, enforced by test: no event, error or snapshot contains the
request. `onEvent` receives model names, statuses, counts and durations only.
The Vertex adapter does not copy the provider's error message into its error
unless `includeErrorMessage: true` is set, so nothing Vertex echoes can reach
the logs either. Keep that setting off in production.

## 5. Turning it off

Set `VERTEX_RESILIENCE_ENABLED=false` and redeploy. `generate()` then calls
Vertex directly with the primary model and no retries. Use it only to rule the
module out while debugging; it restores the pre-module 429 behaviour.

## 6. Tests

```
cd packages/vertex-resilience && npm test
```

45 tests on `node:test` with an injected clock: limiter refill math, queue
ordering and `QueueFullError`, backoff schedule and `Retry-After`, fallback on
429 and 503, no fallback on 400, deadline estimates (queued and token-bound),
counters, payload never leaks, disabled flag pass-through, and the Vertex
adapter's URL and status mapping.
