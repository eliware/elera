import { createStartupEvidenceServer } from '../../../src/cluster/cold-bootstrap/startup-evidence-server.mjs';

test('validates server dependencies', () => expect(() => createStartupEvidenceServer()).toThrow('startup evidence server dependencies are required'));

test('serves authenticated startup evidence and rejects other requests', async () => {
  const service = createStartupEvidenceServer({ port: 0, token: 'secret', evidence: async () => ({ node: 'a' }), lease: { claim: async (value) => ({ granted: true, ...value }) } });
  await service.listen();
  const port = service.server.address().port;
  const request = (url, options) => fetch(url, { ...options, headers: { connection: 'close', ...options?.headers } });
  const health = await request(`http://127.0.0.1:${port}/healthz`); expect(health.status).toBe(200); await health.text();
  const ready = await request(`http://127.0.0.1:${port}/readyz`); expect(ready.status).toBe(503); await ready.text();
  const wrong = await request(`http://127.0.0.1:${port}/wrong`); expect(wrong.status).toBe(404); await wrong.text();
  const unauthorized = await request(`http://127.0.0.1:${port}/api/v1/cluster/cold-bootstrap/evidence`); expect(unauthorized.status).toBe(401); await unauthorized.text();
  const response = await request(`http://127.0.0.1:${port}/api/v1/cluster/cold-bootstrap/evidence`, { headers: { authorization: 'Bearer secret' } });
  await expect(response.json()).resolves.toMatchObject({ data: { node: 'a' } });
  const lease = await request(`http://127.0.0.1:${port}/api/v1/cluster/cold-bootstrap/lease`, { method: 'POST', headers: { authorization: 'Bearer secret', 'content-type': 'application/json' }, body: JSON.stringify({ epoch: 'e1', winner: 'a' }) });
  expect(lease.status).toBe(200); await expect(lease.json()).resolves.toMatchObject({ data: { granted: true, epoch: 'e1' } });
  await service.close();
});

test('returns a service error when evidence collection fails', async () => {
  const service = createStartupEvidenceServer({ port: 0, evidence: async () => { throw new Error('not ready'); } });
  await service.listen();
  const response = await fetch(`http://127.0.0.1:${service.server.address().port}/api/v1/cluster/cold-bootstrap/evidence`, { headers: { connection: 'close' } });
  expect(response.status).toBe(503);
  await response.text();
  await service.close();
});

test('can close before it has listened', async () => {
  await createStartupEvidenceServer({ port: 0, evidence: async () => ({}) }).close();
});

test('rejects lease requests without a configured lease', async () => {
  const service = createStartupEvidenceServer({ port: 0, evidence: async () => ({}) }); await service.listen(); const response = await fetch(`http://127.0.0.1:${service.server.address().port}/api/v1/cluster/cold-bootstrap/lease`, { method: 'POST' }); expect(response.status).toBe(503); await response.text(); await service.close();
});

test('rejects unauthorized and malformed lease requests', async () => {
  const service = createStartupEvidenceServer({ port: 0, token: 'secret', evidence: async () => ({}), lease: { claim: async () => ({ granted: true }) } }); await service.listen(); const port = service.server.address().port;
  const unauthorized = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-bootstrap/lease`, { method: 'POST', headers: { connection: 'close' }, body: '{}' }); expect(unauthorized.status).toBe(401); await unauthorized.text();
  const malformed = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-bootstrap/lease`, { method: 'POST', headers: { authorization: 'Bearer secret', connection: 'close' }, body: '{' }); expect(malformed.status).toBe(400); await malformed.text(); await service.close();
});

test('serves and authorizes completion events', async () => {
  const completion = { read: () => ({ epoch: 'e1', status: 'complete' }) };
  const service = createStartupEvidenceServer({ port: 0, token: 'secret', evidence: async () => ({}), completion });
  await service.listen(); const port = service.server.address().port;
  const missing = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-bootstrap/completion`, { headers: { connection: 'close' } });
  expect(missing.status).toBe(401); await missing.text();
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-bootstrap/completion`, { headers: { authorization: 'Bearer secret', connection: 'close' } });
  expect(response.status).toBe(200); await expect(response.json()).resolves.toMatchObject({ data: { epoch: 'e1' } }); await service.close();
});

test('returns not found when completion is unavailable and maps lease errors', async () => {
  const service = createStartupEvidenceServer({ port: 0, evidence: async () => ({}), completion: { read: () => undefined }, lease: { claim: async () => { throw Object.assign(new Error('conflict'), { statusCode: 409 }); } } });
  await service.listen(); const port = service.server.address().port;
  const completion = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-bootstrap/completion`, { headers: { connection: 'close' } }); expect(completion.status).toBe(404); await completion.text();
  const lease = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-bootstrap/lease`, { method: 'POST', headers: { connection: 'close' }, body: '{}' }); expect(lease.status).toBe(409); await lease.text(); await service.close();
});
