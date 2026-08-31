import { createMariaDbProcess } from '../lifecycle/mariadb-process.mjs';
import { createColdBootstrapAction } from '../cluster/cold-bootstrap/action.mjs';

export function createSupervisorProcess({ args, config, log, recoveryState, recoveryAudit, isRestarting, setRestarting, onFatal, createProcessImpl = createMariaDbProcess, createBootstrapImpl = createColdBootstrapAction } = {}) {
  const processController = createProcessImpl({
    args,
    log,
    onUnexpectedExit: (code) => {
      if (config.elera) recoveryState.set('cluster-unavailable', { reason: `mariadbd exited with ${code ?? 'unknown'}` });
      if (config.elera) recoveryAudit.failure({ reason: `mariadbd exited with ${code ?? 'unknown'}` });
      if (!isRestarting() && !config.shuttingDown?.()) onFatal(code);
    },
  });
  const bootstrapLocal = createBootstrapImpl({
    processController,
    args,
    timeoutMs: config.timeoutMs,
    log,
    isBusy: isRestarting,
    setBusy: setRestarting,
  });
  return { processController, bootstrapLocal };
}
