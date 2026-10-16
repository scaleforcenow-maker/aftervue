import express from 'express';
import { logger as defaultLogger } from './logger.js';
import { originAllowlist } from './middleware/origin.js';
import { rateLimit } from './middleware/rateLimit.js';
import { turnstile } from './middleware/turnstile.js';
import { createGenerateHandler, HttpError } from './generate.js';

export function createApp({ config, logger = defaultLogger, deps = {} } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Cloud Run fronts the container with one proxy hop; req.ip becomes the client IP.
  app.set('trust proxy', 1);

  app.get('/healthz', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, service: 'preview-api', vertexLocation: config.vertexLocation });
  });

  const generateRouter = express.Router();
  generateRouter.use((req, res, next) => {
    // PHI in flight: never cacheable anywhere, and no referrer leakage.
    res.set('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  generateRouter.use((req, res, next) => {
    if (req.method === 'POST' || req.method === 'OPTIONS') return next();
    return res.status(405).set('Allow', 'POST, OPTIONS').json({ error: 'method_not_allowed' });
  });
  generateRouter.use(originAllowlist({ allowedOrigins: config.allowedOrigins, logger }));
  generateRouter.use(rateLimit({ ...config.rateLimit, now: deps.now, logger }));
  generateRouter.use(express.json({ limit: config.bodyLimit, type: 'application/json' }));
  generateRouter.use(turnstile({ ...config.turnstile, fetchImpl: deps.fetchImpl, verify: deps.verifyTurnstile, logger }));
  generateRouter.post('/', createGenerateHandler({ config, logger, fetchImpl: deps.fetchImpl, getToken: deps.getToken, resilience: deps.resilience }));

  app.use('/api/generate', generateRouter);

  app.use((req, res) => res.status(404).json({ error: 'not_found' }));

  // Error handler: status from HttpError or body-parser, message never includes the body.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err instanceof HttpError ? err.status : err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' ? 400 : 500;
    const code = err.code && typeof err.code === 'string' ? err.code : status === 413 ? 'payload_too_large' : status === 400 ? 'invalid_json' : 'internal_error';
    if (status >= 500) logger.error({ message: 'request failed', path: req.path, status, error: { name: err.name, message: err.message } });
    res.set('Cache-Control', 'no-store');
    res.status(status === 429 ? 503 : status).json({ error: code });
  });

  return app;
}
