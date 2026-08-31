import { createDrainManager } from '../lifecycle/drain-manager.mjs';
import { createSqlQuiesce } from '../lifecycle/sql-quiesce.mjs';
import { createSqlDrainIntegration } from '../lifecycle/sql-routing.mjs';
import { createDrainPropagation } from '../cluster/drain-propagation.mjs';
import { createDrainEventPublisher } from '../lifecycle/drain-events.mjs';

export function createSupervisorTraffic({ telemetry, identity, config, health, routingBus, log, environment = process.env, getDb, setDrained = () => {} } = {}) {
  let drained = false;
  const updateLocalSqlRoute = createSqlDrainIntegration({ getClient: getDb, node: identity.name, log });
  const publishDrainEvent = createDrainEventPublisher({ bus: routingBus, node: identity.name, getReady: () => health.status(), getContext: () => ({ nodeIdentity: identity, reconnectDeadlineMs: config.shutdownTimeoutMs, ...(environment.ELERA_LOAD_BALANCER_ENDPOINT ? { loadBalancerEndpoint: environment.ELERA_LOAD_BALANCER_ENDPOINT } : {}) }), log });
  const drain = createDrainManager({ onChange: (value) => { telemetry.recordEvent(value ? 'traffic.drain' : 'traffic.undrain'); drained = value; setDrained(value); updateLocalSqlRoute(value); log.info(value ? 'Traffic drained' : 'Traffic undrained'); void publishDrainEvent(value); } });
  const sqlQuiesce = createSqlQuiesce({ drain, timeoutMs: config.drainTimeoutMs });
  const clusterDrain = createDrainPropagation({ drain, peers: (environment.ELERA_PEERS ?? '').split(','), token: environment.ELERA_PEER_TOKEN ?? environment.ROOT_TOKEN, log });
  const recover = async () => {
    drained = false;
    setDrained(false);
    updateLocalSqlRoute(false);
    const deadline = Date.now() + Math.min(config.startupTimeoutMs ?? 5000, 5000);
    do {
      if (await publishDrainEvent(false)) return;
      if (Date.now() >= deadline) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (true);
  };
  return { drain, sqlQuiesce, clusterDrain, publishDrainEvent, recover, getDrained: () => drained };
}
