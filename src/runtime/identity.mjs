import { execFileSync } from 'node:child_process';

const fullyQualifiedHostname = () => {
  try { return execFileSync('hostname', ['-f'], { encoding: 'utf8' }).trim(); }
  catch (error) { throw Object.assign(new Error(`hostname -f failed: ${error.message}`), { code: 'RUNTIME_IDENTITY_UNAVAILABLE', cause: error }); }
};
const isFqdn = (value) => typeof value === 'string' && value.length <= 253 && value.includes('.') && /[A-Za-z]/.test(value) && value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));

export function runtimeIdentity({ hostname = fullyQualifiedHostname } = {}) {
  const value = hostname();
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw new Error('hostname -f returned an empty runtime identity');
  if (!isFqdn(name)) throw new Error(`hostname -f returned an invalid fully qualified hostname: ${name}`);
  return Object.freeze({ name });
}
