import { expect, jest, test } from '@jest/globals';
import { handleColdBootstrapEvidence } from '../../../src/api/routes/cold-bootstrap-evidence.mjs';

test('handles cold-bootstrap evidence route', async () => {
  const response = { json: jest.fn() };
  const coldEvidence = jest.fn(async () => ({ node: 'a.example.test' }));
  await expect(handleColdBootstrapEvidence({ method: 'GET', path: '/api/v1/cluster/cold-bootstrap/evidence', response, coldEvidence })).resolves.toBe(true);
  expect(coldEvidence).toHaveBeenCalled();
});
test('skips unrelated paths and rejects unavailable evidence', async () => {
  await expect(handleColdBootstrapEvidence({ method: 'POST', path: '/other', response: { json: jest.fn() } })).resolves.toBe(false);
  await expect(handleColdBootstrapEvidence({ method: 'GET', path: '/api/v1/cluster/cold-bootstrap/evidence', response: { json: jest.fn() } })).rejects.toMatchObject({ statusCode: 503 });
});
