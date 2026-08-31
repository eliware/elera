import { afterAll, describe, expect, test, jest } from '@jest/globals';
import { createProbeServer } from '../src/probes.mjs';

const listen = async (server) => { await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); return server.address().port; };
const get = async (port, path) => { const response = await fetch(`http://127.0.0.1:${port}${path}`); return { status: response.status, text: await response.text() }; };

describe('HTTP probes', () => {
  let server;
  const closeServer = async () => {
    if (!server?.listening) { server = undefined; return; }
    await new Promise((resolve) => server.close(resolve));
    server = undefined;
  };
  afterAll(closeServer);
  test('health is always live and readiness reflects status', async () => {
    server = createProbeServer({ getStatus: async () => ({ ready: false }), controlHandler: async () => {}, log: { warn: jest.fn() } });
    const port = await listen(server); expect(await get(port, '/healthz')).toEqual({ status: 200, text: 'ok\n' }); expect(await get(port, '/readyz')).toEqual({ status: 503, text: 'not ready\n' });
  });
  test('mounts startup recovery routes on the normal listener', async () => {
    await closeServer();
    server = createProbeServer({ getStatus: async () => ({ ready: false }), controlHandler: async () => {}, log: { warn: jest.fn() } });
    const handler = jest.fn(async (_request, response) => { response.writeHead(202).end('recovery\n'); return true; });
    server.setStartupHandler(handler);
    const port = await listen(server);
    expect(await get(port, '/api/v1/cluster/cold-bootstrap/evidence')).toEqual({ status: 202, text: 'recovery\n' });
    expect(handler).toHaveBeenCalled();
    await closeServer();
  });
  test('starts the shared listener once and remains idempotent', async () => {
    server = createProbeServer({ getStatus: async () => ({ ready: true }), controlHandler: async () => {}, log: { warn: jest.fn() } });
    await server.start(0, '127.0.0.1');
    const address = server.address();
    await expect(server.start(0, '127.0.0.1')).resolves.toBeUndefined();
    expect(server.address()).toEqual(address);
    await closeServer();
  });
  test('rejects a second listener when the port is occupied', async () => {
    server = createProbeServer({ getStatus: async () => ({ ready: true }), controlHandler: async () => {}, log: { warn: jest.fn() } });
    await server.start(0, '127.0.0.1');
    const occupiedPort = server.address().port;
    const other = createProbeServer({ getStatus: async () => ({ ready: true }), controlHandler: async () => {}, log: { warn: jest.fn() } });
    await expect(other.start(occupiedPort, '127.0.0.1')).rejects.toThrow(/EADDRINUSE/);
    await new Promise((resolve) => other.close(resolve));
    await closeServer();
  });
  test('ready and control routes handle success and failure', async () => {
    await closeServer();
    server = createProbeServer({ getStatus: async () => ({ ready: true }), controlHandler: async (_request, response) => response.writeHead(202).end('control') , log: { warn: jest.fn() } });
    const port = await listen(server); expect(await get(port, '/readyz')).toEqual({ status: 200, text: 'ok\n' }); expect((await get(port, '/api/v1/status')).status).toBe(202); expect((await get(port, '/missing')).status).toBe(404);
  });
  test('readiness errors return 503', async () => { await closeServer(); server = createProbeServer({ getStatus: async () => { throw new Error('down'); }, controlHandler: async () => {}, log: { warn: jest.fn() } }); const port = await listen(server); expect((await get(port, '/readyz')).status).toBe(503); });
  test('draining nodes are not ready for HAProxy', async () => { await closeServer(); server = createProbeServer({ getStatus: async () => ({ ready: true }), isDraining: () => true, controlHandler: async (_request, response) => response.writeHead(202).end('control'), log: { warn: jest.fn() } }); const port = await listen(server); expect((await get(port, '/healthz')).status).toBe(200); expect((await get(port, '/readyz')).status).toBe(503); });
  test('keeps control available while draining so undrain can complete', async () => { expect((await get(server.address().port, '/healthz')).status).toBe(200); expect((await get(server.address().port, '/api/v1/status')).status).toBe(202); });
  test('rejects new control requests after shutdown begins while keeping health live', async () => { await closeServer(); server = createProbeServer({ getStatus: async () => ({ ready: true }), isShuttingDown: () => true, controlHandler: async () => {}, log: { warn: jest.fn() } }); const port = await listen(server); expect((await get(port, '/healthz')).status).toBe(200); expect((await get(port, '/api/v1/status')).status).toBe(503); });
  test('router readiness remains available while SQL traffic is draining', async () => { expect((await get(server.address().port, '/router-readyz')).status).toBe(200); });
  test('router readiness fails when SQL is unavailable', async () => {
    await closeServer();
    server = createProbeServer({ getStatus: async () => ({ ready: false }), controlHandler: async () => {}, log: { warn: jest.fn() } });
    const port = await listen(server);
    expect((await get(port, '/router-readyz')).status).toBe(503);
    await closeServer();
    server = createProbeServer({ getStatus: async () => { throw new Error('down'); }, controlHandler: async () => {}, log: { warn: jest.fn() } });
    const failingPort = await listen(server);
    expect((await get(failingPort, '/router-readyz')).status).toBe(503);
  });
  test('rejects websocket upgrades when no upgrade handler accepts them', async () => { await closeServer(); server = createProbeServer({ getStatus: async () => ({ ready: true }), controlHandler: async () => {}, log: { warn: jest.fn() } }); const port = await listen(server); const socket = await import('node:net').then(({ createConnection }) => new Promise((resolve) => { const client = createConnection(port, '127.0.0.1', () => client.write('GET /api/v1/routing/stream HTTP/1.1\\r\\nConnection: Upgrade\\r\\nUpgrade: websocket\\r\\n\\r\\n')); const finish = () => { client.destroy(); resolve(true); }; client.on('data', finish); client.on('close', finish); client.on('error', finish); })); expect(socket).toBe(true); });
});
