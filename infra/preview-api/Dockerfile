# syntax=docker/dockerfile:1
# Build context: infra/preview-api (see infra/cloudbuild.yaml and infra/deploy.sh).
# If the handler imports ../../packages/vertex-resilience, build with the repo
# root as context instead and adjust COPY paths; see README.

FROM node:20-slim AS deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

FROM node:20-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js ./
COPY src ./src
# Optional sibling package; the handler imports it lazily and falls back to a stub.
# COPY packages/vertex-resilience ./packages/vertex-resilience

# Non-root. node:20-slim ships a `node` user (uid 1000).
USER node
EXPOSE 8080
CMD ["node", "server.js"]
