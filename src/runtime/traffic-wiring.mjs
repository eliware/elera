import { createDrainManager } from '../lifecycle/drain-manager.mjs';
import { createSqlQuiesce } from '../lifecycle/sql-quiesce.mjs';
import { createSqlDrainIntegration } from '../lifecycle/sql-routing.mjs';
import { createDrainPropagation } from '../cluster/drain-propagation.mjs';
import { createDrainEventPublisher } from '../lifecycle/drain-events.mjs';

const isFqdn = (value) => typeof value === 'string' && value.length <= 253 && value.includes('.') && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value);

export function createSupervisorTraffic({ telemetry, identity, config, health, routingBus, log, environment = process.env, getDb, setDrained = () => {}, fetchImpl = fetch } = {}) {
  if (typeof telemetry?.recordEvent !== 'function' || !isFqdn(identity?.name) || !config?.intent?.cluster?.members?.length || typeof health?.status !== 'function' || typeof routingBus?.publish !== 'function' || typeof getDb !== 'function' || typeof setDrained !== 'function' || typeof fetchImpl !== 'function') throw new TypeError('traffic wiring requires validated config, health, telemetry, transport, and shared FQDN identity');
  let drained = false;
  const updateLocalSqlRoute = createSqlDrainIntegration({ getClient: getDb, node: identity.name, log });
  const publishDrainEvent = createDrainEventPublisher({ bus: routingBus, node: identity.name, getReady: () => health.status(), getContext: () => ({ nodeIdentity: identity, reconnectDeadlineMs: config.shutdownTimeoutMs, ...(environment.ELERA_LOAD_BALANCER_ENDPOINT ? { loadBalancerEndpoint: environment.ELERA_LOAD_BALANCER_ENDPOINT } : {}) }), log });
  const drain = createDrainManager({ onChange: (value) => { telemetry.recordEvent(value ? 'traffic.drain' : 'traffic.undrain'); drained = value; setDrained(value); updateLocalSqlRoute(value); log.info(value ? 'Traffic drained' : 'Traffic undrained'); void publishDrainEvent(value); } });
  const sqlQuiesce = createSqlQuiesce({ drain, timeoutMs: config.drainTimeoutMs });
  const peers = config.intent.cluster.members.filter((member) => member.name !== identity.name).map((member) => {
    if (!isFqdn(member.name) || !isFqdn(member.address)) throw new TypeError('traffic peers must use FQDN identities and addresses');
    const url = member.url ?? `http://${member.address}:${config.httpPort}`;
    if (new URL(url).hostname !== member.address) throw new Error(`traffic peer URL ${url} does not match ${member.address}`);
    return url;
  });
  const clusterDrain = createDrainPropagation({ drain, peers, token: environment.ELERA_PEER_TOKEN ?? environment.ROOT_TOKEN, fetchImpl, log });
  const recover = async () => {
    // Recovery must clear the cluster-wide drain as well as this process's
    // local gate. Peer shutdowns can have propagated drain=true here while
    // this node remained running.
    clusterDrain.set(false);
    drained = false;
    setDrained(false);
    updateLocalSqlRoute(false);
    const deadline = Date.now() + Math.max(config.startupTimeoutMs ?? 30000, 30000);
    do {
      if (await publishDrainEvent(false)) return;
      if (Date.now() >= deadline) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (true);
  };
  return { drain, sqlQuiesce, clusterDrain, publishDrainEvent, recover, getDrained: () => drained };
}
