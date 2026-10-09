// Placeholder for the /api/generate handler. The real Vercel function body is
// ported here with its request/response contract unchanged. What this skeleton
// already does: validates the envelope, obtains a Vertex token from the
// metadata server, routes through the resilience package (or stub), calls the
// global Vertex endpoint, and returns a JSON envelope. It never logs the body.

import { getVertexAccessToken, vertexEndpoint, loadResilience } from './vertex.js';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

async function callVertex({ config, model, body, token, fetchImpl, signal }) {
  const url = vertexEndpoint({ projectId: config.vertexProjectId, location: config.vertexLocation, model });
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = new HttpError(res.status, 'vertex_error', `vertex responded ${res.status}`);
    err.upstreamStatus = res.status;
    throw err;
  }
  return res.json();
}

// TODO(port): replace with the Vercel function's request -> Vertex payload mapping.
function toVertexRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'invalid_body', 'JSON object required');
  }
  return input;
}

export function createGenerateHandler({ config, logger, fetchImpl = fetch, getToken = getVertexAccessToken, resilience = loadResilience }) {
  return async function generate(req, res, next) {
    const started = Date.now();
    try {
      const vertexBody = toVertexRequest(req.body);
      const [token, r] = await Promise.all([getToken(), resilience()]);
      const ctrl = new AbortController();
      req.on('close', () => ctrl.abort());

      const { model, fellBack, result } = await r.generateWithResilience({
        primary: config.vertexImageModel,
        fallback: config.vertexFallbackModel,
        call: (m) => callVertex({ config, model: m, body: vertexBody, token, fetchImpl, signal: ctrl.signal }),
      });

      // Log metadata only: never the request or the generated image.
      logger.info({ message: 'generate ok', model, fellBack, resilience: r.name, ms: Date.now() - started });
      return res.status(200).json({ ok: true, model, fellBack, result });
    } catch (err) {
      return next(err);
    }
  };
}
