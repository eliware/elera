import { createBootstrapWatch } from '../cluster/cold-bootstrap/bootstrap-watch.mjs';
import { shouldStartMariaDb } from '../cluster/cold-bootstrap/startup-state.mjs';

export function startSupervisorMariaDb({ processController, config, startupDecision, health, recoveryState, recoveryAudit, recoveryCompletion, coldRecoveryProtocol, startupServer, identity, signals, log, createWatch = createBootstrapWatch, shouldStart = shouldStartMariaDb } = {}) {
  if (!shouldStart({ elera: config.elera, mode: startupDecision.mode, localWinner: startupDecision.localWinner, bootstrapComplete: startupDecision.bootstrapComplete })) {
    log.warn('MariaDB start refused until explicit recovery authority is available', { reason: startupDecision.reason });
    return;
  }
  processController.start().then(() => {
    if (config.elera && startupDecision.mode === 'join') {
      recoveryState.set('joining', { reason: startupDecision.reason });
      recoveryAudit.joinStart({ node: identity.name, epoch: startupDecision.epoch });
    }
    if (config.elera && startupDecision.mode === 'bootstrap' && startupDecision.localWinner === true) {
      const expectedMembership = startupDecision.recoveryEpoch?.quorum?.length ?? config.clusterSize;
      void createWatch({
        health,
        timeoutMs: config.startupTimeoutMs,
        isReady: (result) => result.values?.wsrep_local_state_comment === 'Synced' && result.values?.wsrep_ready === 'ON' && result.values?.wsrep_cluster_status === 'Primary' && Number(result.values?.wsrep_cluster_size) === expectedMembership,
        onTimeout: async () => {
          recoveryState.set('cluster-unavailable', { reason: 'bootstrap did not form a ready Primary view before timeout', epoch: startupDecision.epoch });
          recoveryAudit.failure({ reason: 'bootstrap readiness timeout', epoch: startupDecision.epoch });
          recoveryCompletion?.publish({ epoch: startupDecision.epoch, status: 'failed', reason: 'bootstrap readiness timeout' });
          await processController.stop(config.shutdownTimeoutMs);
          await startupServer?.close();
        },
      })().then(async (result) => {
        if (!result.ready) return;
        await coldRecoveryProtocol?.complete({ epoch: startupDecision.epoch, clusterId: startupDecision.recoveryEpoch?.clusterId, winner: identity.name, membership: startupDecision.recoveryEpoch?.quorum });
        recoveryState.set('complete', { reason: 'bootstrap completed with expected Primary membership', epoch: startupDecision.epoch });
        recoveryCompletion?.publish({ epoch: startupDecision.epoch, status: 'complete', clusterId: startupDecision.recoveryEpoch?.clusterId, winner: identity.name });
        recoveryAudit.completion?.({ epoch: startupDecision.epoch, winner: identity.name });
        await startupServer?.close();
      });
    }
  }).catch((error) => {
    log.error('Failed to start mariadbd', { error });
    void signals.shutdown('mariadbd-error');
  });
}
