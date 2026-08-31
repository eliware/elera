import { readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const confirmationFor = (node) => `RESET ${node}`;
const failure = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });

const isSyncedPrimary = (status) => status?.values?.wsrep_local_state_comment === 'Synced' && status?.values?.wsrep_ready === 'ON' && status?.values?.wsrep_cluster_status === 'Primary';
const waitForReady = async ({ getStatus, timeoutMs, intervalMs }) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const status = await getStatus().catch(() => undefined);
    if (isSyncedPrimary(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, Math.max(1, deadline - Date.now()))));
  }
  throw failure('single-member-resync did not rejoin as Synced/Primary before timeout', 504);
};

/* c8 ignore next */
export function createNodeDataReset({ node, dataDir, getStatus, getRecoveryState = () => ({}), getDonors = async () => [], offlineRecovery = false, fence = async () => {}, isFenced = async () => true, excludeRouting = async () => {}, isRoutingExcluded = async () => true, stop = async () => {}, restart = async () => {}, remove = async (path) => { for (const entry of await readdir(path)) await rm(join(path, entry), { recursive: true, force: true }); }, waitForRejoin = waitForReady, reinclude = async () => {}, resyncTimeoutMs = 120000, resyncPollMs = 1000, audit = {}, idempotency = new Map() } = {}) {
  if (!node || !dataDir || typeof getStatus !== 'function') throw new TypeError('node, dataDir, and status function are required');
  const expectedPath = resolve(dataDir);
  return {
    async reset(request = {}) {
      const key = request.idempotencyKey;
      if (typeof key === 'string' && idempotency.has(key)) return idempotency.get(key);
      if (request.node !== node) throw failure('node identity does not match this supervisor');
      if (request.dataDir !== undefined && resolve(request.dataDir) !== expectedPath) throw failure('data directory does not match this node');
      if (typeof request.confirmation !== 'string' || request.confirmation !== confirmationFor(node)) throw failure(`confirmation must exactly match ${confirmationFor(node)}`);
      const dryRun = request.dryRun ?? false;
      if (dryRun !== true && dryRun !== false) throw failure('dryRun must be boolean', 400);
      if (!dryRun && (typeof key !== 'string' || !key)) throw failure('idempotencyKey is required for an executing reset', 400);
      let status;
      try { status = await getStatus(); } catch (error) {
        if (!offlineRecovery || request.offline !== true) throw error;
        status = { ready: false, values: {} };
      }
      const recovery = getRecoveryState() ?? {};
      const resync = request.recoveryDisposition === 'single-member-resync';
      if (!resync && (status.ready || status.values?.wsrep_local_state_comment === 'Synced' || status.values?.wsrep_cluster_status === 'Primary')) throw failure('healthy, ready, or Primary nodes cannot be reset');
      if (['awaiting-quorum', 'recovery-authorized', 'bootstrapping', 'blocked-ambiguous'].includes(recovery.state) || status.recovery?.state === 'blocked-ambiguous') throw failure('ambiguous or active recovery state refuses reset');
      const initialized = status.values?.wsrep_local_state_comment === 'Initialized' || status.initialized === true;
      if (initialized && (request.force !== true || !['reset-initialized-data', 'single-member-resync'].includes(request.recoveryDisposition))) throw failure('initialized data requires force and an explicit recovery disposition');
      if (resync) {
        const donors = request.offline === true ? [request.donor] : await getDonors();
        const eligibleDonors = Array.isArray(donors) ? donors.filter((donor) => donor?.healthy === true && donor?.primary === true && donor.node !== node) : [];
        if (eligibleDonors.length !== 1) throw failure(eligibleDonors.length === 0 ? 'single-member-resync requires a healthy Primary donor' : 'single-member-resync refuses ambiguous donor authority');
      }
      const result = { node, dataDir: expectedPath, dryRun, initialized, status: dryRun ? 'planned' : 'completed', recoveryDisposition: resync ? 'single-member-resync' : 'reset-initialized-data', next: resync ? 'rejoin-and-receive-sst' : 'explicit-recovery-required' };
      if (!dryRun) {
        if (resync) {
          await fence();
          await excludeRouting();
          if (!(await isFenced()) || !(await isRoutingExcluded())) throw failure('single-member-resync requires supervisor-verified fencing and routing exclusion');
          if (request.offline !== true) await getStatus();
        }
        await stop();
        await remove(expectedPath);
        if (resync) {
          await restart();
          const verified = await waitForRejoin({ getStatus, timeoutMs: resyncTimeoutMs, intervalMs: resyncPollMs });
          if (!isSyncedPrimary(verified)) throw failure('single-member-resync completed without a ready Primary view', 502);
          await reinclude({ node, status: verified });
          result.status = 'completed';
          result.next = 're-included';
        }
      }
      audit.reset?.({ ...result, idempotencyKey: key });
      if (typeof key === 'string' && key) idempotency.set(key, result);
      return result;
    },
  };
}
