import { createSupervisorProcess } from './process-wiring.mjs';
import { createSupervisorIntentApplication } from './intent-application.mjs';
import { createEleraBootstrap } from '../lifecycle/startup.mjs';

export function createSupervisorStartupServices({ args, config, identity = config?.runtimeIdentity, log, recoveryState, recoveryAudit, isRestarting, setRestarting, onFatal, health, loadIntent, intentState, environment = process.env, shuttingDown = () => false, createProcessImpl, createBootstrapImpl } = {}) {
  if (!Array.isArray(args) || !config?.dataDir || !identity?.name || !identity.name.includes('.') || typeof log?.error !== 'function' || typeof isRestarting !== 'function' || typeof setRestarting !== 'function' || typeof onFatal !== 'function' || typeof loadIntent !== 'function' || !intentState) throw new TypeError('startup services require validated config, shared FQDN identity, and lifecycle dependencies');
  const processServices = createSupervisorProcess({ args, config: { ...config, shuttingDown }, log, recoveryState, recoveryAudit, isRestarting, setRestarting, onFatal, createProcessImpl, createBootstrapImpl });
  const applyIntent = createSupervisorIntentApplication({ intentState, processController: processServices.processController, args, config, isRestarting, setRestarting });
  const bootstrapMaria = createEleraBootstrap({ processController: processServices.processController, args, health, timeoutMs: config.timeoutMs, dataDir: config.dataDir, log, isBusy: isRestarting, setBusy: setRestarting });
  return { ...processServices, applyIntent, bootstrapMaria, loadActiveIntent: Object.assign(() => loadIntent(environment, identity), { ...intentState, apply: applyIntent }) };
}
