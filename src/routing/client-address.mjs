import { execFileSync } from 'node:child_process';

const command = (argument) => execFileSync('hostname', [argument], { encoding: 'utf8' }).trim();
const resolveDefaultFqdn = () => command('-f');
const fqdnCache = new WeakMap();
const nodeAddressCache = new WeakMap();
const validateFqdn = (value, label) => {
  if (typeof value !== 'string' || value.length > 253 || !value.includes('.') || value.endsWith('.') || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value)) throw Object.assign(new Error(`${label} must be a valid fully qualified hostname`), { code: 'INVALID_RUNTIME_FQDN' });
  return value;
};

export function nodeAddress(environment = process.env, resolveHostname = resolveDefaultFqdn) {
  if (typeof resolveHostname !== 'function') throw new TypeError('hostname resolver must be a function');
  if (!nodeAddressCache.has(resolveHostname)) {
    let value;
    try { value = resolveHostname(); } catch (error) { throw Object.assign(new Error(`hostname -f failed: ${error.message}`), { code: 'RUNTIME_IDENTITY_UNAVAILABLE', cause: error }); }
    nodeAddressCache.set(resolveHostname, validateFqdn(value?.trim(), 'hostname -f output'));
  }
  return nodeAddressCache.get(resolveHostname);
}

export function clientSqlAddress(environment = process.env, resolveFqdn = resolveDefaultFqdn) {
  if (typeof resolveFqdn !== 'function') throw new TypeError('FQDN resolver must be a function');
  if (!fqdnCache.has(resolveFqdn)) {
    let value;
    try { value = resolveFqdn(); } catch (error) { throw Object.assign(new Error(`hostname -f failed: ${error.message}`), { code: 'RUNTIME_IDENTITY_UNAVAILABLE', cause: error }); }
    fqdnCache.set(resolveFqdn, validateFqdn(value?.trim(), 'hostname -f output'));
  }
  return fqdnCache.get(resolveFqdn);
}
