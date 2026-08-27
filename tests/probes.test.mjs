import { afterAll, describe, expect, test, jest } from '@jest/globals';
import { createProbeServer } from '../src/probes.mjs';

const listen = async (server) => { await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); return server.address().port; };
const get = async (port, path) => { const response = await fetch(`http://127.0.0.1:${port}${path}`); return { status: response.status, text: await response.text() }; };

describe('HTTP probes', () => {
  let server;
  afterAll(async () => { if (server) await new Promise((resolve) => server.close(resolve)); });
  test('health is always live and readiness reflects status', async () => {
    server = createProbeServer({ getStatus: async () => ({ ready: false }), controlHandler: async () => {}, log: { warn: jest.fn() } });
    const port = await listen(server); expect(await get(port, '/healthz')).toEqual({ status: 200, text: 'ok\n' }); expect(await get(port, '/readyz')).toEqual({ status: 503, text: 'not ready\n' });
  });
  test('ready and control routes handle success and failure', async () => {
    await new Promise((resolve) => server.close(resolve));
    server = createProbeServer({ getStatus: async () => ({ ready: true }), controlHandler: async (_request, response) => response.writeHead(202).end('control') , log: { warn: jest.fn() } });
    const port = await listen(server); expect(await get(port, '/readyz')).toEqual({ status: 200, text: 'ok\n' }); expect((await get(port, '/api/v1/status')).status).toBe(202); expect((await get(port, '/missing')).status).toBe(404);
  });
  test('readiness errors return 503', async () => { await new Promise((resolve) => server.close(resolve)); server = createProbeServer({ getStatus: async () => { throw new Error('down'); }, controlHandler: async () => {}, log: { warn: jest.fn() } }); const port = await listen(server); expect((await get(port, '/readyz')).status).toBe(503); });
});
