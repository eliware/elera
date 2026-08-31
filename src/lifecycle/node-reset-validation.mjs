import { resolve } from 'node:path';

const failure = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const confirmationFor = (node) => `RESET ${node}`;

export async function validateNodeDataReset({ request = {}, node, expectedPath, getStatus, getRecoveryState = () => ({}), offlineRecovery = false } = {}) {
  if (request.node !== node) throw failure('node identity does not match this supervisor');
  if (request.dataDir !== undefined && resolve(request.dataDir) !== expectedPath) throw failure('data directory does not match this node');
  if (typeof request.confirmation !== 'string' || request.confirmation !== confirmationFor(node)) throw failure(`confirmation must exactly match ${confirmationFor(node)}`);
  const dryRun = request.dryRun ?? false;
  if (dryRun !== true && dryRun !== false) throw failure('dryRun must be boolean', 400);
  const key = request.idempotencyKey;
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
  return { dryRun, key, status, recovery, resync, initialized };
}
