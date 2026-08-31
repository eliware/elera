export const isSyncedPrimary = (status) => status?.values?.wsrep_local_state_comment === 'Synced' && status?.values?.wsrep_ready === 'ON' && status?.values?.wsrep_cluster_status === 'Primary';

export const waitForReady = async ({ getStatus, timeoutMs, intervalMs, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), failure = (message) => new Error(message) }) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      const status = await getStatus();
      if (isSyncedPrimary(status)) return status;
    } catch { /* retry until the readiness deadline */ }
    await sleep(Math.min(intervalMs, Math.max(1, deadline - Date.now())));
  }
  throw failure('single-member-resync did not rejoin as Synced/Primary before timeout', 504);
};
