import { readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const confirmationFor = (node) => `RESET ${node}`;
const failure = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });

export function createNodeDataReset({ node, dataDir, getStatus, getRecoveryState = () => ({}), getDonors = async () => [], stop = async () => {}, remove = async (path) => { for (const entry of await readdir(path)) await rm(join(path, entry), { recursive: true, force: true }); }, audit = {}, idempotency = new Map() } = {}) {
  if (!node || !dataDir || typeof getStatus !== 'function') throw new TypeError('node, dataDir, and status function are required');
  const expectedPath = resolve(dataDir);
  return {
    async reset(request = {}) {
      const key = request.idempotencyKey;
      if (typeof key === 'string' && idempotency.has(key)) return idempotency.get(key);
      if (request.node !== node) throw failure('node identity does not match this supervisor');
      if (resolve(request.dataDir ?? '') !== expectedPath) throw failure('data directory does not match this node');
      if (typeof request.confirmation !== 'string' || request.confirmation !== confirmationFor(node)) throw failure(`confirmation must exactly match ${confirmationFor(node)}`);
      const dryRun = request.dryRun ?? false;
      if (dryRun !== true && dryRun !== false) throw failure('dryRun must be boolean', 400);
      if (!dryRun && (typeof key !== 'string' || !key)) throw failure('idempotencyKey is required for an executing reset', 400);
      const status = await getStatus(); const recovery = getRecoveryState() ?? {};
      if (status.ready || status.values?.wsrep_local_state_comment === 'Synced' || status.values?.wsrep_cluster_status === 'Primary') throw failure('healthy, ready, or Primary nodes cannot be reset');
      if (['awaiting-quorum', 'recovery-authorized', 'bootstrapping', 'blocked-ambiguous'].includes(recovery.state) || status.recovery?.state === 'blocked-ambiguous') throw failure('ambiguous or active recovery state refuses reset');
      const initialized = status.values?.wsrep_local_state_comment === 'Initialized' || status.initialized === true;
      const resync = request.recoveryDisposition === 'single-member-resync';
      if (initialized && (request.force !== true || !['reset-initialized-data', 'single-member-resync'].includes(request.recoveryDisposition))) throw failure('initialized data requires force and an explicit recovery disposition');
      if (resync) {
        if (request.fenced !== true || request.routingExcluded !== true) throw failure('single-member-resync requires a fenced and routing-excluded node');
        const donors = await getDonors();
        if (!Array.isArray(donors) || !donors.some((donor) => donor?.healthy === true && donor?.primary === true && donor.node !== node)) throw failure('single-member-resync requires a healthy Primary donor');
      }
      const result = { node, dataDir: expectedPath, dryRun, initialized, status: dryRun ? 'planned' : 'completed', recoveryDisposition: resync ? 'single-member-resync' : 'reset-initialized-data', next: resync ? 'rejoin-and-receive-sst' : 'explicit-recovery-required' };
      if (!dryRun) { await stop(); await remove(expectedPath); }
      audit.reset?.({ ...result, idempotencyKey: key });
      if (typeof key === 'string' && key) idempotency.set(key, result);
      return result;
    },
  };
}
