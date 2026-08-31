import { createSupervisorControl } from './control-wiring.mjs';
import { createSupervisorCluster } from './cluster-wiring.mjs';
import { loadIntent } from '../intent/model.mjs';
import { createNodeDataReset } from '../lifecycle/node-data-reset.mjs';

export function createSupervisorControlComposition({ db, metadata, managed, applications, reconciler, artifactStore, routingBundles, routingEvent, recovery, observationStore, health, clusterDrain, lifecycle, telemetry, config, intentState, coldState, processController, applyIntent, log, environment = process.env } = {}) {
  const cluster = createSupervisorCluster({ query: (...args) => db.query(...args), health, processController, clusterDrain, environment, config });
  let fenced = false;
  let routingExcluded = false;
  const fence = async (...args) => { coldState.clusterDrain.set(...args); fenced = true; };
  const excludeRouting = async (...args) => { coldState.clusterDrain.set(...args); routingExcluded = true; };
  const isFenced = async () => fenced && coldState.drain.isDraining();
  const isRoutingExcluded = async () => routingExcluded && coldState.drain.isDraining();
  const nodeDataReset = createNodeDataReset({ node: config.runtimeNodeName, dataDir: config.dataDir, getStatus: () => health.status(), getRecoveryState: () => recovery.status(), getDonors: async () => observationStore.all().map((observation) => ({ ...observation, node: observation.node ?? observation.nodeId, healthy: observation.healthy ?? (observation.health === 'ok' || observation.health === 'ready'), primary: observation.primary === true || observation.primary === 'Primary' })), fence, isFenced, excludeRouting, isRoutingExcluded, stop: () => processController.stop(config.shutdownTimeoutMs), restart: processController.start, audit: log });
  return createSupervisorControl({ db: { query: (...args) => db.query(...args) }, metadata, managed, applications, reconciler, artifactStore, routingBundles, routingEvent, recovery, observationStore, lifecycle: cluster, nodeDataReset, getConfig: () => config, getStatus: () => health.status(), getTelemetry: () => telemetry.summary(), getTelemetryDetails: (application) => telemetry.details(application), getTraffic: () => ({ drained: coldState.drain.isDraining(), lifecycle: lifecycle.get(), active: coldState.drain.active(), ...health.cacheInfo() }), setDrain: (value, propagated) => coldState.clusterDrain.set(value, propagated), bootstrap: () => coldState.bootstrapMaria?.(), getColdBootstrap: () => coldState.coldBootstrapService?.(), getColdEvidence: () => coldState.coldEvidence?.(), getColdRecoveryProtocol: () => coldState.coldRecoveryProtocol?.(), getColdBootstrapLocal: () => coldState.coldBootstrapLocal?.(), getActiveIntent: Object.assign(() => loadIntent(environment), { ...intentState, apply: (intent) => applyIntent(intent) }), leaseCredentials: (request) => routingBundles.lease(request), environment, log });
}
