import { createRoutingPublisher } from './routing-publisher.mjs';
import { startSupervisorCycles } from './cycle-wiring.mjs';

export function startSupervisorRouting({ routingEvent, routingBus, assignments, application, peers, token, store, health, node, clusterId, getDrained, log, publishRoutingEventFactory = createRoutingPublisher, startCycles = startSupervisorCycles } = {}) {
  const publishRoutingEvent = publishRoutingEventFactory({ event: routingEvent, bus: routingBus, assignments, application });
  return startCycles({ peers, token, store, health, node, clusterId, getDrained, publishRoutingEvent, log });
}
