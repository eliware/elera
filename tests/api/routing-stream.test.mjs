import { expect, jest, test } from '@jest/globals';
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { createRoutingStream } from '../../src/api/routing-stream.mjs';

const bus = () => ({ subscribe: jest.fn(() => () => {}) });

test('rejects unauthenticated and unrelated upgrades', async () => {
  const stream = createRoutingStream({ token: 'secret', getEvent: () => undefined, bus: bus() });
  const unauthorized = { write: jest.fn(), destroy: jest.fn() };
  await expect(stream.upgrade({ headers: {}, url: '/api/v1/routing/stream' }, unauthorized, Buffer.alloc(0))).resolves.toBe(false);
  expect(unauthorized.write).toHaveBeenCalledWith(expect.stringContaining('401 Unauthorized'));
  const unrelated = { write: jest.fn(), destroy: jest.fn() };
  await expect(stream.upgrade({ headers: { authorization: 'Bearer secret' }, url: '/other' }, unrelated, Buffer.alloc(0))).resolves.toBe(false);
  expect(unrelated.destroy).not.toHaveBeenCalled();
  stream.close();
});

test('supports asynchronous scoped-token authorization by application', async () => {
  const authorize = jest.fn(async (token, application) => token === 'app-secret' && application === 'payments');
  const stream = createRoutingStream({ authorize, getEvent: () => undefined, bus: bus() });
  const rejected = { write: jest.fn(), destroy: jest.fn() };
  await expect(stream.upgrade({ headers: { authorization: 'Bearer wrong' }, url: '/api/v1/routing/stream?application=payments' }, rejected, Buffer.alloc(0))).resolves.toBe(false);
  expect(authorize).toHaveBeenCalledWith('wrong', 'payments');
  const defaultRejected = { write: jest.fn(), destroy: jest.fn() };
  await stream.upgrade({ headers: { authorization: 'Bearer wrong' }, url: '/api/v1/routing/stream' }, defaultRejected, Buffer.alloc(0));
  expect(authorize).toHaveBeenLastCalledWith('wrong', null);
  stream.close();
});

test('uses the application resolved by the token when no selector is supplied', async () => {
  const websocketServer = new WebSocketServer({ noServer: true });
  const subscribe = jest.fn(() => () => {});
  const getEvent = jest.fn((application) => ({ type: 'routing.update', application }));
  const stream = createRoutingStream({ getEvent, bus: { subscribe }, websocketServer });
  const request = { url: '/api/v1/routing/stream', eleraAuthorization: { application: 'billing', database: 'ledger' } };
  websocketServer.emit('connection', { readyState: 1, send: jest.fn(), on: jest.fn(), ping: jest.fn(), close: jest.fn() }, request);
  expect(getEvent).toHaveBeenCalledWith('billing');
  expect(subscribe).toHaveBeenCalledWith(expect.anything(), expect.any(Function));
  expect(stream.isStopping()).toBe(false);
  stream.close();
  websocketServer.close();
});

test('rejects the default authorizer when no root token is configured', async () => {
  const stream = createRoutingStream({ getEvent: () => undefined, bus: bus() });
  const socket = { write: jest.fn(), destroy: jest.fn() };
  await expect(stream.upgrade({ headers: {}, url: '/api/v1/routing/stream' }, socket, Buffer.alloc(0))).resolves.toBe(false);
  expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('401 Unauthorized'));
  stream.close();
});

test('rejects WebSocket upgrades after shutdown begins', async () => {
  const stream = createRoutingStream({ token: 'secret', getEvent: () => undefined, bus: bus() });
  await stream.shutdown({ reason: 'SIGTERM' });
  const socket = { write: jest.fn(), destroy: jest.fn() };
  await expect(stream.upgrade({ headers: {}, url: '/api/v1/routing/stream' }, socket, Buffer.alloc(0))).resolves.toBe(false);
  expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('503 Service Unavailable'));
  expect(socket.destroy).toHaveBeenCalled();
});

test('closes cleanly when no routing clients are connected', async () => {
  const stream = createRoutingStream({ token: 'secret', getEvent: () => undefined, bus: bus() });
  await expect(stream.shutdown({ reason: 'SIGTERM', reconnectDeadlineMs: 60000 })).resolves.toBeUndefined();
  expect(stream.isStopping()).toBe(true);
});

