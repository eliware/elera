import { loadIntent, planIntent } from '../intent/model.mjs';

export function createSupervisorIntentApplication({ intentState, processController, args, config, environment = process.env, load = loadIntent, plan = planIntent, isRestarting, setRestarting } = {}) {
  return async function applyIntent(desired) {
    const active = (await intentState.read()) ?? load(environment);
    const change = plan(desired, active);
    if (change.change === 'unsafe') throw Object.assign(new Error(change.reason), { statusCode: 409, code: 'UNSAFE_INTENT_CHANGE' });
    const result = await intentState.apply(desired);
    if (change.change === 'reload') processController.child?.kill('SIGHUP');
    if (change.change === 'restart') {
      setRestarting(true);
      try { await processController.stop(config.timeoutMs); await processController.start(args); }
      finally { setRestarting(false); }
    }
    return result;
  };
}
