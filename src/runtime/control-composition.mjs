import { createSupervisorControl } from './control-wiring.mjs';
import { createSupervisorCluster } from './cluster-wiring.mjs';
import { loadIntent } from '../intent/model.mjs';
import { createNodeDataReset } from '../lifecycle/node-data-reset.mjs';

export function createSupervisorControlComposition({ db, metadata, managed, applications, reconciler, artifactStore, routingBundles, routingEvent, recovery, observationStore, health, clusterDrain, lifecycle, telemetry, config, identity, intentState, coldState, getColdRecoveryProtocol: liveColdRecoveryProtocol, processController, applyIntent, log, environment = process.env } = {}) {
  if (typeof db?.query !== 'function' || typeof health?.status !== 'function' || typeof clusterDrain?.set !== 'function' || !coldState?.clusterDrain || !coldState?.drain || !processController?.stop || !processController?.start) throw new TypeError('control composition dependencies are required');
  if (!identity?.name || !identity.name.includes('.')) throw new TypeError('shared control identity must be a fully qualified hostname');
  if (!config?.dataDir || !telemetry?.summary || !telemetry?.details || !intentState || typeof applyIntent !== 'function') throw new TypeError('control composition state dependencies are required');
  const cluster = createSupervisorCluster({ query: (...args) => db.query(...args), health, processController, clusterDrain, environment, config, identity });
  let fenced = false;
  let routingExcluded = false;
  const fence = async () => { coldState.clusterDrain.set(true); fenced = true; };
  const excludeRouting = async () => { coldState.clusterDrain.set(true); routingExcluded = true; };
  const isFenced = async () => fenced && coldState.drain.isDraining();
  const isRoutingExcluded = async () => routingExcluded && coldState.drain.isDraining();
  const nodeDataReset = createNodeDataReset({ node: identity.name, dataDir: config.dataDir, getStatus: () => health.status(), getRecoveryState: () => recovery.status(), getDonors: async () => observationStore.all().map((observation) => ({ ...observation, node: observation.node ?? observation.nodeId, healthy: observation.healthy ?? (observation.health === 'ok' || observation.health === 'ready'), primary: observation.primary === true || observation.primary === 'Primary' })), fence, isFenced, excludeRouting, isRoutingExcluded, stop: () => processController.stop(config.shutdownTimeoutMs), restart: processController.start, audit: log });
  return createSupervisorControl({ db: { query: (...args) => db.query(...args) }, metadata, managed, applications, reconciler, artifactStore, routingBundles, routingEvent, recovery, observationStore, lifecycle: cluster, nodeDataReset, getConfig: () => config, getStatus: () => health.status(), getTelemetry: () => telemetry.summary(), getTelemetryDetails: (application) => telemetry.details(application), getTraffic: () => ({ drained: coldState.drain.isDraining(), lifecycle: lifecycle.get(), active: coldState.drain.active(), ...health.cacheInfo() }), setDrain: (value, propagated) => coldState.clusterDrain.set(value, propagated), bootstrap: () => coldState.bootstrapMaria?.(), getColdBootstrap: () => coldState.coldBootstrapService?.(), getColdRecoveryProtocol: liveColdRecoveryProtocol ?? (() => coldState.coldRecoveryProtocol?.()), getColdBootstrapLocal: () => coldState.coldBootstrapLocal?.(), getActiveIntent: Object.assign(() => loadIntent(environment, identity), { ...intentState, apply: (intent) => applyIntent(intent) }), leaseCredentials: (request) => routingBundles.lease(request), identity, environment, log });
}
