import { readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isSyncedPrimary, waitForReady } from './node-reset-readiness.mjs';
import { selectRecoveryDonor } from './node-reset-donors.mjs';
import { validateNodeDataReset } from './node-reset-validation.mjs';

const failure = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });


export function createNodeDataReset({ node, dataDir, getStatus, getRecoveryState = () => ({}), getDonors = async () => [], offlineRecovery = false, fence = async () => {}, isFenced = async () => true, excludeRouting = async () => {}, isRoutingExcluded = async () => true, stop = async () => {}, restart = async () => {}, remove = async (directory) => { for (const entry of await readdir(directory)) await rm(join(directory, entry), { recursive: true, force: true }); }, waitForRejoin = waitForReady, reinclude = async () => {}, resyncTimeoutMs = 120000, resyncPollMs = 1000, audit = {}, idempotency = new Map() } = {}) {
  if (!node || !dataDir || typeof getStatus !== 'function') throw new TypeError('node, dataDir, and status function are required');
  const expectedPath = resolve(dataDir);
  return {
    async reset(request = {}) {
      const key = request.idempotencyKey;
      if (typeof key === 'string' && idempotency.has(key)) return idempotency.get(key);
      const validation = await validateNodeDataReset({ request, node, expectedPath, getStatus, getRecoveryState, offlineRecovery });
      const { dryRun, resync, initialized, status, recovery } = validation;
      let selectedDonor;
      if (resync) {
        const donors = request.offline === true ? [request.donor] : await getDonors();
        selectedDonor = selectRecoveryDonor({ donors, node });
      }
      const result = { node, dataDir: expectedPath, dryRun, initialized, status: dryRun ? 'planned' : 'completed', recoveryDisposition: resync ? 'single-member-resync' : 'reset-initialized-data', next: resync ? 'rejoin-and-receive-sst' : 'explicit-recovery-required', ...(resync ? { donor: selectedDonor } : {}) };
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
