import { expect, test, jest } from '@jest/globals';
import { handleRoutingResyncRoute } from '../src/api/routes/routing-resync.mjs';

test('serves the current routing event and ignores other routes', () => {
  const json = jest.fn(); const event = { type: 'routing.update', version: 3 };
  expect(handleRoutingResyncRoute({ method: 'GET', path: '/api/v1/routing/resync', url: new URL('http://x/api/v1/routing/resync?application=a'), response: { json }, getEvent: () => event })).toBe(true);
  expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ operation: 'routing.resync', data: event }));
  expect(handleRoutingResyncRoute({ method: 'POST', path: '/api/v1/routing/resync' })).toBe(false);
});
