import { ClientError } from './errors.js';

/**
 * Maps the Vertex AI `generateContent` REST call onto the generic client
 * interface used by createResilientGenerator:
 *
 *   client.generate(model, body, { signal }) -> Promise<parsed JSON response>
 *
 * The request body is built by the caller (contents, generationConfig, ...)
 * and passed through untouched. Everything provider-specific lives here.
 *
 * Errors: non-2xx responses throw ClientError with `status`, `retryAfterMs`
 * (from Retry-After, when present), `vertexStatus` (the google.rpc.Status
 * enum string such as RESOURCE_EXHAUSTED) and `model`. The provider's error
 * message is deliberately not copied into the error unless
 * `includeErrorMessage` is true, so nothing echoed by the API can leak into
 * logs. Network failures and timeouts throw ClientError with status 0 and
 * `retryable: true`. An abort from `signal` rethrows `signal.reason`.
 *
 * @param {object} opts
 * @param {typeof fetch} [opts.fetchImpl=globalThis.fetch]
 * @param {string} [opts.location='global']
 * @param {string} opts.projectId
 * @param {() => Promise<string>|string} opts.accessTokenProvider
 * @param {string} [opts.apiVersion='v1']
 * @param {number} [opts.timeoutMs=60000] per-call network timeout
 * @param {string} [opts.apiEndpoint] override host (tests, private endpoints)
 * @param {boolean} [opts.includeErrorMessage=false]
 * @param {() => number} [opts.now=Date.now] for Retry-After dates
 */
export function createVertexAdapter({
  fetchImpl = globalThis.fetch,
  location = 'global',
  projectId,
  accessTokenProvider,
  apiVersion = 'v1',
  timeoutMs = 60_000,
  apiEndpoint,
  includeErrorMessage = false,
  now = Date.now,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a fetch-compatible function');
  if (typeof projectId !== 'string' || !projectId) throw new TypeError('projectId is required');
  if (typeof accessTokenProvider !== 'function') throw new TypeError('accessTokenProvider must be a function');
  if (typeof location !== 'string' || !location) throw new TypeError('location is required');

  const host = apiEndpoint ?? (location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`);

  function endpointFor(model) {
    if (typeof model !== 'string' || !/^[A-Za-z0-9._-]+$/.test(model)) throw new TypeError('invalid model name');
    return `https://${host}/${apiVersion}/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${model}:generateContent`;
  }

  async function generate(model, body, { signal } = {}) {
    if (signal?.aborted) throw signal.reason;
    const url = endpointFor(model);
    const token = await accessTokenProvider();
    if (typeof token !== 'string' || !token) throw new ClientError('accessTokenProvider returned no token', { code: 'AUTH', model });
    if (signal?.aborted) throw signal.reason;

    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, timeoutMs);
    const onAbort = () => ctl.abort(signal.reason);
    signal?.addEventListener('abort', onAbort, { once: true });

    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
    } catch (err) {
      if (signal?.aborted) throw signal.reason ?? err;
      if (timedOut) {
        throw new ClientError(`Vertex AI ${model} timed out after ${timeoutMs} ms`, { code: 'TIMEOUT', status: 0, model, retryable: true });
      }
      throw new ClientError(`Vertex AI ${model} network error (${err?.name ?? 'Error'})`, { code: 'NETWORK', status: 0, model, retryable: true });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }

    if (res.ok) {
      return res.json();
    }

    let vertexStatus;
    let providerMessage;
    try {
      const text = await res.text();
      const parsed = JSON.parse(text);
      vertexStatus = parsed?.error?.status;
      providerMessage = parsed?.error?.message;
    } catch {
      /* non-JSON error body: status code is all we keep */
    }
    const retryAfterMs = parseRetryAfter(res.headers?.get?.('retry-after'), now());
    let message = `Vertex AI ${model} responded HTTP ${res.status}${vertexStatus ? ` (${vertexStatus})` : ''}`;
    if (includeErrorMessage && typeof providerMessage === 'string') message += `: ${providerMessage.slice(0, 200)}`;
    throw new ClientError(message, {
      code: res.status === 429 ? 'RATE_LIMITED' : 'HTTP',
      status: res.status,
      retryAfterMs,
      model,
      vertexStatus,
      retryable: res.status === 429 || res.status === 503,
    });
  }

  return { generate, endpointFor, location, apiVersion };
}

/** Parses a Retry-After header (delta-seconds or HTTP-date) into milliseconds. */
export function parseRetryAfter(value, nowMs = Date.now()) {
  if (value === null || value === undefined || value === '') return undefined;
  const str = String(value).trim();
  if (/^\d+$/.test(str)) return Number(str) * 1000;
  const date = Date.parse(str);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - nowMs);
}
