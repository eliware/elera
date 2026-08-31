import { createLifecycleManager } from '../cluster/lifecycle.mjs';
import { createClusterOperations } from '../cluster/sql-operations.mjs';

export function createSupervisorCluster({ query, health, processController, clusterDrain, environment = process.env, config, createLifecycleManagerImpl = createLifecycleManager } = {}) {
  const operations = createClusterOperations({ query, processController, setDrain: (value) => clusterDrain.set(value) });
  return createLifecycleManagerImpl({ status: () => health.status(), operations, environment, config });
}
