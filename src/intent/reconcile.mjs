import { planIntent } from './model.mjs';

export async function reconcileIntent({ desired, active, apply, reload, restart }) {
  const plan = planIntent(desired, active);
  if (plan.change === 'unsafe') throw Object.assign(new Error(plan.reason), { statusCode: 409, code: 'UNSAFE_INTENT_CHANGE', plan });
  if (!plan.changed) return { ...plan, status: 'unchanged' };
  if (typeof apply !== 'function') throw new TypeError('apply callback is required');
  const result = await apply(desired);
  if (plan.change === 'reload') await reload?.();
  if (plan.change === 'restart') await restart?.();
  return { ...plan, status: 'applied', result };
}
