import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getVertexAccessToken, loadResilience, resilienceCandidates, vertexEndpoint, _resetForTests } from '../src/vertex.js';

test('vertexEndpoint: global has no region prefix, regions do', () => {
  assert.equal(
    vertexEndpoint({ projectId: 'p', location: 'global', model: 'm' }),
    'https://aiplatform.googleapis.com/v1/projects/p/locations/global/publishers/google/models/m:generateContent',
  );
  assert.equal(
    vertexEndpoint({ projectId: 'p', location: 'us-central1', model: 'm', method: 'streamGenerateContent' }),
    'https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/us-central1/publishers/google/models/m:streamGenerateContent',
  );
});

test('getVertexAccessToken uses GoogleAuth (ADC / metadata server) with cloud-platform scope', async () => {
  _resetForTests();
  let scopes;
  class FakeGoogleAuth {
    constructor(opts) { scopes = opts.scopes; }
    async getClient() { return { getAccessToken: async () => ({ token: 'metadata-token' }) }; }
  }
  assert.equal(await getVertexAccessToken({ GoogleAuthImpl: FakeGoogleAuth }), 'metadata-token');
  assert.deepEqual(scopes, ['https://www.googleapis.com/auth/cloud-platform']);
  _resetForTests();
});

test('loadResilience falls back to the stub when the sibling package is absent', async () => {
  _resetForTests();
  const r = await loadResilience({ candidates: ['./definitely-not-here.js'] });
  assert.equal(r.name, 'stub');
  let calls = [];
  const out = await r.generateWithResilience({
    primary: 'a',
    fallback: 'b',
    call: async (m) => { calls.push(m); if (m === 'a') { const e = new Error('429'); e.status = 429; throw e; } return 'ok'; },
  });
  assert.deepEqual(out, { model: 'b', fellBack: true, result: 'ok' });
  assert.deepEqual(calls, ['a', 'b']);
  _resetForTests();
});

test('loadResilience uses the package when present', async () => {
  _resetForTests();
  const importImpl = async (s) => (s === 'pkg' ? { generateWithResilience: async () => 'from-package' } : Promise.reject(new Error('nope')));
  const r = await loadResilience({ candidates: ['missing', 'pkg'], importImpl });
  assert.equal(r.name, 'vertex-resilience');
  assert.equal(await r.generateWithResilience({}), 'from-package');
  _resetForTests();
});

test('resilienceCandidates points at ../../packages/vertex-resilience relative to the service', () => {
  const c = resilienceCandidates({ VERTEX_RESILIENCE_PATH: 'file:///override.js' });
  assert.equal(c[0], 'file:///override.js');
  assert.match(c[1], /\/packages\/vertex-resilience\/index\.js$/);
  assert.ok(!c[1].includes('/infra/'), 'repo-root candidate resolves outside infra/');
});
