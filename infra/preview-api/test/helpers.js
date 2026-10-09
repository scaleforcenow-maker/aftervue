import http from 'node:http';
import { createLogger } from '../src/logger.js';

export function captureLogger() {
  const lines = [];
  const logger = createLogger({ write: (l) => lines.push(JSON.parse(l)) });
  return { logger, lines };
}

// Starts the app on an ephemeral port and returns a fetch helper + close.
export async function serve(app) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    call: (path, init = {}) => fetch(base + path, init),
    close: () => new Promise((r) => server.close(r)),
  };
}

export const baseConfig = {
  allowedOrigins: ['https://app.example.test', 'https://www.example.test'],
  rateLimit: { capacity: 3, refillPerMinute: 60 },
  turnstile: { secret: 'test-secret', disabled: false },
  vertexProjectId: 'example-project',
  vertexLocation: 'global',
  vertexImageModel: 'primary-model',
  vertexFallbackModel: 'fallback-model',
  bodyLimit: '1mb',
};

export const okTurnstile = async () => ({ success: true, errorCodes: [] });
