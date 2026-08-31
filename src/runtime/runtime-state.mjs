import { createTelemetryCollector } from '../telemetry/collector.mjs';
import { createRecoveryControl } from '../recovery/control.mjs';
import { createRecoveryAudit } from '../cluster/cold-bootstrap/audit.mjs';
import { createLifecycleState } from '../lifecycle/state.mjs';
import { createRecoveryState } from '../cluster/cold-bootstrap/recovery-state.mjs';

export function createRuntimeState({ config, log, onLifecycleChange } = {}) {
  const telemetry = createTelemetryCollector();
  const lifecycle = createLifecycleState({ initial: 'serving', onChange: (state) => { telemetry.recordEvent(`lifecycle.${state}`); log.info('Supervisor lifecycle changed', { state }); onLifecycleChange?.(state); } });
  const recoveryState = createRecoveryState(config.elera ? 'pending' : 'joining');
  const recovery = createRecoveryControl({ state: recoveryState, log });
  return { telemetry, lifecycle, recoveryState, recovery, recoveryAudit: createRecoveryAudit(log) };
}
