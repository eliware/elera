import { createSupervisorDb } from './sql-client-wiring.mjs';
import { startSupervisorReadiness } from './startup-readiness.mjs';
import { startSupervisorRouting } from './routing-startup.mjs';

export async function startSupervisorRuntime({ dbEnv, probes, config, health, log, startupDecision, initialIntent, recoveryState, recoveryAudit, identity, routingEvent, routingBus, sharedRoutingAssignments, observationStore, getDrained, environment = process.env, setDb = () => {} } = {}) {
  if (!identity?.name || !identity.name.includes('.') || !config?.httpPort || !initialIntent?.cluster?.members || typeof setDb !== 'function') throw new TypeError('runtime startup requires validated config, intent, database setter, and shared FQDN identity');
  const db = createSupervisorDb({ environment: dbEnv });
  setDb(db);
  const sqlReady = await startSupervisorReadiness({ probes, config, health, log, join: config.elera && ['join', 'rejoin'].includes(startupDecision.mode), startupDecision, initialIntent, recoveryState, recoveryAudit, identity });
  const configuredPeers = initialIntent.cluster.members.filter((member) => member.name !== identity.name);
  const cycles = startSupervisorRouting({ routingEvent, routingBus, assignments: sharedRoutingAssignments, application: environment.ELERA_APPLICATION ?? 'default', peers: configuredPeers, token: environment.ELERA_PEER_TOKEN ?? environment.ROOT_TOKEN, store: observationStore, health, identity, clusterId: initialIntent.cluster.name, getDrained, log });
  return { db, sqlReady, ...cycles };
}
