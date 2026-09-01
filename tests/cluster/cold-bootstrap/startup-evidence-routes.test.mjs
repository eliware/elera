import { createStartupEvidenceRoutes } from '../../../src/cluster/cold-bootstrap/startup-evidence-routes.mjs';
import { jest } from '@jest/globals';

const response = () => ({ writeHead: jest.fn(function () { return this; }), end: jest.fn() });
const request = (method, url, headers = {}) => ({ method, url, headers, on: jest.fn((event, callback) => { if (event === 'end') queueMicrotask(callback); }) });

test('validates route dependencies', () => expect(() => createStartupEvidenceRoutes()).toThrow('startup evidence route dependencies are required'));
test('handles evidence authentication and success', async () => {
  const handler = createStartupEvidenceRoutes({ token: 'secret', evidence: async () => ({ node: 'a.example.test' }) });
  const denied = response(); await expect(handler(request('GET', '/api/v1/cluster/cold-bootstrap/evidence'), denied)).resolves.toBe(true); expect(denied.writeHead).toHaveBeenCalledWith(401);
  const accepted = response(); await handler(request('GET', '/api/v1/cluster/cold-bootstrap/evidence', { authorization: 'Bearer secret' }), accepted); expect(accepted.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
});
test('returns false for unrelated routes', async () => expect(createStartupEvidenceRoutes({ evidence: async () => ({}) })(request('GET', '/other'), response())).resolves.toBe(false));
