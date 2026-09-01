import { createRoutingPublisher } from './routing-publisher.mjs';
import { startSupervisorCycles } from './cycle-wiring.mjs';

export function startSupervisorRouting({ routingEvent, routingBus, assignments, application, peers, token, store, health, identity, clusterId, getDrained, log, publishRoutingEventFactory = createRoutingPublisher, startCycles = startSupervisorCycles } = {}) {
  if (!routingEvent || !routingBus || !assignments || typeof application !== 'string' || !Array.isArray(peers) || !store || typeof health?.status !== 'function' || !identity?.name || !identity.name.includes('.') || typeof getDrained !== 'function') throw new TypeError('routing startup dependencies and shared FQDN identity are required');
  const publishRoutingEvent = publishRoutingEventFactory({ event: routingEvent, bus: routingBus, assignments, application });
  return startCycles({ peers, token, store, health, identity, clusterId, getDrained, publishRoutingEvent, log });
}
