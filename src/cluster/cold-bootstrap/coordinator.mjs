import { createColdBootstrapService } from './service.mjs';
import { createOperationLock } from './operation-lock.mjs';
import { createIdempotencyStore } from './idempotency-store.mjs';

const isFqdn = (value) => typeof value === 'string' && value.includes('.') && value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));

export function createColdBootstrapCoordinator({ nodes, local, remote, bootstrapLocal, bootstrapRemote, lockPath, log = {} } = {}) {
  if (!Array.isArray(nodes) || !local || !remote || typeof bootstrapLocal !== 'function' || nodes.length === 0 || nodes.some((node) => !isFqdn(node?.name) || (!node.local && (!node.url || !isFqdn(new URL(node.url).hostname)))) || new Set(nodes.map((node) => node.name)).size !== nodes.length) throw new TypeError('cold bootstrap coordinator dependencies require a complete FQDN node inventory');
  const evidence = async (node) => {
    const result = await (node.local ? local() : remote(node.url, node.name));
    if (result?.node && result.node !== node.name) throw Object.assign(new Error(`recovery evidence identity mismatch: expected ${node.name}, received ${result.node}`), { code: 'RECOVERY_EVIDENCE_IDENTITY_MISMATCH' });
    return result;
  };
  return createColdBootstrapService({
    nodes,
    readState: async (node) => (await evidence(node)).state,
    recover: async (dataDir) => {
      const node = nodes.find((candidate) => candidate.dataDir === dataDir);
      if (!node) throw new Error(`no configured node owns recovery data directory: ${dataDir}`);
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
