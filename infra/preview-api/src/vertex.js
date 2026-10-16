// Vertex AI access: identity comes from the Cloud Run metadata server via
// google-auth-library (Application Default Credentials). No API keys, no JSON
// key files. The runtime service account holds roles/aiplatform.user only.

let authClientPromise = null;

export async function getVertexAccessToken({ GoogleAuthImpl } = {}) {
  if (!authClientPromise) {
    authClientPromise = (async () => {
      const { GoogleAuth } = GoogleAuthImpl ? { GoogleAuth: GoogleAuthImpl } : await import('google-auth-library');
      const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      return auth.getClient();
    })();
  }
  const client = await authClientPromise;
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('metadata server returned no access token');
  return token;
}

// The image models are served from the global endpoint today, so the default
// location is "global" and the host has no region prefix. Compute stays in a US
// region; see docs/cloud-run-migration.md for why this matters for US-only
// processing and what to change once a US endpoint serves the models.
export function vertexEndpoint({ projectId, location = 'global', model, method = 'generateContent' }) {
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:${method}`;
}

// Lazy, optional import of the sibling resilience package (queue + backoff +
// model fallback), which another session is building at packages/vertex-resilience.
// Falls back to a pass-through stub so this service runs without it.
const STUB = {
  name: 'stub',
  async generateWithResilience({ primary, fallback, call }) {
    try {
      return { model: primary, fellBack: false, result: await call(primary) };
    } catch (err) {
      if (fallback && err?.status === 429) {
        return { model: fallback, fellBack: true, result: await call(fallback) };
      }
      throw err;
    }
  },
};

let resiliencePromise = null;
// Candidates, in order: an explicit override, the repo-relative sibling package
// (infra/preview-api/../../packages/vertex-resilience), and the in-image copy
// (/app/packages/vertex-resilience when the Dockerfile COPYs it).
export function resilienceCandidates(env = process.env) {
  const here = new URL('.', import.meta.url);
  const list = [];
  if (env.VERTEX_RESILIENCE_PATH) list.push(env.VERTEX_RESILIENCE_PATH);
  list.push(new URL('../../../packages/vertex-resilience/index.js', here).href);
  list.push(new URL('../packages/vertex-resilience/index.js', here).href);
  return list;
}

export function loadResilience({ candidates = resilienceCandidates(), importImpl = (s) => import(s) } = {}) {
  if (!resiliencePromise) {
    resiliencePromise = (async () => {
      for (const specifier of candidates) {
        try {
          const mod = await importImpl(specifier);
          const impl = mod.default && typeof mod.default.generateWithResilience === 'function' ? mod.default : mod;
          if (typeof impl.generateWithResilience === 'function') return { name: 'vertex-resilience', ...impl };
        } catch {
          // not present or not loadable: try the next candidate
        }
      }
      return STUB;
    })();
  }
  return resiliencePromise;
}

export function _resetForTests() {
  authClientPromise = null;
  resiliencePromise = null;
}
