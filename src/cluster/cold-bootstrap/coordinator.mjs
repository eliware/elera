import { createColdBootstrapService } from './service.mjs';
import { createOperationLock } from './operation-lock.mjs';
import { createIdempotencyStore } from './idempotency-store.mjs';

export function createColdBootstrapCoordinator({ nodes, local, remote, bootstrapLocal, bootstrapRemote, lockPath, log = {} } = {}) {
  if (!Array.isArray(nodes) || !local || !remote || typeof bootstrapLocal !== 'function') throw new TypeError('cold bootstrap coordinator dependencies are required');
  const evidence = async (node) => node.local ? local() : remote(node.url);
  return createColdBootstrapService({
    nodes,
    readState: async (node) => (await evidence(node)).state,
    recover: async (dataDir) => {
      const node = nodes.find((candidate) => candidate.dataDir === dataDir);
      return (await evidence(node)).state;
    },
    isOnline: async (node) => (await evidence(node)).active,
    bootstrap: async (node) => {
      const target = nodes.find((candidate) => candidate.name === node);
      if (target.local) {
        return bootstrapLocal();
      }
      if (typeof bootstrapRemote !== 'function') {
        throw Object.assign(new Error('remote cold bootstrap is not configured'), { statusCode: 503 });
      }
      return bootstrapRemote(target);
    },
    verifyCandidate: async (candidate) => {
      const current = await evidence(nodes.find((node) => node.name === candidate.node));
      return current.state?.uuid === candidate.uuid && current.state?.seqno === candidate.seqno && current.active !== true;
    },
    lock: createOperationLock({ path: lockPath }),
    idempotencyStore: lockPath ? createIdempotencyStore({ path: `${lockPath}.results.json` }) : undefined,
    log,
  });
}
