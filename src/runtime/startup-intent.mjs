import { validateIntent } from '../intent/model.mjs';

export async function loadStartupIntent({ intentState, loadEnvironmentIntent, identity, environment = process.env } = {}) {
  if (!intentState || typeof intentState.read !== 'function' || typeof loadEnvironmentIntent !== 'function' || !identity?.name || !identity.name.includes('.')) throw new TypeError('startup intent requires intent state, loader, and shared FQDN identity');
  const intent = (await intentState.read()) ?? await loadEnvironmentIntent(environment, identity);
  validateIntent(intent);
  const local = intent.cluster.members.filter((member) => member.name === identity.name);
  if (local.length !== 1) throw Object.assign(new Error(`startup identity ${identity.name} must match exactly one configured cluster member`), { code: 'RUNTIME_IDENTITY_MEMBERSHIP_MISMATCH', statusCode: 400 });
  return intent;
}
