import { expect, jest, test } from '@jest/globals';
import http from 'node:http';
import { createProbeServer } from '../../src/probes.mjs';

const request = (port, path) => new Promise((resolve, reject) => { const req = http.get({ port, path }, (response) => { let body = ''; response.on('data', (chunk) => { body += chunk; }); response.on('end', () => resolve({ status: response.statusCode, body })); }); req.on('error', reject); });
const running = async (options) => { const server = createProbeServer(options); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); return { server, port: server.address().port }; };

test('serves health, readiness, control, and not-found probes', async () => {
  const controlHandler = jest.fn(async (_request, response) => response.writeHead(200).end('control'));
  const { server, port } = await running({ getStatus: async () => ({ ready: true }), controlHandler, log: { warn: jest.fn() } });
  await expect(request(port, '/healthz')).resolves.toEqual({ status: 200, body: 'ok\n' });
  await expect(request(port, '/readyz')).resolves.toEqual({ status: 200, body: 'ok\n' });
  await expect(request(port, '/api/v1/status')).resolves.toEqual({ status: 200, body: 'control' });
  await expect(request(port, '/other')).resolves.toMatchObject({ status: 404 });
  expect(controlHandler).toHaveBeenCalled();
  await new Promise((resolve) => server.close(resolve));
});

test('reports draining and readiness errors as unavailable', async () => {
  const warn = jest.fn();
  const first = await running({ getStatus: async () => ({ ready: true }), controlHandler: jest.fn(), isDraining: () => true, log: { warn } });
  await expect(request(first.port, '/readyz')).resolves.toMatchObject({ status: 503, body: 'not ready\n' });
  await new Promise((resolve) => first.server.close(resolve));
  const second = await running({ getStatus: async () => { throw new Error('down'); }, controlHandler: jest.fn(), log: { warn } });
  await expect(request(second.port, '/readyz')).resolves.toMatchObject({ status: 503 });
  expect(warn).toHaveBeenCalled();
  await new Promise((resolve) => second.server.close(resolve));
});

test('delegates websocket upgrades and destroys rejected sockets', async () => {
  const accepted = jest.fn(() => true); const rejected = { destroy: jest.fn() };
  const server = createProbeServer({ getStatus: async () => ({ ready: true }), controlHandler: jest.fn(), upgradeHandler: accepted, log: { warn: jest.fn() } });
  server.listeners('upgrade')[0]({ url: '/ws' }, {}, Buffer.alloc(0));
  expect(accepted).toHaveBeenCalled();
  const rejecting = createProbeServer({ getStatus: async () => ({ ready: true }), controlHandler: jest.fn(), upgradeHandler: () => false, log: { warn: jest.fn() } });
  await rejecting.listeners('upgrade')[0]({}, rejected, Buffer.alloc(0));
  expect(rejected.destroy).toHaveBeenCalled();
});
