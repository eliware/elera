import { isQuorumReady } from './cluster/quorum-readiness.mjs';

export function createHealthService({ db, timeoutMs, log, elera = true, clusterSize = 1, getTelemetry = () => undefined, getRecoveryState = () => undefined }) {
  let cached; let expiresAt = 0; let inFlight;
  async function fetchStatus() {
    if (!db) throw new Error('database pool is unavailable');
    // A startup probe may quarantine the pool before MariaDB begins accepting
    // connections. Health checks must be able to recover that pool.
    await db.health?.();
    const [rows] = await Promise.race([db.query("SHOW GLOBAL STATUS WHERE Variable_name IN ('wsrep_cluster_state_uuid','wsrep_local_state_comment','wsrep_ready','wsrep_cluster_status','wsrep_cluster_size','wsrep_local_recv_queue','wsrep_local_send_queue','wsrep_flow_control_paused')"), new Promise((_, reject) => setTimeout(() => reject(new Error('status query timeout')), timeoutMs))]);
    const values = Object.fromEntries(rows.map((row) => [row.Variable_name, row.Value]));
    const recovery = getRecoveryState();
    const recoveryBlocked = recovery && ['cluster-unavailable', 'blocked-ambiguous', 'awaiting-quorum', 'recovery-authorized', 'bootstrapping', 'joining', 'collecting-evidence', 'pending'].includes(recovery.state);
    const ready = !elera || (!recoveryBlocked && values.wsrep_local_state_comment === 'Synced' && values.wsrep_ready === 'ON' && values.wsrep_cluster_status === 'Primary' && isQuorumReady(values, { expectedSize: clusterSize }));
    log.debug('Elera status checked', { ready, state: values.wsrep_local_state_comment, wsrepReady: values.wsrep_ready, clusterStatus: values.wsrep_cluster_status });
    return { values, ready, recovery, telemetry: getTelemetry() };
  }
  return {
    status() { if (cached && Date.now() < expiresAt) return Promise.resolve(cached); if (inFlight) return inFlight; inFlight = fetchStatus().then((result) => { cached = result; expiresAt = Date.now() + 1000; return result; }).finally(() => { inFlight = undefined; }); return inFlight; },
    cacheInfo() { return { cached: Boolean(cached), expiresAt }; },
  };
}

export function calculateWeight(values) {
  if (values.wsrep_local_state_comment !== 'Synced' || values.wsrep_ready !== 'ON' || values.wsrep_cluster_status !== 'Primary') return 0;
  const recv = Number(values.wsrep_local_recv_queue); const send = Number(values.wsrep_local_send_queue); const paused = Number(values.wsrep_flow_control_paused);
  if (![recv, send, paused].every(Number.isFinite) || recv > 16 || send > 16 || paused >= 0.05) return 0;
  return Math.max(1, 100 - Math.min(40, Math.floor(Math.max(recv, send) * 40 / 16)) - Math.min(20, Math.floor(paused * 400)));
}
