import { expect, test } from '@jest/globals';
import { createRoutingPublisher } from '../../src/runtime/routing-publisher.mjs';

test('publishes each routing version once for configured applications', () => {
  const events = [];
  let version = 1;
  const publish = createRoutingPublisher({
    event: (application) => ({ application, version }),
    bus: { publish: (value) => events.push(value) },
    assignments: { applications: () => ['tenant'] },
  });
  publish();
  publish();
  version = 2;
  publish();
  expect(events).toHaveLength(4);
  expect(events.map(({ version: item }) => item)).toEqual([1, 1, 2, 2]);
});

test('ignores absent routing events', () => {
  const publish = createRoutingPublisher({ event: () => undefined, bus: { publish: () => { throw new Error('unexpected'); } }, assignments: { applications: () => [] } });
  expect(() => publish()).not.toThrow();
});
