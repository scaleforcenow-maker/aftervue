# preview-api

Cloud Run skeleton for `/api/generate`. The Vercel function body is ported into
`src/generate.js` (`toVertexRequest` and the response mapping); everything around
it is already in place.

```
npm install
npm test            # node:test, no network
PORT=8080 ALLOWED_ORIGINS=http://localhost:3000 TURNSTILE_DISABLED=true VERTEX_PROJECT_ID=... npm start
```

Request pipeline for `POST /api/generate`:

1. `Cache-Control: no-store` and friends on every response.
2. Method gate (POST/OPTIONS only).
3. Origin allowlist (`ALLOWED_ORIGINS`, comma-separated). CORS headers only for allowed origins.
4. Per-IP token bucket (`RATE_LIMIT_CAPACITY`, `RATE_LIMIT_REFILL_PER_MINUTE`), keyed on
   the client IP behind Cloud Run's single proxy hop.
5. JSON body (`BODY_LIMIT`, default 12mb).
6. Turnstile verification (`TURNSTILE_SECRET` from Secret Manager; fails closed with
   503 if unset; `TURNSTILE_DISABLED=true` is a loud local-only escape hatch).
7. Handler: token from the metadata server via `google-auth-library`, lazy import
   of `packages/vertex-resilience` (stub fallback), call to Vertex at
   `VERTEX_LOCATION` (`global` by default), JSON envelope back.

Logging: `src/logger.js` emits one JSON line per event and redacts any field named
`image`, `photo`, `selfie`, `prompt`, `data`, `body` (and variants), any string
that is a data URL, and any long base64 blob. `test/logger.test.js` pins that
behaviour. Request bodies are never passed to the logger in the first place.

Container: `node:20-slim`, runs as the unprivileged `node` user, listens on
`$PORT` (8080). Build context is this directory; see the Dockerfile comment if the
resilience package needs to ride along.
