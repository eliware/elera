import { createSupervisorDb } from './sql-client-wiring.mjs';
import { startSupervisorReadiness } from './startup-readiness.mjs';
import { startSupervisorRouting } from './routing-startup.mjs';

export async function startSupervisorRuntime({ dbEnv, probes, config, health, log, startupDecision, initialIntent, recoveryState, recoveryAudit, identity, routingEvent, routingBus, sharedRoutingAssignments, observationStore, getDrained, environment = process.env, setDb = () => {} } = {}) {
  const db = createSupervisorDb({ environment: dbEnv });
  setDb(db);
  const sqlReady = await startSupervisorReadiness({ probes, config, health, log, join: config.elera && ['join', 'rejoin'].includes(startupDecision.mode), startupDecision, initialIntent, recoveryState, recoveryAudit, identity });
  const configuredPeers = environment.ELERA_PEERS ?? initialIntent.cluster.members.filter((member) => member.name !== identity.name).map((member) => `http://${member.address}:${config.httpPort}`).join(',');
  const cycles = startSupervisorRouting({ routingEvent, routingBus, assignments: sharedRoutingAssignments, application: environment.ELERA_APPLICATION ?? 'default', peers: configuredPeers, token: environment.ELERA_PEER_TOKEN ?? environment.ROOT_TOKEN, store: observationStore, health, node: identity.name, clusterId: initialIntent.cluster.name, getDrained, log });
  return { db, sqlReady, ...cycles };
}
