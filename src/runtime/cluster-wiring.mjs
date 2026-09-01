import { createLifecycleManager } from '../cluster/lifecycle.mjs';
import { createClusterOperations } from '../cluster/sql-operations.mjs';

export function createSupervisorCluster({ query, health, processController, clusterDrain, environment = process.env, config, identity, createLifecycleManagerImpl = createLifecycleManager } = {}) {
  if (typeof query !== 'function' || typeof health?.status !== 'function' || !processController || typeof clusterDrain?.set !== 'function') throw new TypeError('cluster wiring dependencies are required');
  if (!identity?.name || !identity.name.includes('.')) throw new TypeError('runtime cluster identity must be a fully qualified hostname');
  if (!Array.isArray(config?.intent?.cluster?.members) || !config.intent.cluster.members.some((member) => member.name === identity.name)) throw new Error(`runtime cluster identity ${identity?.name ?? '<missing>'} is not a configured member`);
  const operations = createClusterOperations({ query, processController, setDrain: (value) => clusterDrain.set(value) });
  return createLifecycleManagerImpl({ status: () => health.status(), operations, environment, config, identity });
}
