import { createBootstrapWatch } from '../cluster/cold-bootstrap/bootstrap-watch.mjs';
import { shouldStartMariaDb } from '../cluster/cold-bootstrap/startup-state.mjs';

export function startSupervisorMariaDb({ processController, config, startupDecision, health, recoveryState, recoveryAudit, recoveryCompletion, coldRecoveryProtocol, startupServer, identity, signals, log, createWatch = createBootstrapWatch, shouldStart = shouldStartMariaDb } = {}) {
  if (!processController || typeof processController.start !== 'function' || !config || !startupDecision || typeof health?.status !== 'function' || !identity?.name || !identity.name.includes('.') || typeof log?.error !== 'function') throw new TypeError('MariaDB startup dependencies and shared FQDN identity are required');
  if (typeof recoveryState?.set !== 'function' || typeof recoveryAudit?.failure !== 'function') throw new TypeError('MariaDB recovery state and audit dependencies are required');
  const generation = startupDecision.generation ?? startupDecision.epoch ?? `${identity.name}:${Date.now()}`;
  const recoverySnapshot = () => recoveryState?.snapshot?.() ?? {};
  const isCurrent = () => recoverySnapshot().generation === undefined || recoverySnapshot().generation === generation;
  if (!shouldStart({ elera: config.elera, mode: startupDecision.mode, localWinner: startupDecision.localWinner, bootstrapComplete: startupDecision.bootstrapComplete })) {
    log.warn('MariaDB start refused until explicit recovery authority is available', { reason: startupDecision.reason });
    return;
  }
  Promise.resolve().then(() => processController.start()).then(() => {
    if (config.elera && ['join', 'rejoin'].includes(startupDecision.mode)) {
      recoveryState.set('joining', { reason: startupDecision.reason, generation, epoch: startupDecision.epoch });
      recoveryAudit.joinStart({ node: identity.name, epoch: startupDecision.epoch });
      const minimumMembership = startupDecision.expectedMembership ?? 2;
      const isReady = (result) => result.values?.wsrep_local_state_comment === 'Synced' && result.values?.wsrep_ready === 'ON' && result.values?.wsrep_cluster_status === 'Primary' && Number(result.values?.wsrep_cluster_size) >= minimumMembership;
      void createWatch({
        health,
        timeoutMs: config.startupTimeoutMs,
        isReady,
        onTimeout: async () => {
          if (!isCurrent()) return;
          recoveryState.set('cluster-unavailable', { reason: 'join did not form a ready Primary view before timeout', epoch: startupDecision.epoch, generation });
          recoveryAudit.failure({ reason: 'join readiness timeout', epoch: startupDecision.epoch });
          if (startupDecision.mode === 'join') await processController.stop(config.shutdownTimeoutMs);
        },
      })().then(async (result) => {
        if (!result.ready) return;
        // A result arriving after timeout is accepted only when a fresh SQL
        // sample confirms the node is currently in the required view.
        if (!isCurrent() || !(await health.status().then(isReady).catch(() => false))) return;
        recoveryState.set('complete', { reason: 'join completed with expected Primary membership', epoch: startupDecision.epoch, generation });
        recoveryAudit.completion?.({ node: identity.name, epoch: startupDecision.epoch });
      }).catch((error) => {
        if (!isCurrent() || recoverySnapshot().state === 'complete') return;
        recoveryState.set('cluster-unavailable', { reason: error.message, epoch: startupDecision.epoch, generation });
        recoveryAudit.failure({ reason: error.message, epoch: startupDecision.epoch });
        log.error('MariaDB join readiness failed', { error });
      });
    }
    if (config.elera && startupDecision.mode === 'bootstrap' && startupDecision.localWinner === true) {
      const expectedMembership = 1;
      void createWatch({
        health,
        timeoutMs: config.startupTimeoutMs,
        isReady: (result) => result.values?.wsrep_local_state_comment === 'Synced' && result.values?.wsrep_ready === 'ON' && result.values?.wsrep_cluster_status === 'Primary' && Number(result.values?.wsrep_cluster_size) === expectedMembership,
        onTimeout: async () => {
          if (!isCurrent()) return;
          recoveryState.set('cluster-unavailable', { reason: 'bootstrap did not form a ready Primary view before timeout', epoch: startupDecision.epoch, generation });
          recoveryAudit.failure({ reason: 'bootstrap readiness timeout', epoch: startupDecision.epoch });
          recoveryCompletion?.publish({ epoch: startupDecision.epoch, status: 'failed', reason: 'bootstrap readiness timeout' });
          await processController.stop(config.shutdownTimeoutMs);
          await startupServer?.close();
        },
      })().then(async (result) => {
        if (!result.ready) return;
        if (startupDecision.recoveryEpoch) await coldRecoveryProtocol?.complete({ epoch: startupDecision.epoch, clusterId: startupDecision.recoveryEpoch.clusterId, winner: identity.name, membership: startupDecision.recoveryEpoch.quorum });
        if (!isCurrent()) return;
        recoveryState.set('complete', { reason: startupDecision.recoveryEpoch ? 'bootstrap completed with expected Primary membership' : 'explicit bootstrap completed with expected Primary membership', epoch: startupDecision.epoch, generation });
        if (typeof recoveryCompletion?.publish === 'function' && startupDecision.epoch) recoveryCompletion.publish({ epoch: startupDecision.epoch, status: 'complete', clusterId: startupDecision.recoveryEpoch?.clusterId, winner: identity.name });
        recoveryAudit.completion?.({ epoch: startupDecision.epoch, winner: identity.name });
        await startupServer?.close();
      }).catch((error) => {
        if (!isCurrent() || recoverySnapshot().state === 'complete') return;
        recoveryState.set('cluster-unavailable', { reason: error.message, epoch: startupDecision.epoch, generation });
        recoveryAudit.failure({ reason: error.message, epoch: startupDecision.epoch });
        log.error('MariaDB bootstrap readiness failed', { error });
      });
    }
  }).catch((error) => {
    log.error('Failed to start mariadbd', { error });
    void signals?.shutdown?.('mariadbd-error');
  });
}
