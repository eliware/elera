import { expect, jest, test } from '@jest/globals';
import { handleRoutingAdminRoute } from '../../../src/api/routes/routing-admin.mjs';

const response = () => ({ json: jest.fn() });
const request = (body = {}) => ({ async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } });
const bundles = { validate: jest.fn(async ({ application }) => ({ valid: true, application, bundleVersion: 2, routeCount: 1 })), rebalance: jest.fn(async (body) => ({ recalculated: true, application: body.application })) };

test('serves routing validation and latest events', async () => {
  const out = response();
  const auth = { root: true };
  await handleRoutingAdminRoute({ method: 'GET', path: '/api/v1/routing/validate', url: new URL('http://x/api/v1/routing/validate?application=app'), response: out, routingBundles: bundles, auth });
  await handleRoutingAdminRoute({ method: 'GET', path: '/api/v1/routing/events', url: new URL('http://x/api/v1/routing/events?application=app'), response: out, routingBundles: bundles, auth, routingEvent: () => ({ type: 'routing.update' }) });
  expect(bundles.validate).toHaveBeenCalledWith({ application: 'app', identity: undefined });
  expect(out.json).toHaveBeenCalledTimes(2);
});

test('requires confirmation before explicit rebalance', async () => {
  const auth = { root: true };
  await expect(handleRoutingAdminRoute({ method: 'POST', path: '/api/v1/routing/rebalance', request: request(), response: response(), routingBundles: bundles, auth })).rejects.toMatchObject({ statusCode: 409 });
  const out = response();
  await handleRoutingAdminRoute({ method: 'POST', path: '/api/v1/routing/rebalance', request: request({ confirm: true, application: 'app' }), response: out, routingBundles: bundles, auth });
  expect(bundles.rebalance).toHaveBeenCalledWith({ confirm: true, application: 'app', identity: undefined });
  expect(out.json).toHaveBeenCalledWith(202, expect.objectContaining({ operation: 'routing.rebalance' }));
});

test('ignores unrelated routes and tolerates absent event', async () => {
  expect(await handleRoutingAdminRoute({ method: 'GET', path: '/other', routingBundles: bundles, auth: { root: true } })).toBe(false);
  const out = response();
  await handleRoutingAdminRoute({ method: 'GET', path: '/api/v1/routing/events', url: new URL('http://x/api/v1/routing/events'), response: out, routingBundles: bundles, auth: { root: true } });
  expect(out.json).toHaveBeenCalledWith(200, expect.objectContaining({ data: null }));
});

test('requires routing scopes for scoped clients', async () => {
  const out = response();
  expect(await handleRoutingAdminRoute({ method: 'GET', path: '/api/v1/routing/validate', url: new URL('http://x/'), response: out, routingBundles: bundles, auth: { scopes: [] } })).toBe(false);
  expect(await handleRoutingAdminRoute({ method: 'GET', path: '/api/v1/routing/events', url: new URL('http://x/api/v1/routing/events'), response: out, routingBundles: bundles, auth: { scopes: [] } })).toBe(false);
  expect(await handleRoutingAdminRoute({ method: 'GET', path: '/api/v1/routing/events', url: new URL('http://x/api/v1/routing/events'), response: out, routingBundles: bundles, auth: { scopes: ['routing:read'] }, routingEvent: () => undefined })).toBe(true);
  expect(await handleRoutingAdminRoute({ method: 'POST', path: '/api/v1/routing/rebalance', request: request({ confirm: true }), response: out, routingBundles: bundles, auth: { scopes: ['routing:read'] } })).toBe(false);
  expect(await handleRoutingAdminRoute({ method: 'GET', path: '/api/v1/routing/events', url: new URL('http://x/api/v1/routing/events'), response: out, routingBundles: bundles, auth: { scopes: ['*'] }, routingEvent: () => undefined })).toBe(true);
});

test('uses the application bound to a scoped token and rejects cross-application requests', async () => {
  const out = response();
  const auth = { application: 'bound-app', identity: 'identity', scopes: ['routing:read'] };
  await handleRoutingAdminRoute({ method: 'GET', path: '/api/v1/routing/validate', url: new URL('http://x/api/v1/routing/validate'), response: out, routingBundles: bundles, auth });
  expect(bundles.validate).toHaveBeenCalledWith({ application: 'bound-app', identity: 'identity' });
  await expect(handleRoutingAdminRoute({ method: 'GET', path: '/api/v1/routing/events', url: new URL('http://x/api/v1/routing/events?application=other'), response: out, routingBundles: bundles, auth })).rejects.toMatchObject({ statusCode: 403 });
});