test('broadcasts shutdown before closing an established client', async () => {
  const stream = createRoutingStream({ token: 'secret', nodeIdentity: { name: 'elera-0', address: '10.0.0.60' }, getEvent: () => ({ type: 'routing.update', version: 1 }), bus: bus(), loadBalancerEndpoint: 'http://elera.example' });
  const server = http.createServer();
  server.on('upgrade', (request, socket, head) => stream.upgrade(request, socket, head));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const client = new WebSocket(`ws://127.0.0.1:${port}/api/v1/routing/stream?application=app`, { headers: { authorization: 'Bearer secret' } });
  const events = [];
  const closed = new Promise((resolve, reject) => { client.on('message', (value) => events.push(JSON.parse(value))); client.on('close', (code, reason) => resolve({ code, reason: reason.toString() })); client.on('error', reject); });
  await new Promise((resolve, reject) => { client.once('open', resolve); client.once('error', reject); });
  await stream.shutdown({ reason: 'SIGTERM', reconnectDeadlineMs: 60000 });
  await expect(closed).resolves.toEqual({ code: 1012, reason: 'supervisor restarting' });
  expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'routing.update' }), expect.objectContaining({ type: 'routing.shutdown', reason: 'SIGTERM', reconnect: true, reconnectDeadlineMs: 60000, loadBalancerEndpoint: 'http://elera.example', nodeIdentity: { name: 'elera-0', address: '10.0.0.60' } })]));
  await new Promise((resolve) => server.close(resolve));
});

test('accepts query-token clients and handles telemetry and closed sockets', async () => {
  const telemetry = { accept: jest.fn(() => { throw new Error('bad telemetry'); }) };
  const logger = { warn: jest.fn() };
  const stream = createRoutingStream({ token: 'secret', getEvent: () => undefined, bus: bus(), telemetry, log: logger });
  const server = http.createServer();
  server.on('upgrade', (request, socket, head) => stream.upgrade(request, socket, head));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/v1/routing/stream?token=secret`);
  await new Promise((resolve, reject) => { client.once('open', resolve); client.once('error', reject); });
  client.send('not-json');
  await new Promise((resolve) => setImmediate(resolve));
  expect(telemetry.accept).not.toHaveBeenCalled();
  client.close();
  await new Promise((resolve) => client.once('close', resolve));
  await stream.shutdown();
  await new Promise((resolve) => server.close(resolve));
  expect(logger.warn).toHaveBeenCalled();
});

test('protects the connection handler during the shutdown race and filters bus events', async () => {
  const websocketServer = new WebSocketServer({ noServer: true });
  let predicate; let connectedClient;
  const subscriptions = { subscribe: jest.fn((client, filter) => { connectedClient = client; predicate = filter; return () => {}; }) };
  const stream = createRoutingStream({ token: 'secret', getEvent: () => ({ type: 'routing.update' }), bus: subscriptions, websocketServer });
  const socket = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn((_payload, callback) => callback?.()), ping: jest.fn() };
  websocketServer.emit('connection', socket, { url: '/api/v1/routing/stream?application=app' });
  expect(predicate({ application: 'app' })).toBe(true);
  expect(predicate({ application: 'other' })).toBe(false);
  connectedClient.ping();
  socket.on.mock.calls.find(([event]) => event === 'error')?.[1](new Error('socket error'));
  await stream.shutdown();
  const lateSocket = { close: jest.fn() };
  websocketServer.emit('connection', lateSocket, { url: '/api/v1/routing/stream' });
  expect(lateSocket.close).toHaveBeenCalledWith(1012, 'supervisor restarting');
  stream.close();
  websocketServer.close();
});

test('closes a client when the shutdown notification cannot be sent', async () => {
  const websocketServer = new WebSocketServer({ noServer: true });
  const stream = createRoutingStream({ token: 'secret', getEvent: () => undefined, bus: bus(), websocketServer });
  const socket = { readyState: 1, close: jest.fn(), on: jest.fn(), send: jest.fn(() => { throw new Error('socket already closed'); }), ping: jest.fn() };
  websocketServer.emit('connection', socket, { url: '/api/v1/routing/stream' });
  await stream.shutdown({}, { reason: 'SIGTERM' });
  expect(socket.close).toHaveBeenCalledWith(1012, 'SIGTERM');
  websocketServer.close();
});
